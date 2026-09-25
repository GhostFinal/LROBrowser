import type { AvailableServerProfile } from '../servers/server-profile';
import { getAvailableServerProfile } from '../servers/server-profiles';

export interface ClientCredentials {
  username: string;
  password: string;
}

export interface V2ClientConfig {
  readonly servers: readonly [Readonly<Record<string, unknown>>];
  readonly autoLogin: readonly [string, string];
  readonly lastroProtocol: true;
  readonly lastroCustomPackets: true;
  readonly packetKeys: readonly [number, number, number];
  readonly clientHash: string;
  readonly clientVer: number;
  readonly lastroNid: number;
  readonly packetver: number;
  readonly clientRoot: 'core/';
  readonly luaRoot: 'core/data/luafiles514/lua files/';
  readonly systemRoot: 'core/System/';
  readonly customWasmUri: 'core/wasm/liblua5.1.wasm';
  readonly resourceProfileId: 'lastro-public';
}

export function buildClientConfig(profile: AvailableServerProfile, credentials: ClientCredentials): V2ClientConfig {
  const available = getAvailableServerProfile(profile.id);
  if (!credentials.username || !credentials.password) throw new Error('账号资料不完整');
  const server = Object.freeze({
    display: available.displayName,
    address: available.loginAddress,
    port: available.loginPort,
    version: available.version,
    langtype: available.langtype,
    packetver: available.packetver,
  });
  return Object.freeze({
    servers: Object.freeze([server] as const),
    autoLogin: Object.freeze([credentials.username, credentials.password] as const),
    lastroProtocol: true,
    lastroCustomPackets: true,
    packetKeys: Object.freeze([...available.packetKeys] as [number, number, number]),
    clientHash: available.clientHash,
    clientVer: available.clientVer,
    lastroNid: available.lastroNid,
    packetver: available.packetver,
    clientRoot: 'core/',
    luaRoot: 'core/data/luafiles514/lua files/',
    systemRoot: 'core/System/',
    customWasmUri: 'core/wasm/liblua5.1.wasm',
    resourceProfileId: available.resourceProfileId,
  });
}
