import { chromium, expect, test } from '@playwright/test';
import path from 'node:path';
import { popupHarness } from './popup-helper.mjs';

test('S02 production deep discovery, ranking, budgets and cleanup', async ({ baseURL }, info) => {
  test.setTimeout(90_000);
  const extension = path.resolve('.output/chrome-mv3');
  const context = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const openPopup = popupHarness(context, worker);
    const page = await context.newPage();
    const counts = () => page.evaluate(() => window.__antiMirrorFixture.videos.map(v => v.getAnimations().length));
    const load = async scenario => {
      await page.goto(`${baseURL}/?case=${scenario}`);
      await page.waitForFunction(() => !!window.__antiMirrorFixture);
    };
    const tabId = await worker.evaluate(async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id);
    const instrument = () => worker.evaluate(async id => {
      await chrome.scripting.executeScript({ target: { tabId: id }, func: () => {
        const m = globalThis.__discoveryMetrics = { observers: 0, intersections: 0, visits: 0, timers: new Set() };
        for (const [name, counter] of [['MutationObserver', 'observers'], ['IntersectionObserver', 'intersections']]) {
          const Original = globalThis[name];
          globalThis[name] = class extends Original {
            active = false;
            observe(...args) { if (!this.active) { this.active = true; m[counter]++; } return super.observe(...args); }
            disconnect() { if (this.active) { this.active = false; m[counter]--; } return super.disconnect(); }
          };
        }
        const next = TreeWalker.prototype.nextNode;
        TreeWalker.prototype.nextNode = function () { m.visits++; return next.call(this); };
        const schedule = globalThis.setTimeout, clear = globalThis.clearTimeout;
        globalThis.setTimeout = (fn, ms, ...args) => {
          const timer = schedule(() => { m.timers.delete(timer); fn(...args); }, ms);
          m.timers.add(timer); return timer;
        };
        globalThis.clearTimeout = timer => { m.timers.delete(timer); clear(timer); };
      } });
    }, tabId);
    const metrics = () => worker.evaluate(async id => (await chrome.scripting.executeScript({ target: { tabId: id },
      func: () => { const m = globalThis.__discoveryMetrics; return { ...m, timers: m.timers.size }; } }))[0].result, tabId);
    const clean = async () => { await expect.poll(async () => {
      const m = await metrics(); return [m.observers, m.intersections, m.timers];
    }).toEqual([0, 0, 0]); };

    for (const scenario of ['open', 'closed', 'nested', 'slot', 'secondary']) {
      await load(scenario); await instrument();
      const popup = await openPopup(page); await popup.click();
      await expect.poll(() => popup.text()).toBe('Видео отражено');
      expect(await counts()).toEqual(scenario === 'secondary' ? [1, 0] : [1]);
      expect((await metrics()).intersections).toBe(0);
      expect((await metrics()).timers).toBe(0);
      await page.screenshot({ path: info.outputPath(`${scenario}-on.png`) });
      // Reparent preserves identity; removing its host must cancel the owned effect.
      await page.evaluate(() => window.__antiMirrorFixture.reparentVideo());
      expect((await counts())[0]).toBe(1);
      if (scenario === 'closed') {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        expect((await counts())[0]).toBe(1);
      }
      await popup.click(); await expect.poll(() => popup.text()).toBe('Выключено'); await clean();
      await popup.close();
    }

    await load('closed'); await instrument();
    let hostPopup = await openPopup(page); await hostPopup.click();
    await expect.poll(() => hostPopup.text()).toBe('Видео отражено');
    await page.evaluate(() => document.querySelector('#stage > .shadow-host').remove());
    await expect.poll(counts).toEqual([0]); await clean();
    await hostPopup.close(); hostPopup = await openPopup(page);
    await expect.poll(() => hostPopup.text()).toBe('Выключено: видео удалено'); await hostPopup.close();

    await load('multiple');
    await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
    await page.waitForFunction(() => !!document.fullscreenElement);
    let fullscreenPopup = await openPopup(page); await fullscreenPopup.click();
    await expect.poll(() => fullscreenPopup.text()).toBe('Стили страницы мешают отражению');
    expect(await counts()).toEqual([0, 0]);
    await fullscreenPopup.close(); await page.evaluate(() => document.exitFullscreen());
    await page.locator('figcaption').first().evaluate(el => el.addEventListener('click', () => el.parentElement.requestFullscreen(), { once: true }));
    await page.locator('figcaption').first().click();
    await page.waitForFunction(() => document.fullscreenElement?.tagName === 'FIGURE');
    fullscreenPopup = await openPopup(page); await fullscreenPopup.click();
    await expect.poll(() => fullscreenPopup.text()).toBe('Видео отражено');
    expect(await counts()).toEqual([1, 0]);
    await fullscreenPopup.click(); await fullscreenPopup.close();
    await page.evaluate(() => document.exitFullscreen());

    for (const style of ['opacity:0', 'visibility:hidden', 'display:none', 'position:fixed;left:-4000px', 'width:20px;height:20px']) {
      await load('multiple');
      await page.locator('figure').first().evaluate((el, style) => el.setAttribute('style', style), style);
      const popup = await openPopup(page); await popup.click();
      await expect.poll(() => popup.text()).toBe('Видео отражено');
      expect(await counts()).toEqual([0, 1]);
      await popup.click(); await popup.close();
    }

    for (const scenario of ['late-shadow', 'no-video']) {
      await load(scenario); await instrument();
      const popup = await openPopup(page); await popup.click();
      await page.waitForTimeout(scenario === 'late-shadow' ? 750 : 250);
      if (scenario === 'late-shadow') await page.evaluate(() => window.__antiMirrorFixture.attachLate());
      else await page.getByRole('button', { name: 'Добавить video', exact: true }).evaluate(button => button.click());
      await expect.poll(() => popup.text()).toBe('Видео отражено');
      expect(await counts()).toEqual([1]);
      await popup.click(); await clean(); await popup.close();
    }

    await load('no-video'); await instrument();
    await page.evaluate(() => {
      const template = document.createElement('template'); template.innerHTML = '<video></video>'; document.body.append(template);
    });
    let popup = await openPopup(page); await popup.click();
    await expect.poll(() => popup.text()).toBe('Подходящее видео не найдено'); await clean();
    const before = (await metrics()).visits;
    await page.getByRole('button', { name: 'Добавить video', exact: true }).evaluate(button => button.click());
    await page.waitForTimeout(200);
    expect(await counts()).toEqual([0]); expect((await metrics()).visits).toBe(before);
    await popup.click(); await expect.poll(() => popup.text()).toBe('Видео отражено');
    await page.evaluate(() => window.__antiMirrorFixture.replaceVideo());
    await expect.poll(counts).toEqual([0, 0]);
    await popup.close(); popup = await openPopup(page);
    await expect.poll(() => popup.text()).toBe('Выключено: видео удалено'); await clean(); await popup.close();

    await load('late-shadow'); await instrument();
    popup = await openPopup(page); await popup.click(); await page.waitForTimeout(100); await popup.click();
    await expect.poll(() => popup.text()).toBe('Выключено'); await clean();
    await page.evaluate(() => window.__antiMirrorFixture.attachLate());
    await page.waitForTimeout(600); expect(await counts()).toEqual([0]); await clean(); await popup.close();

    for (const budget of ['elements', 'roots', 'candidates']) {
      await load('no-video');
      await page.evaluate(budget => {
        const parent = document.createElement('div'); document.body.append(parent);
        for (let i = 0; i < (budget === 'elements' ? 26_000 : budget === 'roots' ? 257 : 33); i++) {
          const el = document.createElement(budget === 'candidates' ? 'video' : 'div'); parent.append(el);
          if (budget === 'roots') el.attachShadow({ mode: 'closed' });
        }
      }, budget);
      await instrument(); popup = await openPopup(page); await popup.click();
      await expect.poll(() => popup.text()).toBe('Не удалось полностью проверить страницу'); await clean();
      const m = await metrics(); expect(m.visits).toBeLessThan(26_000);
      console.log(budget, m); await popup.close();
    }

    for (const fault of ['constructor', 'no-geometry']) {
      await load('basic'); await instrument();
      await worker.evaluate(async ({ id, fault }) => chrome.scripting.executeScript({ target: { tabId: id },
        args: [fault], func: fault => {
          const Original = globalThis.IntersectionObserver;
          globalThis.IntersectionObserver = fault === 'constructor'
            ? class { constructor() { throw new Error('Test: IO unavailable'); } }
            : class extends Original { observe() {} };
        } }), { id: tabId, fault });
      popup = await openPopup(page); await popup.click();
      await expect.poll(() => popup.text()).toBe('Не удалось полностью проверить страницу');
      expect(await counts()).toEqual([0]); await clean(); await popup.close();
    }

    await load('mutations'); await instrument();
    await page.evaluate(() => window.__antiMirrorFixture.mutationStorm());
    await page.waitForTimeout(600);
    expect((await metrics()).visits).toBe(0); await clean();
    console.log('S02', context.browser()?.version(), 'native roots, ranking, incremental discovery, budgets, OFF cleanup PASS');
  } finally { await context.close(); }
});
