export interface UpdateEntry { version: string; src: string; channels: string[] }
export interface UpdateManifest { versions: UpdateEntry[]; channels: Record<string, { name: string }> }
export function buildUpdateManifest(entries: UpdateEntry[], options?: { channelName?: string }): UpdateManifest;
