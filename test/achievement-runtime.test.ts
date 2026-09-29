import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function runtimeSource() {
  return readFile('generated/runtime/Online.js', 'utf8');
}

describe('achievement runtime integration', () => {
  it('loads the packaged LastRO achievement table with the configured data charset', async () => {
    const source = await runtimeSource();
    expect(source).toContain('"System/achievement_list_cn2_06.lua"');
    expect(source).toContain('onLoad("achievements"),\n            userCharpage');
    expect(source).not.toContain('"System/achievement_list.lub"');
  });

  it('supports the official achievement packet field names', async () => {
    const source = await runtimeSource();
    expect(source).toContain('pkt.total_achievements ?? pkt.ACHCount ?? 0');
    expect(source).toContain('const achievements = pkt.ach_list || pkt.ACHList || [];');
    expect(source).toContain('ach.ach_id = ach.ach_id ?? ach.AID;');
    expect(source).toContain('const achievements = pkt.ach_list || pkt.Achievement || [];');
    expect(source).toContain('const achievementId = pkt.ach_id ?? pkt.ACHID;');
  });

  it('builds the reward request with the official achievementID field', async () => {
    const source = await runtimeSource();
    expect(source).toContain('this.achievementID = 0;');
    expect(source).toContain('pkt_buf.writeULong(this.achievementID || this.ach_id);');
    expect(source).toContain('pkt.achievementID = this.selectedAchId;');
  });
});
