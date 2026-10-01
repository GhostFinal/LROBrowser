import { describe, expect, it } from 'vitest';
import { describeLastroMapLoadFailure } from '../scripts/lastro-map-load-diagnostic.mjs';

describe('native map load diagnostics', () => {
  it.each([
    ['data/ein_fild04.gat [download-timeout-60000ms]', 'timeout', '地图资源下载超时'],
    ['Direct HTTP read timeout: data/ein_fild04.gnd', 'timeout', '地图资源下载超时'],
    ['data/ein_fild04.rsw [invalid-map-rsw-objects]', 'invalid-resource', '地图文件不完整或格式异常'],
    ['Unable to resolve resource: data/ein_fild04.gnd [http-503]', 'download', '地图资源下载失败'],
    ['Can\'t find file "data/ein_fild04.gnd"!', 'missing-resource', '未找到地图资源'],
    ['Invalid mesh offset: data/model/tree.rsm', 'parse', '地图数据解析失败'],
    ['', 'unknown', '客户端未返回具体原因'],
  ])('classifies %s without displaying the raw error as markup', (error, category, reason) => {
    const result = describeLastroMapLoadFailure('ein_fild04.gat', error);
    expect(result).toMatchObject({ map: 'ein_fild04', category, reason, detail: error });
    expect(result.message).toContain(reason);
  });

  it('preserves the underlying timeout through the preflight error wrapper', () => {
    const error = new Error('无法读取地图资源：data/ein_fild04.gat', { cause: new Error('download-timeout-60000ms') });
    expect(describeLastroMapLoadFailure('ein_fild04', error)).toMatchObject({ category: 'timeout', resource: 'data/ein_fild04.gat' });
  });

  it('limits diagnostics and handles circular causes', () => {
    const error = { message: 'failed', cause: null as unknown }; error.cause = error;
    expect(describeLastroMapLoadFailure('ein_fild04', error).detail).toBe('failed');
    expect(describeLastroMapLoadFailure('', 'a'.repeat(10000)).detail).toHaveLength(8192);
  });

  it('keeps raw server markup out of the native message', () => {
    const result = describeLastroMapLoadFailure('<img onerror=evil>', '<img onerror=evil> http-503 data/ein_fild04.gat');
    expect(result.message).not.toMatch(/[<>]|onerror=|http-503/);
    expect(result.message).toContain('文件：data/ein_fild04.gat');
  });
});
