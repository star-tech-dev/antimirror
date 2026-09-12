import { chromium, expect, test } from '@playwright/test';
import path from 'node:path';
import { popupHarness } from './popup-helper.mjs';

test('S04 production media, URL and page lifecycle', async ({ baseURL }) => {
  test.setTimeout(90_000);
  const extension = path.resolve('.output/chrome-mv3');
  const context = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true,
    ignoreDefaultArgs: ['--disable-back-forward-cache'],
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const openPopup = popupHarness(context, worker);
    const page = await context.newPage();
    const count = () => page.evaluate(() => window.__antiMirrorFixture.first().getAnimations().length);
    const load = async () => {
      await page.goto(`${baseURL}/?case=basic`);
      await page.waitForFunction(() => !!window.__antiMirrorFixture);
    };
    const enable = async () => {
      const popup = await openPopup(page); await popup.click();
      await expect.poll(() => popup.text()).toBe('Видео отражено'); await popup.close();
      expect(await count()).toBe(1);
    };
    const assertOff = async () => {
      await expect.poll(count).toBe(0);
      const popup = await openPopup(page);
      expect(await popup.evaluate('document.querySelector("#toggle").getAttribute("aria-pressed")')).toBe('false');
      await popup.close();
    };
    await load(); await enable();
    await page.evaluate(() => {
      window.history.replaceState({ changed: true }, '', location.href);
      const video = window.__antiMirrorFixture.first(); video.pause();
      for (const event of ['waiting', 'stalled', 'seeking', 'timeupdate']) video.dispatchEvent(new window.Event(event));
      window.__antiMirrorFixture.reparentVideo();
    });
    await page.waitForTimeout(1200); expect(await count()).toBe(1);
    for (const change of ['push', 'replace', 'hash']) {
      if (change !== 'push') { await load(); await enable(); }
      await page.evaluate(change => {
        if (change === 'hash') location.hash = 'changed';
        else window.history[change === 'push' ? 'pushState' : 'replaceState']({}, '', location.href + '&changed=1');
      }, change);
      await assertOff();
    }
    for (const event of ['ended', 'error', 'emptied', 'loadstart']) {
      await load(); await enable();
      await page.evaluate(event => window.__antiMirrorFixture.first().dispatchEvent(new window.Event(event)), event);
      await assertOff();
    }
    for (const change of ['srcObject', 'src', 'source', 'animation']) {
      await load(); await enable();
      await page.evaluate(change => {
        const video = window.__antiMirrorFixture.first();
        if (change === 'srcObject') window.__antiMirrorFixture.swapStream();
        if (change === 'src') video.setAttribute('src', '/other');
        if (change === 'source') video.append(document.createElement('source'));
        if (change === 'animation') video.getAnimations().forEach(animation => animation.cancel());
      }, change);
      await assertOff();
    }
    // Exercise the actual lifecycle handler and retained dispatcher; real BFCache is a separate gate.
    await load(); await enable();
    await page.evaluate(() => {
      window.dispatchEvent(new window.PageTransitionEvent('pagehide', { persisted: true }));
      window.dispatchEvent(new window.PageTransitionEvent('pageshow', { persisted: true }));
    });
    await assertOff(); await enable();
    await page.goto(`${baseURL}/?case=no-video`); await page.goBack({ waitUntil: 'commit' });
    await page.waitForFunction(() => !!window.__antiMirrorFixture); await assertOff();
    await page.goto(`${baseURL}/?case=bfcache`);
    await page.waitForFunction(() => !!window.__antiMirrorFixture);
    await page.evaluate(() => {
      window.bfcacheRestored = false;
      window.addEventListener('pageshow', event => { window.bfcacheRestored = event.persisted; });
    });
    await enable();
    await page.goto(`${baseURL}/?case=no-video`); await page.goBack({ waitUntil: 'commit' });
    await expect.poll(() => page.evaluate(() => window.bfcacheRestored)).toBe(true);
    await assertOff(); await enable();
    console.log('Real BFCache pageshow.persisted=true, OFF and new manual activation PASS');

    console.log('S04 media events/identity, same/new URL, hash, lifecycle dispatcher and back navigation PASS');
  } finally { await context.close(); }
});
// Real discard/restore: scripts/test-recovery-idle.mjs, ANTIMIRROR_LIFECYCLE=discard.
// Chromium 153 macOS crashes when the discarded renderer has a Playwright debugger session.
