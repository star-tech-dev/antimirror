import { defineContentScript } from 'wxt/utils/define-content-script';
import { browser } from 'wxt/browser';
import { getAccessibleShadowRoot } from '../../../src/content/shadow-access';
import { createMirrorEffect } from '../../../src/content/mirror-effect';
export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'], allFrames: true,
  matchAboutBlank: true, matchOriginAsFallback: true, runAt: 'document_start',
  main(ctx) {
    let handle: ReturnType<typeof createMirrorEffect> | undefined;
    let video: HTMLVideoElement | undefined;
    let before: ReturnType<typeof snapshot> | undefined;
    function snapshot() {
      if (!video) throw new Error('No fixture video');
      return { style: video.getAttribute('style'), transform: getComputedStyle(video).transform,
        origin: getComputedStyle(video).transformOrigin, backface: getComputedStyle(video).backfaceVisibility,
        animations: video.getAnimations().length };
    }
    const listener = (message: unknown, sender: { id?: string }) => {
      if (sender.id !== browser.runtime.id) return;
      if (message === 'SPIKE_PING') return Promise.resolve({ url: location.href });
      if (message === 'SPIKE_APPLY') {
        handle?.dispose();
        const host = document.querySelector('.shadow-host');
        const root = host ? getAccessibleShadowRoot(host) : null;
        video = (root ?? document).querySelector('video') ?? undefined;
        if (!video) return Promise.resolve({ error: 'NO_VIDEO' });
        before = snapshot();
        handle = createMirrorEffect(video);
        return Promise.resolve({ closed: !!root && host?.shadowRoot === null, before, during: snapshot() });
      }
      if (message === 'SPIKE_SNAPSHOT') return Promise.resolve(snapshot());
      if (message === 'SPIKE_CANCEL') {
        handle?.dispose(); handle?.dispose(); handle = undefined;
        return Promise.resolve({ before, after: snapshot() });
      }
    };
    browser.runtime.onMessage.addListener(listener);
    ctx.onInvalidated(() => { handle?.dispose(); browser.runtime.onMessage.removeListener(listener); });
  },
});
