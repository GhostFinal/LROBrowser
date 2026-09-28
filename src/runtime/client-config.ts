import type { AvailableServerProfile } from '../servers/server-profile';
import { getAvailableServerProfile, LASTRO_SERVER_PROFILES } from '../servers/server-profiles';

export interface ClientCredentials {
  username: string;
  password: string;
}

export interface V2ClientConfig {
  readonly servers: readonly [Readonly<Record<string, unknown>>];
  readonly autoLogin: readonly [string, string] | null;
  readonly loginServerProfiles: readonly Readonly<Record<string, unknown>>[];
  readonly lastroProtocol: true;
  readonly lastroCustomPackets: true;
  readonly packetKeys: readonly [number, number, number];
  readonly clientHash: string;
  readonly clientVer: number;
  readonly lastroNid: number;
  readonly lastroLoginCheck: boolean;
  readonly lastroLoginCheckin: boolean;
  readonly packetver: number;
  readonly renewal: true;
  readonly forceLegacyLoginSkin: true;
  readonly clientRoot: 'core/';
  readonly luaRoot: 'core/data/luafiles514/lua files/';
  readonly systemRoot: 'core/System/';
  readonly customWasmUri: 'core/wasm/liblua5.1.wasm';
  readonly resourceProfileId: 'lastro-public';
  readonly remoteClient: string;
  readonly resourcePathCharset: string;
  readonly lastroDataCharset: string;
  readonly statusDescriptionCharset: string;
  readonly networkCharset: string;
  readonly loadLua: true;
  readonly skipIntro: true;
  readonly skipServerList: true;
  readonly enableCashShop: true;
  readonly customItemInfo: readonly string[];
  readonly development: boolean;
  readonly enableConsole: boolean;
}

export function buildClientConfig(profile: AvailableServerProfile, credentials: ClientCredentials): V2ClientConfig {
  const available = getAvailableServerProfile(profile.id);
  const hasUsername = Boolean(credentials.username);
  const hasPassword = Boolean(credentials.password);
  if (hasUsername !== hasPassword) throw new Error('账号资料不完整');
  const server = Object.freeze({
    id: available.id,
    display: available.displayName,
    address: available.loginAddress,
    port: available.loginPort,
    version: available.version,
    langtype: available.langtype,
    disableKorean: true,
    // Character/map servers can advertise loopback addresses behind the public host.
    forceUseAddress: true,
    packetver: available.packetver,
    renewal: true,
  });
  const loginServerProfiles = Object.freeze([
    ...LASTRO_SERVER_PROFILES.map(candidate => candidate.availability === 'available'
      ? Object.freeze({
        id: candidate.id, label: candidate.displayName, availability: candidate.availability,
        address: candidate.loginAddress, port: candidate.loginPort, version: candidate.version,
        langtype: candidate.langtype, packetver: candidate.packetver,
        disableKorean: true, forceUseAddress: true,
      })
      : Object.freeze({ id: candidate.id, label: candidate.displayName, availability: candidate.availability,
        unavailableReason: candidate.unavailableReason }),
  )]);
  return Object.freeze({
    servers: Object.freeze([server] as const),
    autoLogin: hasUsername ? Object.freeze([credentials.username, credentials.password] as const) : null,
    loginServerProfiles,
    lastroProtocol: true,
    lastroCustomPackets: true,
    packetKeys: Object.freeze([...available.packetKeys] as [number, number, number]),
    clientHash: available.clientHash,
    clientVer: available.clientVer,
    lastroNid: available.lastroNid,
    lastroLoginCheck: false,
    lastroLoginCheckin: true,
    packetver: available.packetver,
    // PacketStructure reads the global mode before LoginEngine selects a server.
    renewal: true,
    forceLegacyLoginSkin: true,
    clientRoot: 'core/',
    luaRoot: 'core/data/luafiles514/lua files/',
    systemRoot: 'core/System/',
    customWasmUri: 'core/wasm/liblua5.1.wasm',
    resourceProfileId: available.resourceProfileId,
    remoteClient: 'https://game.lastro.cn/ro/client_re/',
    resourcePathCharset: 'gbk', lastroDataCharset: 'gbk', statusDescriptionCharset: 'gbk', networkCharset: 'gbk',
    loadLua: true, skipIntro: true, skipServerList: true, enableCashShop: true,
    customItemInfo: Object.freeze(['System/itemInfo_re_59.lua', 'System/itemInfo_re_61.lua']),
    development: true,
    enableConsole: true,
  });
}
