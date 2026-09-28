export const PASSIVE_ASSETS: readonly { path: string; url: string }[];
export function downloadPassiveAssets(options?: {
  root?: string;
  assets?: readonly { path: string; url: string }[];
  fetch?: typeof fetch;
}): Promise<string[]>;
