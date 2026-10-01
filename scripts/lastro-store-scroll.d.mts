export interface StoreScrollApi {
  stop(): void;
  refresh(content: HTMLElement | null): void;
  reveal(content: HTMLElement | null, index: string | number): void;
}
export function installLastroStoreScroll(component: {
  _host: HTMLElement;
  _lastroStoreScroll?: StoreScrollApi;
  getRoot(): ShadowRoot | HTMLElement;
}): StoreScrollApi;
export function patchRuntimeStoreScroll(source: string): string;
