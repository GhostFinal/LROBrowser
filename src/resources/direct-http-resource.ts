const RESOURCE_ROOTS = new Map([
  ['https://game.lastro.cn', 'game.lastro.cn'],
  ['https://clientdata.ltsd.ro', 'clientdata.ltsd.ro'],
]);

const REQUEST_HEADERS = [
  ['Accept', '*/*'],
  ['Accept-Encoding', 'identity'],
  ['Connection', 'close'],
];

const DEFAULT_OPEN_TIMEOUT_MS = 8_000;
const DEFAULT_READ_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_HEADER_BYTES = 64 * 1024;
const DEFAULT_MAX_BODY_BYTES = 128 * 1024 * 1024;

interface DirectHttpOptions {
  TCPSocket?: DirectTcpConstructor;
  openTimeoutMs?: number;
  readTimeoutMs?: number;
  maxHeaderBytes?: number;
  maxBodyBytes?: number;
}

interface DirectHttpResponseParts {
  status: number;
  statusText: string;
  headers: Headers;
  body: ArrayBuffer;
}

function abortError(): DOMException {
  return new DOMException('The operation was aborted', 'AbortError');
}

function timeoutError(kind: 'open' | 'read'): Error {
  return new Error(`Direct HTTP ${kind} timeout`);
}

function asUrl(input: RequestInfo | URL): URL {
  if (typeof input === 'string') return new URL(input);
  if (input instanceof URL) return new URL(input.href);
  return new URL(input.url);
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  const inputMethod = typeof input === 'object' && input !== null && 'method' in input
    ? String(input.method)
    : 'GET';
  return (init?.method ?? inputMethod).toUpperCase();
}

function requestSignal(input: RequestInfo | URL, init?: RequestInit): AbortSignal | undefined {
  if (init?.signal) return init.signal;
  if (typeof Request !== 'undefined' && input instanceof Request) return input.signal;
  return undefined;
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
  if (size > maxBytes) throw new Error('Direct HTTP response body is too large');
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function parseChunkedBody(body: Uint8Array, maxBodyBytes: number): Uint8Array {
  const chunks: Uint8Array[] = [];
  let offset = 0;
  let total = 0;
  while (true) {
    const lineEnd = findBytes(body, [13, 10], offset);
    if (lineEnd < 0) throw new Error('Direct HTTP chunk size is incomplete');
    const sizeLine = ascii(body.subarray(offset, lineEnd));
    const sizeMatch = /^([0-9a-f]+)(?:;.*)?$/i.exec(sizeLine);
    if (!sizeMatch) throw new Error('Direct HTTP chunk size is invalid');
    const size = Number.parseInt(sizeMatch[1]!, 16);
    if (!Number.isSafeInteger(size)) throw new Error('Direct HTTP chunk size is invalid');
    offset = lineEnd + 2;
    if (size === 0) {
      if (body[offset] === 13 && body[offset + 1] === 10) return joinBytes(chunks, maxBodyBytes);
      const trailerEnd = findBytes(body, [13, 10, 13, 10], offset);
      if (trailerEnd < 0) throw new Error('Direct HTTP chunk trailers are incomplete');
      return joinBytes(chunks, maxBodyBytes);
    }
    if (size > maxBodyBytes - total || offset + size + 2 > body.byteLength) {
      throw new Error('Direct HTTP response body is too large or incomplete');
    }
    chunks.push(body.slice(offset, offset + size));
    total += size;
    offset += size;
    if (body[offset] !== 13 || body[offset + 1] !== 10) throw new Error('Direct HTTP chunk terminator is missing');
    offset += 2;
  }
}

function parseResponse(bytes: Uint8Array, maxHeaderBytes: number, maxBodyBytes: number): DirectHttpResponseParts {
  const separator = findBytes(bytes, [13, 10, 13, 10]);
  const headerBytes = separator < 0 ? -1 : separator + 4;
  if (separator < 0 || headerBytes > maxHeaderBytes) throw new Error('Direct HTTP response headers are incomplete or too large');
  const lines = ascii(bytes.subarray(0, separator)).split('\r\n');
  const statusLine = lines.shift();
  const statusMatch = statusLine ? /^HTTP\/1\.[01] ([1-5][0-9]{2})(?: (.*))?$/.exec(statusLine) : null;
  if (!statusMatch) throw new Error('Direct HTTP response status is invalid');
  const headers = new Headers();
  let contentLength: number | undefined;
  let transferEncoding: string | undefined;
  for (const line of lines) {
    const colon = line.indexOf(':');
    if (colon <= 0) throw new Error('Direct HTTP response header is invalid');
    const name = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name)) throw new Error('Direct HTTP response header is invalid');
    headers.append(name, value);
    if (name.toLowerCase() === 'content-length') {
      if (!/^\d+$/.test(value)) throw new Error('Direct HTTP content-length is invalid');
      const parsed = Number(value);
      if (!Number.isSafeInteger(parsed) || (contentLength !== undefined && contentLength !== parsed)) {
        throw new Error('Direct HTTP content-length is conflicting or too large');
      }
      contentLength = parsed;
    }
    if (name.toLowerCase() === 'transfer-encoding') {
      const encodings = value.split(',').map(encoding => encoding.trim().toLowerCase());
      if (transferEncoding !== undefined || encodings.length !== 1 || encodings[0] !== 'chunked') {
        throw new Error('Direct HTTP transfer encoding is unsupported');
      }
      transferEncoding = 'chunked';
    }
    if (name.toLowerCase() === 'content-encoding' && value && value.toLowerCase() !== 'identity') {
      throw new Error('Direct HTTP content encoding is unsupported');
    }
  }
  if (contentLength !== undefined && transferEncoding !== undefined) {
    throw new Error('Direct HTTP response has both content-length and transfer-encoding');
  }
  const bodyStart = separator + 4;
  const rawBody = bytes.subarray(bodyStart);
  let body: Uint8Array;
  if (transferEncoding === 'chunked') {
    body = parseChunkedBody(rawBody, maxBodyBytes);
  } else if (contentLength !== undefined) {
    if (contentLength > maxBodyBytes || rawBody.byteLength !== contentLength) {
      throw new Error('Direct HTTP content-length does not match the response body');
    }
    body = rawBody.slice();
  } else {
    body = rawBody.slice();
    if (body.byteLength > maxBodyBytes) throw new Error('Direct HTTP response body is too large');
  }
  return {
    status: Number(statusMatch[1]),
    statusText: statusMatch[2] ?? '',
    headers,
    body: body.slice().buffer as ArrayBuffer,
  };
}

async function closeNative(native: DirectTcpConnection): Promise<void> {
  try { await native.close(); } catch { /* best effort */ }
}

async function waitFor<T>(promise: Promise<T>, timeoutMs: number, signal: AbortSignal | undefined, phase: 'open' | 'read'): Promise<T> {
  if (signal?.aborted) throw abortError();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abortHandler: (() => void) | undefined;
  try {
    return await new Promise<T>((resolve, reject) => {
      timer = setTimeout(() => reject(timeoutError(phase)), timeoutMs);
      abortHandler = () => reject(abortError());
      signal?.addEventListener('abort', abortHandler, { once: true });
      promise.then(resolve, reject);
    });
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (abortHandler) signal?.removeEventListener('abort', abortHandler);
  }
}

async function readResponse(
  native: DirectTcpConnection,
  opened: { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> },
  request: Uint8Array,
  options: Required<Pick<DirectHttpOptions, 'readTimeoutMs' | 'maxHeaderBytes' | 'maxBodyBytes'>> & { signal?: AbortSignal },
): Promise<DirectHttpResponseParts> {
  const reader = opened.readable.getReader();
  const writer = opened.writable.getWriter();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    await waitFor(writer.write(request), options.readTimeoutMs, options.signal, 'read');
    while (true) {
      const result = await waitFor(reader.read(), options.readTimeoutMs, options.signal, 'read');
      if (result.done) break;
      if (!result.value) continue;
      total += result.value.byteLength;
      if (total > options.maxHeaderBytes + options.maxBodyBytes) throw new Error('Direct HTTP response is too large');
      chunks.push(result.value.slice());
    }
    return parseResponse(joinBytes(chunks, options.maxHeaderBytes + options.maxBodyBytes), options.maxHeaderBytes, options.maxBodyBytes);
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
    await writer.abort().catch(() => undefined);
    writer.releaseLock();
    await closeNative(native);
  }
}

export function createDirectHttpFetch(options: DirectHttpOptions = {}): typeof globalThis.fetch {
  const constructorForSocket = options.TCPSocket ?? globalThis.TCPSocket;
  const openTimeoutMs = Math.max(1, options.openTimeoutMs ?? DEFAULT_OPEN_TIMEOUT_MS);
  const readTimeoutMs = Math.max(1, options.readTimeoutMs ?? DEFAULT_READ_TIMEOUT_MS);
  const maxHeaderBytes = Math.max(1, options.maxHeaderBytes ?? DEFAULT_MAX_HEADER_BYTES);
  const maxBodyBytes = Math.max(1, options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES);
  return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = asUrl(input);
    const host = RESOURCE_ROOTS.get(url.origin);
    if (!host) throw new Error('Direct HTTP only permits approved resource origins');
    if (!url.pathname.startsWith('/ro/client_re/') || url.search || url.hash) {
      throw new Error('Direct HTTP only permits passive resource paths');
    }
    if (requestMethod(input, init) !== 'GET' || init?.body !== undefined) {
      throw new Error('Direct HTTP only supports GET requests');
    }
    if (!constructorForSocket) throw new Error('Direct TCP is unavailable');
    const signal = requestSignal(input, init);
    const native = new constructorForSocket(host, 80, { noDelay: true, keepAlive: true });
    void native.closed.catch(() => undefined);
    let opened = false;
    try {
      const connection = await waitFor(native.opened, openTimeoutMs, signal, 'open');
      opened = true;
      const request = new TextEncoder().encode([
        `GET ${url.pathname} HTTP/1.1`,
        `Host: ${host}`,
        ...REQUEST_HEADERS.map(([name, value]) => `${name}: ${value}`),
        '',
        '',
      ].join('\r\n'));
      const parsed = await readResponse(native, connection, request, { readTimeoutMs, maxHeaderBytes, maxBodyBytes, signal });
      const body = parsed.status === 204 || parsed.status === 205 || parsed.status === 304 ? null : parsed.body;
      return new Response(body, { status: parsed.status, statusText: parsed.statusText, headers: parsed.headers });
    } catch (error) {
      if (!opened) await closeNative(native);
      throw error;
    }
  }) as typeof globalThis.fetch;
}
