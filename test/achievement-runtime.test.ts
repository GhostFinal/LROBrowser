import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

async function runtimeSource() {
  return readFile('generated/runtime/Online.js', 'utf8');
}

describe('achievement runtime integration', () => {
  it('decodes raw Lua strings before passing them to CodepageManager', async () => {
    const source = await runtimeSource();
    const start = source.indexOf('function createLastRODataDecoder(');
    const end = source.indexOf('\nfunction getItemCountUnit', start);
    const decode = vi.fn((value: Uint8Array, charset: string) => `${value[0]}:${charset}`);
    const context = vm.createContext({
      Uint8Array,
      decoder: { decode },
    });
    vm.runInContext(`${source.slice(start, end)}\nresult = createLastRODataDecoder(decoder).decode("\\xB3\\xC9", "gbk");`, context);

    expect(context.result).toBe('179:gbk');
    expect(decode).toHaveBeenCalledWith(expect.any(Uint8Array), 'gbk');
    expect(Array.from(decode.mock.calls[0]![0])).toEqual([0xb3, 0xc9]);
  });

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

  it('treats a non-zero official reward ACK result as success', async () => {
    const source = await runtimeSource();
    expect(source).toContain('const result = pkt.result ?? (pkt.failed ? 0 : 1);');
    expect(source).toContain('result !== 0 &&');
  });

  it('normalizes legacy array and Lua object rewards for the claim button', async () => {
    const source = await runtimeSource();
    expect(source).toContain('function getAchievementRewardInfo(reward)');
    expect(source).toContain('return Array.isArray(reward) ? reward[0] : reward;');
    expect(source).toContain('function hasAchievementReward(reward)');
    expect(source).toContain('const reward = getAchievementRewardInfo(info.reward);');
    expect(source).toContain('const canClaim = hasAchievementReward(info.reward)');
  });

  it('renders a visible claim label instead of relying on a background-only image', async () => {
    const source = await runtimeSource();
    expect(source).toContain('>领取奖励</ui-button>');
    expect(source).toContain('claimBtn.textContent = canClaim ? "领取奖励" : isClaimed ? "已领取" : isCompleted ? "领取奖励" : "未完成";');
    expect(source).toContain('claimBtn.disabled = !canClaim;');
    expect(source).toContain('claimBtn.style.display = hasReward ? "flex" : "none";');
    expect(source).toContain('.d-claim-btn:active {\\r\\n\\tbackground: #d8bb70;\\r\\n}\\r\\n\\r\\n/* Scrollbar area */');
    expect(source).not.toContain('#d8bb70;\\r\\n}}\\r\\n\\r\\n/* Scrollbar area */');
  });

  it('updates both achievement reward state aliases after a successful ACK', async () => {
    const source = await runtimeSource();
    expect(source).toContain('this.result = fp.readUChar();');
    expect(source).toContain('.rewarded = 1;');
    expect(source).toContain('.reward = 1;');
  });

  it('reports both successful and failed reward claims', async () => {
    const source = await runtimeSource();
    expect(source).toContain('UIManager.showMessageBox("已领取成就奖励", "ok");');
    expect(source).toContain('UIManager.showMessageBox("领取失败", "ok");');
  });
});
