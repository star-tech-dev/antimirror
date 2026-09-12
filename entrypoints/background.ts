import { defineBackground } from 'wxt/utils/define-background';
import { browser } from 'wxt/browser';
import { TabController } from '../src/background/tab-controller';
import { isUiRequest, isTargetLost } from '../src/shared/protocol';

export default defineBackground(() => {
  const controller = new TabController();

  browser.runtime.onMessage.addListener(async (message: unknown, sender) => {
    await controller.ready;
    if (isTargetLost(message) && sender.id === browser.runtime.id && sender.tab?.id !== undefined && sender.frameId === 0) {
      await controller.targetLost(sender.tab.id, message.operationId, message);
      return undefined;
    }
    if (!isUiRequest(message) || sender.id !== browser.runtime.id || sender.tab ||
        sender.url !== browser.runtime.getURL('/popup.html')) return undefined;
    const [active] = await browser.tabs.query({ active: true, currentWindow: true });
    if (active?.id !== message.tabId) return undefined;
    return message.type === 'GET_STATE'
      ? controller.getState(message.tabId)
      : controller.setEnabled(message.tabId, message.desired, message.requestId);
  });

  browser.webNavigation.onCommitted.addListener(details => {
    if (details.frameId === 0) void controller.ready.then(() => controller.resetForNavigation(details.tabId)).catch(() => undefined);
  });
  browser.tabs.onRemoved.addListener(tabId => { void controller.ready.then(() => controller.remove(tabId)).catch(() => undefined); });
});
