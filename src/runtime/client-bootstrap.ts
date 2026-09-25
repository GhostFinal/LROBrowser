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

declare global {
  var ROConfig: V2ClientConfig | undefined;
  var LastRODirectSocketFactory: ((host: string, port: number) => LegacyClientSocket) | undefined;
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
  const runtimeUrl = options.runtimeUrl ?? '/runtime/Online.js';
  await import(/* @vite-ignore */ runtimeUrl);
}
