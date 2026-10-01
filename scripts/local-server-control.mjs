import { mkdir, readFile, writeFile, rename, unlink, open } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createConnection } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';
import { SERVER_KIND, SERVER_ROOT, SERVER_PORT, SERVER_DIRECTORY, SERVER_STATE_PATH, SERVER_LOG_PATH, SERVER_STATUS_PATH } from './local-server.mjs';

const service = path.join(SERVER_ROOT, 'scripts/local-server.mjs');
const baseUrl = `http://127.0.0.1:${SERVER_PORT}`;
const psQuote = text => "'" + text.replaceAll("'", "''") + "'";
const commandLine = id => `"${process.execPath}" "${service}" --managed ${id}`;
function powershell(code) {
  const output = execFileSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', "$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[Text.UTF8Encoding]::new(); " + code], { cwd: SERVER_ROOT, encoding: 'utf8', windowsHide: true, timeout: 15000, maxBuffer: 65536 });
  return JSON.parse(output.trim());
}
function processInfo(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  return powershell(`$p=Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}'; if ($null -eq $p) { 'null' } else { $p | Select-Object ProcessId,ExecutablePath,CommandLine | ConvertTo-Json -Compress }`);
}
export function ownsProcess(state, info, expectedCommand = commandLine(state?.instanceId)) {
  return state?.kind === SERVER_KIND && state.root === SERVER_ROOT && /^[0-9a-f-]{36}$/.test(state.instanceId)
    && info?.ProcessId === state.pid && info.ExecutablePath?.toLowerCase() === process.execPath.toLowerCase()
    && info.CommandLine === expectedCommand;
}
async function readState() {
  try { return JSON.parse(await readFile(SERVER_STATE_PATH, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function health() {
  try {
    const response = await globalThis.fetch(baseUrl + SERVER_STATUS_PATH, { signal: globalThis.AbortSignal.timeout(1200), redirect: 'error' });
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return null;
    const result = await response.json();
    return result.kind === SERVER_KIND && result.root === SERVER_ROOT ? result : null;
  } catch { return null; }
}
async function portOccupied() {
  return new Promise(resolve => {
    const socket = createConnection({ host: '127.0.0.1', port: SERVER_PORT });
    const finish = value => { socket.destroy(); resolve(value); };
    socket.once('connect', () => finish(true)); socket.once('error', () => finish(false)); socket.setTimeout(1000, () => finish(true));
  });
}
async function withLock(action) {
  await mkdir(SERVER_DIRECTORY, { recursive: true });
  const filename = path.join(SERVER_DIRECTORY, 'control.lock');
  let lock;
  for (let attempt = 0; attempt < 30 && !lock; attempt++) {
    try { lock = await open(filename, 'wx'); await lock.writeFile(String(process.pid)); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const owner = Number(await readFile(filename, 'utf8').catch(() => ''));
      if (Number.isInteger(owner) && owner > 0 && !processInfo(owner)) { await unlink(filename).catch(() => {}); continue; }
      await delay(300);
    }
  }
  if (!lock) throw new Error('另一个启动或停止操作正在运行，请稍后重试。');
  try { return await action(); }
  finally { await lock.close(); await unlink(filename).catch(() => {}); }
}
async function saveState(state) {
  const temporary = SERVER_STATE_PATH + '.tmp';
  await writeFile(temporary, JSON.stringify(state, null, 2), 'utf8'); await rename(temporary, SERVER_STATE_PATH);
}
async function start() {
  const state = await withLock(async () => {
    const previous = await readState();
    if (previous && ownsProcess(previous, processInfo(previous.pid))) return previous;
    if (await portOccupied()) throw new Error('5173 端口已被其他程序占用，未停止或修改该程序。');
    const instanceId = randomUUID();
    const result = powershell(`$startup=New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ShowWindow=[uint16]0}; $r=Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine=${psQuote(commandLine(instanceId))}; CurrentDirectory=${psQuote(SERVER_ROOT)}; ProcessStartupInformation=$startup}; $r | Select-Object ReturnValue,ProcessId | ConvertTo-Json -Compress`);
    if (result.ReturnValue !== 0) throw new Error(`后台服务器启动失败（Windows 返回 ${result.ReturnValue}）。`);
    const created = { kind: SERVER_KIND, root: SERVER_ROOT, pid: result.ProcessId, instanceId };
    await saveState(created); return created;
  });
  process.stdout.write('正在启动本地服务器，请稍候……\n');
  for (let attempt = 0; attempt < 90; attempt++) {
    const status = await health();
    if (status?.pid === state.pid && status.instanceId === state.instanceId && status.ready) {
      process.stdout.write(`本地服务器已运行：${baseUrl}\n请重新打开原来的 RO 客户端。关闭此窗口不会停止服务器。\n`); return;
    }
    if (attempt % 10 === 0 && !ownsProcess(state, processInfo(state.pid))) throw new Error(`服务器未能启动，请查看日志：${SERVER_LOG_PATH}`);
    await delay(1000);
  }
  throw new Error(`服务器仍在准备，请稍后再次双击启动。日志：${SERVER_LOG_PATH}`);
}
async function stop() {
  await withLock(async () => {
    const state = await readState();
    if (!state) { process.stdout.write('本地服务器未运行。\n'); return; }
    const info = processInfo(state.pid);
    if (!info) { await unlink(SERVER_STATE_PATH).catch(error => { if (error.code !== 'ENOENT') throw error; }); process.stdout.write('本地服务器已停止。\n'); return; }
    if (!ownsProcess(state, info)) throw new Error('进程身份与本地服务器记录不符，未停止任何程序。');
    const active = await health();
    if (active?.pid !== state.pid || active.instanceId !== state.instanceId || !active.ready) throw new Error('服务器正在准备或启动，请准备完成后再停止。');
    const result = powershell(`$p=Get-CimInstance Win32_Process -Filter 'ProcessId = ${state.pid}'; if ($null -eq $p) { '{"ReturnValue":0}' } elseif ($p.CommandLine -cne ${psQuote(commandLine(state.instanceId))} -or $p.ExecutablePath -ine ${psQuote(process.execPath)}) { throw 'Server process identity changed' } else { Invoke-CimMethod -InputObject $p -MethodName Terminate | Select-Object ReturnValue | ConvertTo-Json -Compress }`);
    if (result.ReturnValue !== 0) throw new Error(`停止服务器失败（Windows 返回 ${result.ReturnValue}）。`);
    await unlink(SERVER_STATE_PATH).catch(error => { if (error.code !== 'ENOENT') throw error; });
    process.stdout.write('本地服务器已停止。\n');
  });
}
async function status() {
  const state = await readState();
  const result = await health();
  if (state && result?.pid === state.pid && result.instanceId === state.instanceId) process.stdout.write(`本地服务器正在运行：${baseUrl}${result.ready ? '' : '（客户端资源正在准备）'}\n`);
  else process.stdout.write('本地服务器未就绪。双击启动脚本即可启动。\n');
}
async function main() {
  if (process.platform !== 'win32') throw new Error('此启动入口适用于 Windows。');
  const action = { start, stop, status }[process.argv[2]];
  if (!action) throw new Error('参数应为 start、stop 或 status。');
  await action();
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });
