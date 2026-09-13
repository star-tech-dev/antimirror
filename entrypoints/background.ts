import { defineBackground } from 'wxt/utils/define-background';
import { browser } from 'wxt/browser';
import { TabController } from '../src/background/tab-controller';
import { handleBrowserCommand } from '../src/background/commands';
import { isUiRequest, isTargetLost, isFrameLost } from '../src/shared/protocol';

export default defineBackground(() => {
  const controller = new TabController();

  browser.runtime.onMessage.addListener(async (message: unknown, sender) => {
    await controller.ready;
    if (isFrameLost(message) && sender.id === browser.runtime.id && sender.tab?.id !== undefined && sender.frameId !== undefined) {
      await controller.frameLost(sender.tab.id, sender.frameId, message.operationId, message.documentNonce, message.token, message.reason);
      return undefined;
    }
    if (isTargetLost(message) && sender.id === browser.runtime.id && sender.tab?.id !== undefined && sender.frameId === message.frameId) {
      await controller.targetLost(sender.tab.id, message.operationId, message, message.reason);
      return undefined;
    }
    if (!isUiRequest(message) || sender.id !== browser.runtime.id || sender.tab ||
        sender.url !== browser.runtime.getURL('/popup.html')) return undefined;
    const [active] = await browser.tabs.query({ active: true, currentWindow: true });
    if (active?.id !== message.tabId) return undefined;
    return message.type === 'GET_STATE'
      ? controller.readState(message.tabId)
      : controller.setEnabled(message.tabId, message.desired, message.requestId);
  });

  browser.webNavigation.onCommitted.addListener(details => {
    void controller.resetForNavigation(details.tabId, details.frameId).catch(() => undefined);
  });
  const history = (details: { tabId: number; frameId: number; url: string }) => {
    if (details.frameId === 0) void controller.historyChanged(details.tabId, details.url).catch(() => undefined);
  };
  browser.webNavigation.onHistoryStateUpdated.addListener(history);
  browser.webNavigation.onReferenceFragmentUpdated.addListener(history);
  browser.tabs.onUpdated.addListener((tabId, change) => {
    if (change.discarded) void controller.resetForNavigation(tabId).catch(() => undefined);
  });
  browser.tabs.onReplaced.addListener((added, removed) => {
    void controller.resetForNavigation(removed).then(() => controller.remove(removed)).catch(() => undefined);
    void controller.resetForNavigation(added).catch(() => undefined);
  });
  browser.tabs.onRemoved.addListener(tabId => { void controller.remove(tabId).catch(() => undefined); });
  browser.permissions.onRemoved.addListener(() => { void controller.ready.then(() => controller.permissionsRevoked()).catch(() => undefined); });
  browser.commands.onCommand.addListener(command => {
    void handleBrowserCommand(controller, command).catch(() => undefined);
  });
});
