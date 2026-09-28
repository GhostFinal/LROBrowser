export interface ReleaseMetadataInput { runNumber: string | number; commitSha: string; channel?: string; updateManifestUrl: string; bundleBaseUrl: string }
export interface ReleaseMetadata { version: string; commitSha: string; channel: string; updateManifestUrl: string; bundleBaseUrl: string }
export function validateIwaVersion(version: string): void;
export function compareIwaVersions(left: string, right: string): number;
export function getReleaseMetadata(input: ReleaseMetadataInput): ReleaseMetadata;
