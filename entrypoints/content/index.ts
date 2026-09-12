import { defineContentScript } from 'wxt/utils/define-content-script';
import { browser } from 'wxt/browser';
export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  allFrames: true, matchAboutBlank: true, matchOriginAsFallback: true,
  runAt: 'document_start',
  main(ctx) {
    const listener = () => undefined;
    browser.runtime.onMessage.addListener(listener);
    ctx.onInvalidated(() => browser.runtime.onMessage.removeListener(listener));
  },
});
