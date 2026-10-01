import type { createLastroQuestData, LastroQuest } from './lastro-quest-data.mjs';
export interface LastroQuestBridge {
  receiveHuntingList(packet: unknown): void;
  refreshBounties(): boolean;
}
export function installLastroQuestBridge<T>(quest: T, dependencies: {
  data: Pick<ReturnType<typeof createLastroQuestData>, 'fromHuntingList'>;
  getQuests(): Record<string, LastroQuest> | LastroQuest[];
  canRefresh(): boolean;
  queryHuntingList(): void;
  clock?: Pick<typeof globalThis, 'setInterval' | 'clearInterval'>;
}): T & LastroQuestBridge;
export function patchRuntimeQuests(source: string): string;
