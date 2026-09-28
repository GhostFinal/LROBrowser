export interface ReleaseInputs { keyPath: string; expectedBundleId: string; version: string; commitSha: string; updateManifestUrl: string; bundleBaseUrl: string; channel?: string }
export function verifyReleaseInputs(input: ReleaseInputs): Promise<ReleaseInputs & { channel: string }>;
