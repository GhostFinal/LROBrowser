export interface SignMetadata {
  input: string;
  output: string;
  bytes: number;
  sha256: string;
  webBundleId: string;
  testKey: true;
}
export function signBundle(inputPath: string, keyPath: string, outputPath: string, bundleId?: string): Promise<SignMetadata>;
