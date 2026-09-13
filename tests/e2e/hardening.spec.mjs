import { chromium, expect, test } from '@playwright/test';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { popupHarness } from './popup-helper.mjs';

const extension = path.resolve('.output/chrome-mv3');
const percentile = (values, fraction) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1];

test('S06 trust boundaries reject page and malformed extension messages', async ({ baseURL }) => {
  const context = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const page = await context.newPage(); await page.goto(`${baseURL}/?case=basic`);
    await expect(page.locator('video')).toBeVisible();
    const tabId = await worker.evaluate(async url => (await chrome.tabs.query({})).find(tab => tab.url === url).id, page.url());
    await page.evaluate(() => {
      window.postMessage({ protocolVersion: 1, type: 'SET_ENABLED', desired: true, requestId: 'page' }, '*');
      window.postMessage({ namespace: 'AntiMirror', type: 'FRAME_BIND', operationId: 'x'.repeat(200), token: 'x'.repeat(200) }, '*');
    });
    const contentAttempt = await worker.evaluate(async id => (await chrome.scripting.executeScript({ target: { tabId: id },
      args: [id], func: tabId => chrome.runtime.sendMessage({ protocolVersion: 1, type: 'SET_ENABLED', tabId,
        desired: true, requestId: 'content-script-attempt' }) }))[0].result, tabId);
    expect(contentAttempt).toBeNull(); // executeScript serializes an undefined runtime response as null.
    for (const message of [
      { protocolVersion: 1, type: {}, requestId: 'r' },
      { protocolVersion: 1, type: 'PREPARE_APPLY', requestId: 'r', operationId: 'x'.repeat(129),
        frameId: 0, documentNonce: 'd', targetId: 't', mediaToken: 'm' },
      { protocolVersion: 1, type: 'DISCOVER', requestId: 'r', operationId: 'o', documentNonce: 'd',
        durationMs: 3001, elementLimit: 25001, candidates: Array.from({ length: 1000 }, () => 'noise') },
    ]) {
      expect(await worker.evaluate(async ({ id, value }) => chrome.tabs.sendMessage(id, value).catch(() => undefined),
        { id: tabId, value: message })).toBeNull();
    }
    await page.waitForTimeout(100);
    expect(await page.locator('video').evaluate(video => video.getAnimations().length)).toBe(0);
    expect(await page.evaluate(() => globalThis.__antiMirrorAgentV1)).toBeUndefined();
  } finally { await context.close(); }
});

test('S06 OFF baseline, 100-cycle cleanup and bounded large-DOM profile', async ({ baseURL }) => {
  test.setTimeout(120_000);
  const context = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const openPopup = popupHarness(context, worker);
    const page = await context.newPage(); await page.goto(`${baseURL}/?case=mutations`);
    await expect(page.locator('video')).toBeVisible();
    const tabId = await worker.evaluate(async url => (await chrome.tabs.query({})).find(tab => tab.url === url).id, page.url());
    const instrument = () => worker.evaluate(async id => chrome.scripting.executeScript({ target: { tabId: id }, func: () => {
      const metrics = globalThis.__hardeningMetrics = { observers: 0, intersections: 0, timers: new Set(), visits: 0,
        maxObservers: 0, maxIntersections: 0, maxTimers: 0, longestTask: 0,
        longTasksSupported: globalThis.PerformanceObserver?.supportedEntryTypes?.includes('longtask') ?? false };
      for (const [name, key, maximum] of [['MutationObserver', 'observers', 'maxObservers'],
        ['IntersectionObserver', 'intersections', 'maxIntersections']]) {
        const Original = globalThis[name];
        globalThis[name] = class extends Original {
          active = false;
          observe(...args) { if (!this.active) { this.active = true; metrics[key]++; metrics[maximum] = Math.max(metrics[maximum], metrics[key]); } return super.observe(...args); }
          disconnect() { if (this.active) { this.active = false; metrics[key]--; } return super.disconnect(); }
        };
      }
      const next = TreeWalker.prototype.nextNode;
      TreeWalker.prototype.nextNode = function () { metrics.visits++; return next.call(this); };
      const schedule = globalThis.setTimeout, clear = globalThis.clearTimeout;
      globalThis.setTimeout = (fn, ms, ...args) => {
        const timer = schedule(() => { metrics.timers.delete(timer); fn(...args); }, ms);
        metrics.timers.add(timer); metrics.maxTimers = Math.max(metrics.maxTimers, metrics.timers.size); return timer;
      };
      globalThis.clearTimeout = timer => { metrics.timers.delete(timer); clear(timer); };
      try {
        const observer = new globalThis.PerformanceObserver(entries => {
          for (const entry of entries.getEntries()) metrics.longestTask = Math.max(metrics.longestTask, entry.duration);
        });
        observer.observe({ type: 'longtask', buffered: true }); globalThis.__hardeningLongTaskObserver = observer;
      } catch { metrics.longTasksSupported = false; }
    } }), tabId);
    const metrics = () => worker.evaluate(async id => (await chrome.scripting.executeScript({ target: { tabId: id }, func: () => {
      const value = globalThis.__hardeningMetrics; return { ...value, timers: value.timers.size };
    } }))[0].result, tabId);
    await instrument();
    await page.evaluate(() => window.__antiMirrorFixture.mutationStorm());
    await page.waitForTimeout(1100);
    let snapshot = await metrics();
    expect({ observers: snapshot.observers, intersections: snapshot.intersections, timers: snapshot.timers, visits: snapshot.visits })
      .toEqual({ observers: 0, intersections: 0, timers: 0, visits: 0 });
    const popup = await openPopup(page);
    await popup.click(); await expect.poll(() => popup.text()).toBe('Video mirrored');
    const stableVisits = (await metrics()).visits; await page.waitForTimeout(1100); snapshot = await metrics();
    expect(snapshot.visits).toBe(stableVisits);
    expect([snapshot.observers, snapshot.intersections, snapshot.timers]).toEqual([2, 0, 1]);
    await popup.click(); await expect.poll(() => popup.text()).toBe('Off');
    await page.evaluate(() => window.__antiMirrorFixture.mutationStorm());
    snapshot = await metrics(); expect([snapshot.observers, snapshot.intersections, snapshot.timers]).toEqual([0, 0, 0]);

    const on = [], off = [];
    for (let cycle = 0; cycle < 100; cycle++) {
      let started = performance.now(); await popup.click();
      await expect.poll(() => popup.text(), { intervals: [5, 10, 20, 50] }).toBe('Video mirrored');
      on.push(performance.now() - started);
      expect(await page.locator('video').evaluate(video => video.getAnimations().length)).toBe(1);
      started = performance.now(); await popup.click();
      await expect.poll(() => popup.text(), { intervals: [5, 10, 20, 50] }).toBe('Off');
      off.push(performance.now() - started);
      expect(await page.locator('video').evaluate(video => video.getAnimations().length)).toBe(0);
    }
    snapshot = await metrics();
    expect([snapshot.observers, snapshot.intersections, snapshot.timers]).toEqual([0, 0, 0]);
    const timing = { onP95: percentile(on, .95), offP95: percentile(off, .95) };
    expect(timing.onP95).toBeLessThanOrEqual(500); expect(timing.offP95).toBeLessThanOrEqual(200);
    console.log('100-cycle latency ms', timing, 'resource maxima', {
      observers: snapshot.maxObservers, intersections: snapshot.maxIntersections, timers: snapshot.maxTimers });
    await popup.close();

    await page.goto(`${baseURL}/?case=no-video&large=1`);
    await page.evaluate(() => {
      const root = document.createElement('div'); const fragment = document.createDocumentFragment();
      for (let index = 0; index < 25_100; index++) fragment.append(document.createElement('span'));
      root.append(fragment); document.body.append(root);
    });
    await instrument();
    const largePopup = await openPopup(page); const started = performance.now(); await largePopup.click();
    await expect.poll(() => largePopup.text()).toBe('Could not completely inspect this page');
    const elapsed = performance.now() - started; snapshot = await metrics();
    // Instrumentation counts the terminal TreeWalker.nextNode() call; protocol visits stay capped at 25k.
    expect(snapshot.visits).toBeLessThanOrEqual(25_001);
    expect([snapshot.observers, snapshot.intersections, snapshot.timers]).toEqual([0, 0, 0]);
    expect(elapsed).toBeLessThanOrEqual(3_500);
    if (snapshot.longestTask) expect(snapshot.longestTask).toBeLessThan(50);
    console.log('large DOM', { elapsed, visits: snapshot.visits,
      longTasksSupported: snapshot.longTasksSupported, longestTask: snapshot.longestTask });
    await largePopup.close();
  } finally { await context.close(); }
});
