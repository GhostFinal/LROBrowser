/** Validate the layouts consumed by the bundled GAT/GND/RSW parsers. */
class MapReader {
  readonly view: DataView;
  offset = 0;

  constructor(bytes: ArrayBuffer, readonly kind: string) {
    this.view = new DataView(bytes);
  }

  fail(reason: string): never { throw new Error(`invalid-map-${this.kind}:${reason}`); }

  skip(size: number): void {
    if (!Number.isSafeInteger(size) || size < 0 || size > this.view.byteLength - this.offset) this.fail('truncated');
    this.offset += size;
  }

  count(size: number, stride: number): void {
    if (!Number.isSafeInteger(size) || size < 0) this.fail('invalid-count');
    this.skip(size * stride);
  }

  u8(): number { this.skip(1); return this.view.getUint8(this.offset - 1); }
  u16(): number { this.skip(2); return this.view.getUint16(this.offset - 2, true); }
  u32(): number { this.skip(4); return this.view.getUint32(this.offset - 4, true); }
  i32(): number { this.skip(4); return this.view.getInt32(this.offset - 4, true); }

  header(expected: string): number {
    for (const character of expected) if (this.u8() !== character.charCodeAt(0)) this.fail('invalid-header');
    const major = this.u8(), minor = this.u8();
    if (!major || minor > 9) this.fail('invalid-version');
    return major + minor / 10;
  }

  dimensions(stride: number): number {
    const width = this.u32(), height = this.u32(), cells = width * height;
    if (!width || !height || !Number.isSafeInteger(cells) || cells > Math.floor(this.view.byteLength / stride)) this.fail('invalid-dimensions');
    return cells;
  }
}

function validateGat(reader: MapReader): void {
  reader.header('GRAT');
  reader.count(reader.dimensions(20), 20);
}

function validateGnd(reader: MapReader): void {
  const version = reader.header('GRGN');
  const cells = reader.dimensions(28);
  reader.skip(4); // zoom
  const textures = reader.u32(), textureNameSize = reader.u32();
  if (textures && !textureNameSize) reader.fail('invalid-textures');
  reader.count(textures, textureNameSize);
  const lightmaps = reader.i32(), lightWidth = reader.i32(), lightHeight = reader.i32(), gridSize = reader.i32();
  if ([lightmaps, lightWidth, lightHeight, gridSize].some(value => value < 0)) reader.fail('invalid-lightmaps');
  reader.count(lightmaps, lightWidth * lightHeight * gridSize * 4);
  const tiles = reader.u32();
  const tileStart = reader.offset;
  reader.count(tiles, 40);
  // References are checked without allocating the worker's potentially large arrays.
  for (let index = 0; index < tiles; index++) {
    if (reader.view.getUint16(tileStart + index * 40 + 32, true) >= textures) reader.fail('invalid-texture-index');
  }
  const surfaceStart = reader.offset;
  reader.count(cells, 28);
  for (let index = 0; index < cells; index++) {
    for (let side = 0; side < 3; side++) {
      if (reader.view.getInt32(surfaceStart + index * 28 + 16 + side * 4, true) >= tiles) reader.fail('invalid-tile-index');
    }
  }
  if (version >= 1.8) {
    reader.skip(24);
    const splitWidth = reader.i32(), splitHeight = reader.i32();
    if (splitWidth < 0 || splitHeight < 0) reader.fail('invalid-water');
    if (version >= 1.9) reader.count(splitWidth * splitHeight, 24);
  }
}

function validateRsw(reader: MapReader): void {
  const version = reader.header('GRSW');
  const build = version >= 2.5 ? reader.i32() : 0;
  if (version >= 2.2) reader.skip(1);
  reader.skip(120 + (version >= 1.4 ? 40 : 0));
  if (version < 2.6) {
    if (version >= 1.3) reader.skip(4);
    if (version >= 1.8) reader.skip(16);
    if (version >= 1.9) reader.skip(4);
  }
  if (version >= 1.5) reader.skip(32 + (version >= 1.7 ? 4 : 0));
  if (version >= 1.6) reader.skip(16);
  if (version >= 2.7) reader.count(reader.i32(), 4);
  const objects = reader.i32();
  if (objects < 0 || objects > Math.floor((reader.view.byteLength - reader.offset) / 4)) reader.fail('invalid-count');
  for (let index = 0; index < objects; index++) {
    switch (reader.i32()) {
      case 1:
        reader.skip(196 + (version >= 1.3 ? 52 : 0) + (version >= 2.6 && build >= 186 ? 1 : 0) + (version >= 2.7 ? 4 : 0));
        break;
      case 2: reader.skip(108); break;
      case 3: reader.skip(188 + (version >= 2 ? 4 : 0)); break;
      case 4: reader.skip(116); break;
      default: reader.fail('invalid-object-type');
    }
  }
  // Older maps may include a quadtree after these records. The runtime ignores it.
}

export function validateMapBinary(path: string, bytes: ArrayBuffer): void {
  const extension = /\.(gat|gnd|rsw)$/i.exec(path)?.[1]?.toLowerCase();
  if (!extension) return;
  const reader = new MapReader(bytes, extension);
  if (extension === 'gat') validateGat(reader);
  else if (extension === 'gnd') validateGnd(reader);
  else validateRsw(reader);
}
