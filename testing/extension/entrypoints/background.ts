import { defineBackground } from 'wxt/utils/define-background';
import { browser } from 'wxt/browser';
export default defineBackground(() => {
  const boot = crypto.randomUUID();
  browser.runtime.onMessage.addListener((message: unknown) => {
    if (message === 'SPIKE_SESSION') return browser.storage.session.get('spike');
    if (message === 'SPIKE_BOOT') return Promise.resolve(boot);
  });
});
