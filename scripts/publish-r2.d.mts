import type { S3Client } from '@aws-sdk/client-s3';
export function createR2Client(config: { accountId: string; accessKeyId: string; secretAccessKey: string; endpoint?: string }): S3Client;
export function buildReleaseObjectKeys(metadata: { version: string; commitSha: string }): { bundle: string; checksum: string; releaseManifest: string; auditReport: string };
export interface PublishResult { version: string; keys: Record<string, string>; retainedVersions: string[] }
export function publishRelease(input: { client: unknown; bucket: string; artifacts: Record<string, Uint8Array | Buffer>; metadata: Record<string, unknown>; existingVersions?: string[]; retentionCount?: number }): Promise<PublishResult>;
