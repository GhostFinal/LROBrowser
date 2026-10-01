export interface LastroQuestMetadata {
  name?: string; desc?: string; type?: number; show?: boolean; display?: boolean;
  npc?: string; keyword?: string; items?: unknown[];
  outset?: unknown[]; path?: unknown[]; questPos?: unknown[]; position?: unknown[];
}
export interface LastroQuestInfo {
  Title?: string; Summary?: string; Description?: string | string[]; IconName?: string;
  NpcNavi?: string; NpcPosX?: number; NpcPosY?: number;
}
export interface LastroQuestHunt {
  mobGID?: number; mobName?: string; huntCount?: number; maxCount?: number;
  [key: string]: unknown;
}
export interface LastroQuest {
  questID: number; title?: string; summary?: string; description?: string | string[]; icon?: string;
  active?: number; start_time?: number | null; end_time?: number | null; count?: number;
  npc_navi?: string | null; npc_pos_x?: number | null; npc_pos_y?: number | null;
  hunt_list?: Record<string, LastroQuestHunt> | LastroQuestHunt[];
  lastroBountySource?: boolean; lastroBountyOnly?: boolean;
  lastroBountyKeys?: string[];
  [key: string]: unknown;
}
export interface LastroHuntingRow { questID: number; mobGID: number; count: number; maxCount: number; }
export interface LastroHydratedQuest extends LastroQuest { hunt_list: Record<string, LastroQuestHunt>; }
export interface LastroQuestRoute { npc: string; outset: unknown[]; path: unknown[]; questPos: unknown[]; position: unknown[]; }
export function buildLastroQuestMetadata(source: string): Record<string, LastroQuestMetadata>;
export function createLastroQuestData(deps: {
  getInfo: (questID: number) => LastroQuestInfo | null | undefined;
  getMonsterName: (mobGID: number) => string | null | undefined;
  legacyMetadata?: Record<string, LastroQuestMetadata>;
  isLastro?: boolean | (() => boolean);
}): {
  hydrateQuest(quest: LastroQuest): LastroHydratedQuest;
  fromHuntingList(pkt: { HuntingList?: LastroHuntingRow[] }, currentQuests?: Record<string, LastroQuest> | LastroQuest[]): Record<string, LastroHydratedQuest>;
  metadataFor(questID: number): { type: number | null; route: LastroQuestRoute | null };
};
