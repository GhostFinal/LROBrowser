export async function loadClientFonts(): Promise<void> {
  if (!document.fonts) return;
  const sample = '聊天设置确定取消传送金币 ABC 0123456789';
  await Promise.allSettled([400, 500, 700].map(weight => document.fonts.load(`${weight} 12px "MiSans"`, sample)));
}
