import type { LegacyClientSocket } from '../network/client-socket';
import { createDirectSocket, isDirectSocketsSupported } from '../network/socket-factory';
import { prepareLastROLoginSession, sendLastROLoginPost, type LastROLoginPhase } from '../network/lastro-login-http';
import type { AvailableServerProfile } from '../servers/server-profile';
import { buildClientConfig, type ClientCredentials, type V2ClientConfig } from './client-config';
import { loadClientFonts } from './client-fonts';
import { installDebugAccessGuard } from './debug-access';

export interface BootstrapOptions {
  mount: HTMLElement;
  profile: AvailableServerProfile;
  credentials: ClientCredentials;
  socketFactory?: (host: string, port: number) => LegacyClientSocket;
  runtimeUrl?: string;
}

interface ExecutableAssetManifest {
  files: readonly { path: string; kind: string; bytes: number; sha256: string }[];
}

declare global {
  var ROConfig: V2ClientConfig | undefined;
  var LastRODirectSocketFactory: ((host: string, port: number) => LegacyClientSocket) | undefined;
  var LastROLoginRegistration: ((phase: LastROLoginPhase, nid: number, username: string, password: string) => void) | undefined;
  var LastRODirectSocketsSupported: boolean | undefined;
  var LastROResourceRoots: readonly string[] | undefined;
  var LastROExecutableManifest: ExecutableAssetManifest | undefined;
}

const LASTRO_RESOURCE_ROOTS = Object.freeze([
  'https://game.lastro.cn/ro/client_re/',
  'https://rodata.ltsd.ro/ro/client_re/'
] as const);

export async function parseExecutableAssetManifest(response: Response): Promise<ExecutableAssetManifest> {
  if (!response.ok) throw new Error(`核心资源清单加载失败 (${response.status})`);
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('json')) {
    throw new Error(`核心资源清单返回了 ${contentType || '非 JSON 内容'}；请重启 Vite 开发服务器后再安装 Dev Proxy`);
  }
  const manifest = await response.json() as ExecutableAssetManifest;
  if (!manifest || !Array.isArray(manifest.files)) throw new Error('核心资源清单格式无效');
  const files = manifest.files.map(entry => Object.freeze({ ...entry }));
  return Object.freeze({ files: Object.freeze(files) });
}

async function loadExecutableManifest(): Promise<ExecutableAssetManifest> {
  const response = await fetch(new URL('/core/executable-assets.json', window.location.href));
  return parseExecutableAssetManifest(response);
}

export async function bootstrapV2Client(options: BootstrapOptions): Promise<void> {
  if (options.runtimeUrl !== undefined && options.runtimeUrl !== '/runtime/Online.js') throw new Error('只能加载客户端内置运行程序');
  globalThis.LastRODirectSocketsSupported = isDirectSocketsSupported();
  if (!globalThis.LastRODirectSocketsSupported) {
    throw new Error('当前页面不支持 Direct TCP。请安装客户端并从 Chrome 的 IWA 应用入口打开，不要直接访问本地开发服务器地址。');
  }
  installDebugAccessGuard(window);
  globalThis.ROConfig = buildClientConfig(options.profile, options.credentials);
  globalThis.LastRODirectSocketFactory = options.socketFactory ?? createDirectSocket;
  const mount = options.mount;
  globalThis.LastROLoginRegistration = (phase, nid, username, password) => {
    void sendLastROLoginPost(phase, nid, username, password).catch(() => {
      // Never include credentials, request bodies or server responses in UI/logs.
      let warning = document.getElementById('lastro-secure-login-status');
      if (!warning) {
        warning = document.createElement('p'); warning.id = 'lastro-secure-login-status';
        warning.setAttribute('role', 'alert'); mount.prepend(warning);
      }
      warning.textContent = '登录辅助请求未完成，请检查服务器连接。';
    });
  };
  // Fetch Yii2's CSRF cookie/token before the login packet is sent. The checkin POST
  // is intentionally fire-and-forget, so doing this work here avoids delaying it
  // until after the game connection has already switched to the map server.
  void prepareLastROLoginSession().catch(() => undefined);
  globalThis.LastROResourceRoots = LASTRO_RESOURCE_ROOTS;
  const [manifest] = await Promise.all([loadExecutableManifest(), loadClientFonts()]);
  globalThis.LastROExecutableManifest = manifest;
  await import(/* @vite-ignore */ '/runtime/Online.js');
}
