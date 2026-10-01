export function lastroUiWindowAppend<T>(component: object, preferences: object, append: () => T, snapshot: () => void, options?: { restoreHeight?: boolean }): T;
export function patchRuntimeUiState(source: string): string;
export function lastroBindNestedWindowState(component: object, preferences: object, current: () => object): void;
