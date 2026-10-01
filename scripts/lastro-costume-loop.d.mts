export interface CostumeLoopFrame {
  layers: Array<Record<string, unknown>>;
  pos: Array<{ x: number; y: number }>;
  sound?: number;
  [key: string]: unknown;
}
export interface CostumeLoopAction { animations: CostumeLoopFrame[]; delay: number; }
export interface CostumeLoopEntity {
  action: number;
  ACTION: { IDLE: number; SIT: number; DIE: number; [key: string]: number };
  animation: { play?: boolean; _lastroEquipmentFinished?: boolean; [key: string]: unknown };
  headDir?: number;
  _lastroEquipmentFrame?: { action: number; animation: CostumeLoopEntity['animation'] };
}
export function sampleLastroCostumeLoop(entity: CostumeLoopEntity, act: { actions: CostumeLoopAction[] }, currentAction: CostumeLoopAction, direction: number, tick: number): { animation: CostumeLoopFrame; index: number } | null;
