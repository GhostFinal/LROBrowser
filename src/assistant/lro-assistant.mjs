import { openAssistantStorage } from './lro-assistant-storage.mjs';
import { createStandardAssistant } from './lro-assistant-standard.mjs';
import { installAssistantInputTracking } from './lro-assistant-input.mjs';
import { installMarketApi } from './lro-market-api.mjs';

export const ASSISTANT_VERSION = '0.4.19';
export const ASSISTANT_AUTHOR = '加藤惠';
const installations = new WeakMap();

// Booted as a built-in client feature. The explicit switch is retained for
// embedders/tests; importing alone does not create windows or contact a server.
export function installLroAssistant(options) {
  if (!options?.enabled) return Promise.resolve(null);
  const page = options.page ?? globalThis.window;
  if (!page?.document) return Promise.reject(new Error('助手需要客户端页面'));
  if (installations.has(page)) return installations.get(page);
  const installing = (async () => {
    installAssistantInputTracking(page);
    let assistant;
    const reportError = error => {
      const message = `LRO助手保存失败：${error?.message ?? '本地存储异常'}。请保留当前窗口并导出备份。`;
      if (assistant) assistant.setStatus(message, true);
      else page.console?.error?.(message);
    };
    const storage = await openAssistantStorage(options.profile, {
      indexedDB: options.indexedDB ?? page.indexedDB, onError: reportError,
    });
    try {
      assistant = createStandardAssistant({
        page, storage, modules: options.modules,
        subscribePackets: options.subscribePackets, reportError,
      });
      if (page.fetch) installMarketApi(assistant,page);
      return Object.freeze({
        version: ASSISTANT_VERSION,
        author: ASSISTANT_AUTHOR,
        open: () => {
          assistant.showAssistantView('manager');
          options.modules.get('UI/UIManager')?.getComponent?.('LROAssistant')?.focus();
        },
        flush: async () => { assistant.itemOverview.flushSave(); await storage.flush(); },
        // Lifetime is one client page. Per-feature switches remain available;
        // disabling the entire integration takes effect on the next reload.
        get storageStatus() { return storage.status; },
      });
    } catch (error) {
      await storage.close().catch(() => {});
      throw error;
    }
  })();
  installations.set(page, installing);
  return installing;
}
