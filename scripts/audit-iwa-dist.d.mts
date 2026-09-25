export interface IwaAuditReport {
  bundleVersion: string;
  fileCount: number;
  totalBytes: number;
  bytesByCategory: Record<string, number>;
  externalOrigins: string[];
  coreManifestSummary: { fileCount: number; packagedBytes?: number };
  prohibitedPatternResults: unknown[];
  requiredHeaders: Record<string, string>;
  sha256: string;
}
export function auditDist(distDirectory: string, reportPath?: string): Promise<IwaAuditReport>;
export const REQUIRED_HEADERS: Record<string, string>;
