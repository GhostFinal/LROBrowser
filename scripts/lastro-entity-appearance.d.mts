export const LASTRO_MONSTER_APPEARANCES: Readonly<Record<number, string>>;
export const LASTRO_MERCENARY_APPEARANCES: Readonly<Record<number, readonly {
  sex: number; head: number; accessory: number; accessory2: number; accessory3: number;
  weapon: number; file: string;
}[]>>;
export function patchRuntimeEntityAppearance(source: string): string;
