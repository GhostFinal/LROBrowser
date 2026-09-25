export interface SignMetadata {
  input: string;
  output: string;
  version: string | null;
  bytes: number;
  sha256: string;
  webBundleId: string;
  testKey: true;
}
export function signBundle(inputPath: string, keyPath: string, outputPath: string, bundleId?: string): Promise<SignMetadata>;
