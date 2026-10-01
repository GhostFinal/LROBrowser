export interface NavigationRect { left: number; right: number; top: number; width: number; height: number; }
export function getNavigationDockPosition(
  minimap: Pick<NavigationRect, 'left' | 'right' | 'top'>,
  navigation: Pick<NavigationRect, 'width' | 'height'>,
  viewport: { width: number; height: number },
  gap?: number,
): { left: number; top: number };
export function dockLastroNavigation(navigation: { _host: HTMLElement | null }, minimapHost?: HTMLElement): void;
export function patchRuntimeNavigationUi(source: string): string;
