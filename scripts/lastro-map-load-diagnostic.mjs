export function describeLastroMapLoadFailure(mapname, error) {
  const map = String(mapname || '').replace(/\.gat$/i, '').replace(/[^a-z0-9_@#-]/gi, '').slice(0, 32) || '未知地图';
  const parts = [];
  const seen = new Set();
  for (let current = error; current != null && !seen.has(current) && parts.length < 4; current = current?.cause) {
    seen.add(current);
    parts.push(String(current?.message ?? current));
  }
  const detail = parts.join('\n').slice(0, 8192);
  const resource = /\bdata[\\/][^\s"'<>[\]]+\.(?:rsw|gnd|gat|rsm|str|bmp|tga|jpg)\b/i.exec(detail)?.[0]?.slice(0, 160) || '';
  let category = 'unknown', reason = '客户端未返回具体原因';
  if (/download-timeout|Direct HTTP (?:open|read) timeout|operation was aborted|AbortError/i.test(detail)) {
    category = 'timeout'; reason = '地图资源下载超时';
  } else if (/invalid-map-|Invalid (?:GND|GAT|RSW) header|INVALID_(?:RSW|GND|GAT)|格式|损坏|不完整|truncated|content-length does not match/i.test(detail) || /^INVALID_(?:RSW|GND|GAT)/.test(error?.code || '')) {
    category = 'invalid-resource'; reason = '地图文件不完整或格式异常';
  } else if (/ResourceResolutionError|Unable to resolve resource|无法读取地图资源|fetch failed|Failed to fetch|fetch-failed|http-\d+|Direct (?:HTTP|TCP)|NetworkError/i.test(detail)) {
    category = 'download'; reason = '地图资源下载失败';
  } else if (/Can't find file|cannot find file|not found/i.test(detail)) {
    category = 'missing-resource'; reason = '未找到地图资源';
  } else if (detail) {
    category = 'parse'; reason = '地图数据解析失败';
  }
  const displayResource = resource.replace(/[^a-z0-9_@#./\\%-]/gi, '');
  return {
    map, resource, category, reason, detail, at: new Date().toISOString(),
    message: `地图加载失败：${map}。\n原因：${reason}${displayResource ? '\n文件：' + displayResource : ''}\n确认后返回登录，请重新尝试。`,
  };
}
