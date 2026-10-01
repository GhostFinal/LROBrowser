import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { auditTeleportRoute, auditTeleportResourceAliases, parseOfficialTeleportCatalog, parseOfficialTeleportRuntimeEvidence, parseTeleportMapHeader, parseTeleportResourceAliases, teleportAuditProfiles } from '../scripts/audit-lastro-teleport-routes.mjs';
import catalog from '../scripts/lastro-teleport-routes.json';

const assets = { prontera: { rsw: { header: { magic: 'GRSW' } }, gnd: { header: { magic: 'GRGN' } }, gat: { header: { width: 312, height: 392 } } } };
describe('passive teleport route audit', () => {
  it('reads GAT tile dimensions without interpreting a response error page as a map', () => {
    const header = Buffer.alloc(14); header.write('GRAT'); header[4] = 1; header[5] = 2; header.writeUInt32LE(312, 6); header.writeUInt32LE(392, 10);
    expect(parseTeleportMapHeader('gat', header)).toMatchObject({ width: 312, height: 392 });
    expect(() => parseTeleportMapHeader('gat', Buffer.from('<html>missing file</html>'))).toThrow('Invalid gat');
  });
  it('checks the actual server catalog Kafra outset and path against map bounds', () => {
    expect(auditTeleportRoute({ outset: ['prontera', 116, 72], path: [['prontera', 149, 89]], position: [] }, assets).issues).toEqual([]);
    expect(auditTeleportRoute({ outset: ['prontera', 312, 72], path: [['prontera', 149, 89]] }, assets).issues).toContainEqual(expect.objectContaining({ code: 'coordinate-out-of-bounds' }));
  });
  it('reads fixed-width RSW filenames without adjoining padding bytes and honours modern header offsets', () => {
    for (const minor of [1, 2, 5, 6]) {
      const header = Buffer.alloc(256); header.write('GRSW'); header[4] = 2; header[5] = minor;
      const offset = 6 + (minor >= 5 ? 4 : 0) + (minor >= 2 ? 1 : 0);
      header[offset + 39] = 100;
      header.write('alde_gld.gnd', offset + 40); header.write('alde_gld.gat', offset + 80);
      expect(parseTeleportMapHeader('rsw', header)).toMatchObject({ ground: 'alde_gld.gnd', altitude: 'alde_gld.gat' });
    }
  });
  it('keeps missing targets, unknown maps and invalid coordinates unavailable', () => {
    expect(auditTeleportRoute({ path: [] }, assets).result).toBe('unavailable-or-unverified');
    expect(auditTeleportRoute({ outset: ['prontera_a', 116, 72], path: [['prontera_a', 149, 89]] }, assets).issues).toContainEqual(expect.objectContaining({ code: 'unverified-map-assets' }));
    expect(auditTeleportRoute({ outset: ['prontera', undefined, 72], path: [['prontera', 149, 89]] }, assets).issues).toContainEqual(expect.objectContaining({ code: 'invalid-coordinate' }));
  });
  it('accepts an official indoor map when its resource headers and coordinates are valid', () => {
    const indoor = { mal_in01: { ...assets.prontera, gat: { header: { width: 200, height: 240 } } } };
    expect(auditTeleportRoute({ outset: ['mal_in01', 160, 31], path: [['mal_in01', 160, 31]] }, indoor).issues).toEqual([]);
  });
  it('parses the official static table and its computed numeric IDs without evaluating code', () => {
    expect(parseOfficialTeleportCatalog('define(function() { var logsTable = {3:{guide:{[0]:{npc:"卡普拉",outset:["prontera",116,72],path:[["prontera",149,89]],position:[]}}},5:{mvp:{}}}; return logsTable; });')).toMatchObject({ 3: { npc: { 0: { npc: '卡普拉' } } }, 5: { boss: {} } });
    expect(() => parseOfficialTeleportCatalog('var logsTable = {3: executeRemoteCode()};')).toThrow('executable');
  });
  it('uses the App ClientVer=5 official table while keeping lastroNid=6 order isolation', () => {
    expect(teleportAuditProfiles(catalog.profiles)).toContainEqual(expect.objectContaining({ id: 'lastro-app', clientVer: 5, lastroNid: 6, sourceCatalogProfile: '5', catalogRows: 127 }));
  });
  it('records the original public selector and exact outset packet protocol without running its code', () => {
    const source = 'ma=R.get("ClientVer");K.nid=ma; define("UI/Components/Quest/Quest",function(){ y.mapname=b.outset[0];y.x=b.outset[1];y.y=b.outset[2];y.type=1;y.itemid=14527; }); c.CZ.PRIVATE_AIRSHIP_REQUEST.prototype.build=function(){var d=new a(34);d.writeShort(2633);d.writeBinaryString(this.mapname,16);};';
    expect(parseOfficialTeleportRuntimeEvidence(source)).toMatchObject({ catalogueSelector: 'ClientVer', outsetPoint: true, type: 1, itemid: 14527, packetId: 2633, packetBytesForCurrentVersion: 34 });
  });
  it('preserves native alias direction, comments and exact filename bytes', () => {
    const aliases = parseTeleportResourceAliases(Buffer.from('// public map aliases\nprt_evt.gnd#prontera.gnd#\nUpper.rsw#lower.rsw#\n'));
    expect(aliases['prt_evt.gnd']).toBe('prontera.gnd');
    expect(aliases['prontera.gnd']).toBeUndefined();
    expect(aliases['Upper.rsw']).toBe('lower.rsw');
    expect(aliases['upper.rsw']).toBeUndefined();
  });
  it('applies one exact alias hop to RSW before using its real GAT and GND filenames', () => {
    const prefix = 'https://game.lastro.cn/ro/client_re/data/';
    const entries = {
      first: { rsw: {url: prefix + 'first.rsw', header: {ground:'first.gnd', altitude:'first.gat'}}, gat: {url: prefix + 'first.gat', header:{width:300,height:300}}, gnd:{url:prefix+'first.gnd',header:{}} },
      second: { rsw: {url: prefix + 'second.rsw', header: {ground:'second.gnd', altitude:'second.gat'}}, gat: {url: prefix + 'second.gat', header:{width:100,height:100}}, gnd:{url:prefix+'second.gnd',header:{}} },
    };
    const result = auditTeleportResourceAliases(entries, {'first.rsw':'second.rsw','second.rsw':'third.rsw'});
    expect(result.checks.find(check=>check.map==='first'&&check.role==='rsw')).toMatchObject({key:'first.rsw',resolved:'second.rsw',verifiedFromCachedHeader:true});
    expect(result.checks.find(check=>check.map==='first'&&check.role==='gat')).toMatchObject({key:'second.gat',resolved:'second.gat'});
    expect(auditTeleportRoute({outset:['first',150,50],path:[['first',150,50]]},result.resolvedAssets).issues).toContainEqual(expect.objectContaining({code:'coordinate-out-of-bounds'}));
  });
  it('keeps a missing aliased dependency unverified even when the direct filename exists', () => {
    const prefix = 'https://game.lastro.cn/ro/client_re/data/';
    const entries = {prontera:{rsw:{url:prefix+'prontera.rsw',header:{ground:'prontera.gnd',altitude:'prontera.gat'}},gat:{url:prefix+'prontera.gat',header:{width:312,height:392}},gnd:{url:prefix+'prontera.gnd',header:{}}}};
    const result = auditTeleportResourceAliases(entries, {'prontera.gnd':'missing.gnd'});
    expect(result.unverifiedKeys).toBe(1);
    expect(auditTeleportRoute({outset:['prontera',116,72],path:[['prontera',149,89]]},result.resolvedAssets).result).toBe('unavailable-or-unverified');
  });
});
