export interface SoundTimingToken { readonly filename: string; }
export interface SoundTimingOptions {
  now(): number;
  wallNow(): number;
  available(): boolean;
}
export interface SoundTiming {
  capture(filename: string, dueTick?: number): SoundTimingToken | null;
  current(token: SoundTimingToken | null | undefined): boolean;
  start(token: SoundTimingToken | null | undefined): boolean;
  release(token: SoundTimingToken | null | undefined): void;
  cancel(filename?: string): void;
}
export function createLastroSoundTiming(options: SoundTimingOptions): SoundTiming;
export function patchRuntimeAudioTiming(source: string): string;
