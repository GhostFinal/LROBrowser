export interface MapLoadDiagnostic {
  map: string; resource: string; category: string; reason: string; detail: string; at: string; message: string;
}
export function describeLastroMapLoadFailure(mapname: unknown, error: unknown): MapLoadDiagnostic;
