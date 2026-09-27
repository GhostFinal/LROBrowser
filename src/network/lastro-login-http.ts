const LASTRO_LOGIN_HOST = 'game.lastro.cn';
const LASTRO_LOGIN_PORT = 80;
const LASTRO_LOGIN_BOOTSTRAP_PATH = '/?r=pc/index';
const DEFAULT_OPEN_TIMEOUT_MS = 8_000;
const DEFAULT_READ_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 512 * 1024;

export type LastROLoginPhase = 'check' | 'checkin';

export interface LastROLoginRequest {
  host: string;
  port: number;
  path: string;
  body: string;
  bytes: Uint8Array;
}

export interface LastROLoginHttpOptions {
  TCPSocket?: DirectTcpConstructor;
  openTimeoutMs?: number;
  readTimeoutMs?: number;
}

interface LastROLoginSession {
  cookie: string;
  csrfToken: string;
}

interface RawHttpResponse {
  status: number;
  headers: Map<string, string[]>;
  body: Uint8Array;
}

const LOGIN_FIELDS: Readonly<Record<number, string>> = Object.freeze({
  3: 'Login_cn2',
  4: 'Login_ts',
  5: 'Login_debug',
});

const sessionCache = new WeakMap<DirectTcpConstructor, Promise<LastROLoginSession>>();

function waitFor<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(value => {
      clearTimeout(timer);
      resolve(value);
    }, error => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function findBytes(bytes: Uint8Array, pattern: readonly number[], start = 0): number {
  outer: for (let offset = start; offset <= bytes.byteLength - pattern.length; offset += 1) {
    for (let index = 0; index < pattern.length; index += 1) {
      if (bytes[offset + index] !== pattern[index]) continue outer;
    }
    return offset;
  }
  return -1;
}

function ascii(bytes: Uint8Array): string {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return value;
}

function joinBytes(chunks: readonly Uint8Array[], maxBytes: number): Uint8Array {
  const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  if (size > maxBytes) throw new Error('LastRO login HTTP response is too large');
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function parseChunkedBody(body: Uint8Array): Uint8Array {
  const chunks: Uint8Array[] = [];
  let offset = 0;
  let total = 0;
  while (true) {
    const lineEnd = findBytes(body, [13, 10], offset);
    if (lineEnd < 0) throw new Error('LastRO login HTTP chunk size is incomplete');
    const sizeLine = ascii(body.subarray(offset, lineEnd));
    const sizeMatch = /^([0-9a-f]+)(?:;.*)?$/i.exec(sizeLine);
    if (!sizeMatch) throw new Error('LastRO login HTTP chunk size is invalid');
    const size = Number.parseInt(sizeMatch[1]!, 16);
    if (!Number.isSafeInteger(size)) throw new Error('LastRO login HTTP chunk size is invalid');
    offset = lineEnd + 2;
    if (size === 0) {
      if (body[offset] === 13 && body[offset + 1] === 10) return joinBytes(chunks, MAX_RESPONSE_BYTES);
      const trailerEnd = findBytes(body, [13, 10, 13, 10], offset);
      if (trailerEnd < 0) throw new Error('LastRO login HTTP chunk trailers are incomplete');
      return joinBytes(chunks, MAX_RESPONSE_BYTES);
    }
    if (size > MAX_RESPONSE_BYTES - total || offset + size + 2 > body.byteLength) {
      throw new Error('LastRO login HTTP response body is too large or incomplete');
    }
    chunks.push(body.slice(offset, offset + size));
    total += size;
    offset += size;
    if (body[offset] !== 13 || body[offset + 1] !== 10) {
      throw new Error('LastRO login HTTP chunk terminator is missing');
    }
    offset += 2;
  }
}

function parseResponse(bytes: Uint8Array): RawHttpResponse {
  const separator = findBytes(bytes, [13, 10, 13, 10]);
  if (separator < 0) throw new Error('LastRO login HTTP response headers are incomplete');
  const lines = ascii(bytes.subarray(0, separator)).split('\r\n');
  const statusLine = lines.shift();
  const statusMatch = statusLine ? /^HTTP\/1\.[01] ([1-5][0-9]{2})(?: (.*))?$/.exec(statusLine) : null;
  if (!statusMatch) throw new Error('LastRO login HTTP response status is invalid');
  const headers = new Map<string, string[]>();
  for (const line of lines) {
    const colon = line.indexOf(':');
    if (colon <= 0) throw new Error('LastRO login HTTP response header is invalid');
    const name = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    const values = headers.get(name) ?? [];
    values.push(value);
    headers.set(name, values);
  }
  const rawBody = bytes.subarray(separator + 4);
  const transferEncoding = headers.get('transfer-encoding')?.join(',').toLowerCase();
  const contentEncoding = headers.get('content-encoding')?.join(',').toLowerCase();
  if (contentEncoding && contentEncoding !== 'identity') {
    throw new Error(`LastRO login HTTP content encoding is unsupported: ${contentEncoding}`);
  }
  if (transferEncoding === 'chunked') return { status: Number(statusMatch[1]), headers, body: parseChunkedBody(rawBody) };
  if (transferEncoding) throw new Error(`LastRO login HTTP transfer encoding is unsupported: ${transferEncoding}`);
  const contentLength = headers.get('content-length')?.at(-1);
  if (contentLength !== undefined) {
    if (!/^\d+$/.test(contentLength)) throw new Error('LastRO login HTTP content length is invalid');
    const expected = Number(contentLength);
    if (!Number.isSafeInteger(expected) || expected > MAX_RESPONSE_BYTES || rawBody.byteLength !== expected) {
      throw new Error('LastRO login HTTP content length does not match the response body');
    }
  }
  if (rawBody.byteLength > MAX_RESPONSE_BYTES) throw new Error('LastRO login HTTP response body is too large');
  return { status: Number(statusMatch[1]), headers, body: rawBody.slice() };
}

async function readResponse(
  native: DirectTcpConnection,
  connection: { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> },
  request: Uint8Array,
  readTimeoutMs: number,
): Promise<RawHttpResponse> {
  const reader = connection.readable.getReader();
  const writer = connection.writable.getWriter();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    await waitFor(writer.write(request), readTimeoutMs, 'LastRO login HTTP write timeout');
    while (true) {
      const result = await waitFor(reader.read(), readTimeoutMs, 'LastRO login HTTP read timeout');
      if (result.done) break;
      if (!result.value) continue;
      total += result.value.byteLength;
      if (total > MAX_RESPONSE_BYTES) throw new Error('LastRO login HTTP response is too large');
      chunks.push(result.value.slice());
    }
    return parseResponse(joinBytes(chunks, MAX_RESPONSE_BYTES));
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
    await writer.abort().catch(() => undefined);
    writer.releaseLock();
    try { await native.close(); } catch { /* best effort */ }
  }
}

function buildBootstrapRequest(): Uint8Array {
  return new TextEncoder().encode([
    `GET ${LASTRO_LOGIN_BOOTSTRAP_PATH} HTTP/1.1`,
    `Host: ${LASTRO_LOGIN_HOST}`,
    'Accept: */*',
    'Accept-Encoding: identity',
    'Connection: close',
    '',
    '',
  ].join('\r\n'));
}

function parseCsrfToken(body: Uint8Array): string {
  const html = new TextDecoder().decode(body);
  const inputPattern = /<input\b[^>]*\bname=["']_csrf["'][^>]*\bvalue=["']([^"']+)["'][^>]*>/i;
  const reversedPattern = /<input\b[^>]*\bvalue=["']([^"']+)["'][^>]*\bname=["']_csrf["'][^>]*>/i;
  const token = inputPattern.exec(html)?.[1] ?? reversedPattern.exec(html)?.[1];
  if (!token) throw new Error('LastRO login HTTP csrf token is missing');
  return token;
}

function parseCsrfCookie(headers: Map<string, string[]>): string {
  const setCookie = headers.get('set-cookie')?.find(value => /(?:^|;)\s*_csrf=/i.test(value));
  const cookie = setCookie?.match(/(?:^|;)\s*(_csrf=[^;]+)/i)?.[1];
  if (!cookie) throw new Error('LastRO login HTTP csrf cookie is missing');
  return cookie;
}

async function loadLastROLoginSession(
  constructorForSocket: DirectTcpConstructor,
  openTimeoutMs: number,
  readTimeoutMs: number,
): Promise<LastROLoginSession> {
  const native = new constructorForSocket(LASTRO_LOGIN_HOST, LASTRO_LOGIN_PORT, { noDelay: true, keepAliveDelay: 60_000 });
  void native.closed.catch(() => undefined);
  let opened = false;
  try {
    const connection = await waitFor(native.opened, openTimeoutMs, 'LastRO login HTTP bootstrap open timeout');
    opened = true;
    const response = await readResponse(native, connection, buildBootstrapRequest(), readTimeoutMs);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`LastRO login HTTP bootstrap failed (${response.status})`);
    }
    return { cookie: parseCsrfCookie(response.headers), csrfToken: parseCsrfToken(response.body) };
  } finally {
    if (!opened) {
      try { await native.close(); } catch { /* best effort */ }
    }
  }
}

function getLastROLoginSession(
  constructorForSocket: DirectTcpConstructor,
  options: LastROLoginHttpOptions,
): Promise<LastROLoginSession> {
  const cached = sessionCache.get(constructorForSocket);
  if (cached) return cached;
  const session = loadLastROLoginSession(
    constructorForSocket,
    Math.max(1, options.openTimeoutMs ?? DEFAULT_OPEN_TIMEOUT_MS),
    Math.max(1, options.readTimeoutMs ?? DEFAULT_READ_TIMEOUT_MS),
  );
  sessionCache.set(constructorForSocket, session);
  session.catch(() => {
    if (sessionCache.get(constructorForSocket) === session) sessionCache.delete(constructorForSocket);
  });
  return session;
}

export async function prepareLastROLoginSession(options: LastROLoginHttpOptions = {}): Promise<void> {
  const constructorForSocket = options.TCPSocket ?? globalThis.TCPSocket;
  if (!constructorForSocket) throw new Error('Direct TCP is unavailable');
  await getLastROLoginSession(constructorForSocket, options);
}

function encodeLoginField(field: string, username: string, password: string, session?: LastROLoginSession): string {
  const values: Array<[string, string]> = [];
  if (session) values.push(['_csrf', session.csrfToken]);
  values.push([`${field}[userid]`, username], [`${field}[user_pass]`, password]);
  return new URLSearchParams(values).toString();
}

export function buildLastROLoginRequest(
  phase: LastROLoginPhase,
  nid: number,
  username: string,
  password: string,
  session?: LastROLoginSession,
): LastROLoginRequest {
  const field = LOGIN_FIELDS[nid];
  if (!field) throw new Error(`LastRO login HTTP does not support nid ${nid}`);
  if (typeof username !== 'string' || typeof password !== 'string') {
    throw new TypeError('LastRO login credentials must be strings');
  }
  const body = encodeLoginField(field, username, password, session);
  const path = `/?r=mg/${phase}&nid=${nid}`;
  const encodedBody = new TextEncoder().encode(body);
  const headers = [
    `POST ${path} HTTP/1.1`,
    `Host: ${LASTRO_LOGIN_HOST}`,
    'Accept: */*',
    'Accept-Language: en,zh;q=0.9,zh-TW;q=0.8,en-US;q=0.7,zh-CN;q=0.6,et;q=0.5,de;q=0.4',
    'Cache-Control: no-cache',
    'Origin: https://game.lastro.cn',
    'Pragma: no-cache',
    'Referer: https://game.lastro.cn/ro/api.html?71.86',
    'DNT: 1',
    'Sec-Fetch-Dest: empty',
    'Sec-Fetch-Mode: cors',
    'Sec-Fetch-Site: same-origin',
    'User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',
    'sec-ch-ua: "Chromium";v="154", "Google Chrome";v="154", "Not A(Brand";v="99"',
    'sec-ch-ua-mobile: ?0',
    'sec-ch-ua-platform: "Linux"',
    'X-Requested-With: XMLHttpRequest',
    'Content-Type: application/x-www-form-urlencoded; charset=UTF-8',
    `Content-Length: ${encodedBody.byteLength}`,
    'Connection: close',
  ];
  if (session) headers.splice(2, 0, `Cookie: ${session.cookie}`);
  const bytes = new TextEncoder().encode([...headers, '', body].join('\r\n'));
  return { host: LASTRO_LOGIN_HOST, port: LASTRO_LOGIN_PORT, path, body, bytes };
}

export async function sendLastROLoginPost(
  phase: LastROLoginPhase,
  nid: number,
  username: string,
  password: string,
  options: LastROLoginHttpOptions = {},
): Promise<void> {
  const constructorForSocket = options.TCPSocket ?? globalThis.TCPSocket;
  if (!constructorForSocket) throw new Error('Direct TCP is unavailable');
  const session = await getLastROLoginSession(constructorForSocket, options);
  const request = buildLastROLoginRequest(phase, nid, username, password, session);
  const native = new constructorForSocket(request.host, request.port, { noDelay: true, keepAliveDelay: 60_000 });
  void native.closed.catch(() => undefined);
  try {
    const connection = await waitFor(native.opened, Math.max(1, options.openTimeoutMs ?? DEFAULT_OPEN_TIMEOUT_MS), 'LastRO login HTTP open timeout');
    const writer = connection.writable.getWriter();
    try {
      await writer.write(request.bytes);
      await writer.close();
    } finally {
      writer.releaseLock();
    }
  } finally {
    try {
      await native.close();
    } catch {
      // Registration is best effort; the game login must remain independent.
    }
  }
}
