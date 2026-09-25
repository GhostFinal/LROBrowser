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
  var LastRODirectSocketsSupported: boolean | undefined;
  var LastROResourceRoots: readonly string[] | undefined;
  var LastROExecutableManifest: ExecutableAssetManifest | undefined;
}

const LASTRO_RESOURCE_ROOTS = Object.freeze([
  'https://game.lastro.cn/ro/client_re/',
  'https://clientdata.ltsd.ro/ro/client_re/'
] as const);

export async function parseExecutableAssetManifest(response: Response): Promise<ExecutableAssetManifest> {
  if (!response.ok) throw new Error(`核心资源清单加载失败 (${response.status})`);
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('json')) {
    throw new Error(`核心资源清单返回了 ${contentType || '非 JSON 内容'}；请重启 Vite 开发服务器后再安装 Dev Proxy`);
  }
  const manifest = await response.json() as ExecutableAssetManifest;
  if (!Array.isArray(manifest.files)) throw new Error('核心资源清单格式无效');
  return manifest;
}

async function loadExecutableManifest(): Promise<ExecutableAssetManifest> {
  const response = await fetch(new URL('../core/executable-assets.json', new URL('/runtime/Online.js', document.baseURI)));
  return parseExecutableAssetManifest(response);
}

export async function bootstrapV2Client(options: BootstrapOptions): Promise<void> {
  globalThis.LastRODirectSocketsSupported = isDirectSocketsSupported();
  globalThis.ROConfig = buildClientConfig(options.profile, options.credentials);
  globalThis.LastRODirectSocketFactory = options.socketFactory ?? createDirectSocket;
  globalThis.LastROResourceRoots = LASTRO_RESOURCE_ROOTS;
  globalThis.LastROExecutableManifest = await loadExecutableManifest();
  const runtimeUrl = options.runtimeUrl ?? '/runtime/Online.js';
  await import(/* @vite-ignore */ runtimeUrl);
}
