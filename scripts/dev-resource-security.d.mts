export function requestPath(url: string | undefined): string;
export function isLocalRequest(host: string | undefined, origin: string | undefined): boolean;
export function resolveStagedResource(root: string, url: string | undefined): { file: string; exists: boolean } | null;
