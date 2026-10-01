// Navigation links only. No fetch, image loading, scripts, credentials or game
// state are sent to these sites. The IWA resource/CSP allowlist is unchanged.
export function referenceUrl(kind, id = '') {
  const value=encodeURIComponent(String(id));
  if (kind==='item') return `https://ro.dvg.cn/itemsinfo.php?id=${value}`;
  if (kind==='item321re') return `https://ro.ro321.com/index.php?page=re_item_db&item_id=${value}`;
  if (kind==='item321') return `https://ro.ro321.com/index.php?page=item_db&item_id=${value}`;
  if (kind==='monster') return `https://ro.dvg.cn/monsterinfo.php?id=${value}`;
  if (kind==='monsterSearch') return `https://ro.dvg.cn/monster.php?search=1&st=1&words=${value}`;
  if (kind==='search321') return 'https://ro.ro321.com/index.php?page=item_db';
  return 'https://ro.dvg.cn/items.php';
}
