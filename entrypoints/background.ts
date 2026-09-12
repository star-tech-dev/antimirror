import { defineBackground } from 'wxt/utils/define-background';
import { browser } from 'wxt/browser';
export default defineBackground(() => {
  // S00 is deliberately OFF. No state, discovery or enable path until S01.
  browser.runtime.onMessage.addListener((message: unknown, sender) => {
    if (sender.id === browser.runtime.id && !sender.tab &&
        typeof message === 'object' && message !== null &&
        'type' in message && message.type === 'GET_STATUS') {
      return Promise.resolve({ enabled: false, reason: 'FOUNDATION_ONLY' });
    }
  });
});
