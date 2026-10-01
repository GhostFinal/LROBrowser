export interface QuestRoute { name?: string; outset: [string, number, number]; path: [string, number, number][]; [key: string]: unknown; }
export interface NativeQuest { questID?: number; title?: string; summary?: string; description?: string | string[]; hunt_list?: Record<string, Record<string, unknown>>; routes?: QuestRoute[]; route?: QuestRoute; [key: string]: unknown; }
export interface NativeQuestComponent {
  _host?: HTMLElement; mouseMode?: number; ui?: { show?(): void; hide?(): void }; getRoot?(): ParentNode | null;
  append?(): void; remove?(): void; ClearQuestList?(): void; setQuestInfo?(quest: NativeQuest): void; [key: string]: unknown;
}
export interface LastroQuestUIDeps {
  quest: NativeQuestComponent; helper: NativeQuestComponent; tracker: NativeQuestComponent;
  getQuests(): Record<string, NativeQuest>; getHidden?(): number[]; hydrateQuest?(quest: NativeQuest): NativeQuest;
  showMonster?(id: number | null, name: string): unknown; requestRoute?(route: QuestRoute): boolean | void | Promise<boolean | void>;
  cancelRoute?(): void; cancelPendingRoute?(): void; getShowTracker?(): boolean; setShowTracker?(show: boolean): void;
  showPrompt?: unknown; getMapReady?(): boolean; getMiniMap?(): NativeQuestComponent | HTMLElement | null;
  getViewport?(): { width: number; height: number }; document: Document; window?: Window; setHtml?: unknown;
}
export interface LastroQuestUI { refresh(): void; position(): void; setVisible(show: boolean): void; cancelRoute(): void; readonly selectedQuestId: number | null; readonly pending: boolean; dispose(): void; }
export function installLastroQuestUI(deps: LastroQuestUIDeps): LastroQuestUI;
