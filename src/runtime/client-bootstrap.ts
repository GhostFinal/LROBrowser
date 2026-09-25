import type { LegacyClientSocket } from '../network/client-socket';
import { createDirectSocket, isDirectSocketsSupported } from '../network/socket-factory';
import type { AvailableServerProfile } from '../servers/server-profile';
import { buildClientConfig, type ClientCredentials, type V2ClientConfig } from './client-config';

export interface BootstrapOptions {
  mount: HTMLElement;
  profile: AvailableServerProfile;
  credentials: ClientCredentials;
  socketFactory?: (host: string, port: number) => LegacyClientSocket;
  runtimeUrl?: string;
}

interface ExecutableAssetManifest {
  files: readonly { path: string; kind: string }[];
}

declare global {
  var ROConfig: V2ClientConfig | undefined;
  var LastRODirectSocketFactory: ((host: string, port: number) => LegacyClientSocket) | undefined;
  var LastROResourceRoots: readonly string[] | undefined;
  var LastROExecutableManifest: ExecutableAssetManifest | undefined;
}

const LASTRO_RESOURCE_ROOTS = Object.freeze([
  'https://game.lastro.cn/ro/client_re/',
  'https://clientdata.ltsd.ro/ro/client_re/'
] as const);

async function loadExecutableManifest(): Promise<ExecutableAssetManifest> {
  const response = await fetch(new URL('../core/executable-assets.json', new URL('/runtime/Online.js', document.baseURI)));
  if (!response.ok) throw new Error(`核心资源清单加载失败 (${response.status})`);
  const manifest = await response.json() as ExecutableAssetManifest;
  if (!Array.isArray(manifest.files)) throw new Error('核心资源清单格式无效');
  return manifest;
}

export async function bootstrapV2Client(options: BootstrapOptions): Promise<void> {
  if (!isDirectSocketsSupported()) {
    options.mount.replaceChildren();
    const message = document.createElement('p');
    message.setAttribute('role', 'alert');
    message.textContent = '当前环境不支持 Direct TCP。请使用支持 Direct Sockets 的 Chrome IWA 安装包。';
    options.mount.append(message);
    throw new Error('当前环境不支持 Direct TCP');
  }
  globalThis.ROConfig = buildClientConfig(options.profile, options.credentials);
  globalThis.LastRODirectSocketFactory = options.socketFactory ?? createDirectSocket;
  globalThis.LastROResourceRoots = LASTRO_RESOURCE_ROOTS;
  globalThis.LastROExecutableManifest = await loadExecutableManifest();
  const runtimeUrl = options.runtimeUrl ?? '/runtime/Online.js';
  await import(/* @vite-ignore */ runtimeUrl);
}
