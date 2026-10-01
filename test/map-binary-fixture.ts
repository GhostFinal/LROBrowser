export function mapBinaryFixture(kind: string, marker = 1, version = kind === 'rsw' ? 2.7 : kind === 'gnd' ? 1.9 : 1.2, objectTypes: number[] = []): ArrayBuffer {
  const values: number[] = [];
  const u8 = (value: number) => values.push(value & 255);
  const u32 = (value: number) => { for (let index = 0; index < 4; index++) u8(value >>> (index * 8)); };
  const zeros = (size: number) => { for (let index = 0; index < size; index++) u8(0); };
  const magic = kind === 'gnd' ? 'GRGN' : kind === 'gat' ? 'GRAT' : 'GRSW';
  for (const character of magic) u8(character.charCodeAt(0));
  u8(Math.floor(version)); u8(Math.round((version % 1) * 10));
  if (kind === 'gat') {
    u32(1); u32(1); zeros(16); u32(marker % 7);
  } else if (kind === 'gnd') {
    u32(1); u32(1); zeros(4);
    u32(1); u32(4); u8(marker); zeros(3);
    u32(1); u32(8); u32(8); u32(1); zeros(256);
    u32(1); zeros(40);
    zeros(16); u32(0); u32(-1); u32(-1);
    if (version >= 1.8) { zeros(24); u32(1); u32(1); }
    if (version >= 1.9) zeros(24);
  } else {
    if (version >= 2.5) u32(186);
    if (version >= 2.2) u8(0);
    u8(marker); zeros(119 + (version >= 1.4 ? 40 : 0));
    if (version < 2.6) {
      if (version >= 1.3) zeros(4);
      if (version >= 1.8) zeros(16);
      if (version >= 1.9) zeros(4);
    }
    if (version >= 1.5) zeros(32 + (version >= 1.7 ? 4 : 0));
    if (version >= 1.6) zeros(16);
    if (version >= 2.7) { u32(2); zeros(8); }
    u32(objectTypes.length);
    for (const type of objectTypes) {
      u32(type);
      if (type === 1) zeros(196 + (version >= 1.3 ? 52 : 0) + (version >= 2.6 ? 1 : 0) + (version >= 2.7 ? 4 : 0));
      else if (type === 2) zeros(108);
      else if (type === 3) zeros(188 + (version >= 2 ? 4 : 0));
      else if (type === 4) zeros(116);
    }
  }
  return Uint8Array.from(values).buffer;
}
