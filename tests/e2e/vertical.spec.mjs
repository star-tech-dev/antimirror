import { chromium, expect, test } from '@playwright/test';
import path from 'node:path';

test('S01 manual popup flow is isolated, reversible and reset on reload', async ({ baseURL }, info) => {
  const extension = path.resolve('.output/chrome-mv3');
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    let popupCommandId = 0;
    const openPopup = async page => {
      await page.bringToFront();
      await worker.evaluate(() => chrome.action.openPopup());
      const cdp = await context.newCDPSession(page);
      let target;
      await expect.poll(async () => {
        target = (await cdp.send('Target.getTargets')).targetInfos.find(item => item.type === 'page' && item.url.endsWith('/popup.html'));
        return !!target;
      }).toBe(true);
      const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: false });
      const pending = new Map();
      cdp.on('Target.receivedMessageFromTarget', event => {
        if (event.sessionId !== sessionId) return;
        const message = JSON.parse(event.message);
        const resolve = pending.get(message.id);
        if (resolve) { pending.delete(message.id); resolve(message); }
      });
      const send = async (method, params = {}) => {
        const id = ++popupCommandId;
        const response = new Promise(resolve => pending.set(id, resolve));
        await cdp.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method, params }) });
        const message = await response;
        if (message.error) throw new Error(message.error.message);
        return message.result;
      };
      const evaluate = async expression => {
        const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
        return result.result.value;
      };
      const popup = {
        text: selector => evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent`),
        enabled: selector => evaluate(`!document.querySelector(${JSON.stringify(selector)})?.disabled`),
        click: selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`),
        evaluate,
        close: () => cdp.send('Target.closeTarget', { targetId: target.targetId }),
      };
      await expect.poll(() => popup.enabled('#toggle')).toBe(true);
      return popup;
    };
    const tabId = page => worker.evaluate(async url => {
      const tabs = await chrome.tabs.query({});
      return tabs.find(tab => tab.url === url)?.id;
    }, page.url());
    const actionTitle = async page => worker.evaluate(async id => chrome.action.getTitle({ tabId: id }), await tabId(page));
    const animationCount = page => page.locator('video').evaluate(video => video.getAnimations().length);
    const transform = page => page.locator('video').evaluate(video => getComputedStyle(video).transform);

    const a = await context.newPage();
    await a.goto(`${baseURL}/?case=basic&tab=a`);
    await expect(a.locator('video')).toBeVisible();
    expect(await animationCount(a)).toBe(0);

    let popup = await openPopup(a);
    await expect.poll(() => popup.text('#status')).toBe('Выключено');
    expect(await animationCount(a)).toBe(0);
    await popup.close();

    popup = await openPopup(a);
    await popup.click('#toggle');
    await expect.poll(() => popup.text('#status')).toBe('Видео отражено');
    expect(await animationCount(a)).toBe(1);
    expect(await transform(a)).toBe('matrix(-1, 0, 0, 1, 0, 0)');
    expect(await actionTitle(a)).toBe('AntiMirror — ON');
    await a.screenshot({ path: info.outputPath('tab-a-on.png') });
    await popup.close();

    const b = await context.newPage();
    await b.goto(`${baseURL}/?case=basic&tab=b`);
    await expect(b.locator('video')).toBeVisible();
    popup = await openPopup(b);
    await expect.poll(() => popup.text('#status')).toBe('Выключено');
    await popup.click('#toggle');
    await expect.poll(() => popup.text('#status')).toBe('Видео отражено');
    expect(await animationCount(a)).toBe(1);
    expect(await animationCount(b)).toBe(1);
    await popup.click('#toggle');
    await expect.poll(() => popup.text('#status')).toBe('Выключено');
    expect(await animationCount(a)).toBe(1);
    expect(await animationCount(b)).toBe(0);
    await popup.close();

    popup = await openPopup(a);
    await popup.click('#toggle');
    await expect.poll(() => popup.text('#status')).toBe('Выключено');
    expect(await animationCount(a)).toBe(0);
    expect(await actionTitle(a)).toBe('AntiMirror — OFF');
    await popup.close();

    const paused = await context.newPage();
    await paused.goto(`${baseURL}/?case=basic&tab=paused`);
    await paused.locator('video').evaluate(video => video.pause());
    popup = await openPopup(paused);
    await popup.click('#toggle');
    await expect.poll(() => popup.text('#status')).toBe('Видео отражено');
    expect(await paused.locator('video').evaluate(video => video.paused)).toBe(true);
    await popup.click('#toggle');
    await popup.close();

    const none = await context.newPage();
    await none.goto(`${baseURL}/?case=no-video`);
    popup = await openPopup(none);
    await popup.click('#toggle');
    await expect.poll(() => popup.text('#status')).toBe('Подходящее видео не найдено');
    expect(await actionTitle(none)).toBe('AntiMirror — OFF');
    await popup.close();

    const ambiguous = await context.newPage();
    await ambiguous.goto(`${baseURL}/?case=multiple`);
    popup = await openPopup(ambiguous);
    await popup.click('#toggle');
    await expect.poll(() => popup.text('#status')).toBe('Найдено несколько видео');
    expect(await ambiguous.locator('video').evaluateAll(videos => videos.map(video => video.getAnimations().length))).toEqual([0, 0]);
    await popup.close();

    const rapid = await context.newPage();
    await rapid.goto(`${baseURL}/?case=basic&tab=rapid`);
    popup = await openPopup(rapid);
    await popup.evaluate(`document.querySelector('#toggle').click(); document.querySelector('#toggle').click()`);
    await expect.poll(() => popup.text('#status')).toBe('Выключено');
    await expect.poll(() => animationCount(rapid)).toBe(0);
    await popup.close();

    const reinjected = await context.newPage();
    await reinjected.goto(`${baseURL}/?case=basic&tab=reinjected`);
    const reinjectedId = await tabId(reinjected);
    await worker.evaluate(async id => {
      await chrome.scripting.executeScript({ target: { tabId: id }, files: ['content-scripts/content.js'] });
      await chrome.scripting.executeScript({ target: { tabId: id }, files: ['content-scripts/content.js'] });
    }, reinjectedId);
    popup = await openPopup(reinjected);
    const duplicate = { protocolVersion: 1, type: 'SET_ENABLED', tabId: reinjectedId, desired: true, requestId: 'duplicate-request' };
    const [first, second] = await popup.evaluate(`Promise.all([
      chrome.runtime.sendMessage(${JSON.stringify(duplicate)}), chrome.runtime.sendMessage(${JSON.stringify(duplicate)})
    ])`);
    expect(first).toEqual(second);
    expect(first.phase).toBe('on');
    expect(await animationCount(reinjected)).toBe(1);
    await popup.close();
    popup = await openPopup(reinjected);
    await expect.poll(() => popup.text('#status')).toBe('Видео отражено');
    await popup.click('#toggle');
    await expect.poll(() => animationCount(reinjected)).toBe(0);
    await popup.close();

    const styled = await context.newPage();
    await styled.goto(`${baseURL}/?case=transforms`);
    popup = await openPopup(styled);
    await popup.click('#toggle');
    await expect.poll(() => popup.text('#status')).toBe('Видео отражено');
    expect(await transform(styled)).toBe('matrix(-0.898767, -0.0471024, -0.0471024, 0.898767, 18, 0)');
    await styled.locator('video').evaluate(video => { video.style.transform = 'translateX(44px) scale(.8)'; });
    await popup.click('#toggle');
    await expect.poll(() => popup.text('#status')).toBe('Выключено');
    expect(await styled.locator('video').getAttribute('style')).toContain('translateX(44px) scale(0.8)');
    expect(await transform(styled)).toBe('matrix(0.8, 0, 0, 0.8, 44, 0)');
    await popup.close();

    popup = await openPopup(a);
    await popup.click('#toggle');
    await expect.poll(() => popup.text('#status')).toBe('Видео отражено');
    await popup.close();
    await a.reload();
    await expect(a.locator('video')).toBeVisible();
    await expect.poll(() => actionTitle(a)).toBe('AntiMirror — OFF');
    expect(await animationCount(a)).toBe(0);
    popup = await openPopup(a);
    await expect.poll(() => popup.text('#status')).toBe('Выключено после загрузки страницы');
    await popup.close();

    const reloadRace = await context.newPage();
    await reloadRace.goto(`${baseURL}/?case=basic&tab=reload-race`);
    popup = await openPopup(reloadRace);
    await popup.evaluate(`document.querySelector('#toggle').click()`);
    await reloadRace.reload();
    await expect(reloadRace.locator('video')).toBeVisible();
    await expect.poll(() => actionTitle(reloadRace)).toBe('AntiMirror — OFF');
    expect(await animationCount(reloadRace)).toBe(0);
    await popup.close().catch(() => undefined);

    const restricted = await context.newPage();
    await restricted.goto('chrome://version/');
    popup = await openPopup(restricted);
    await popup.click('#toggle');
    await expect.poll(() => popup.text('#status')).toBe('Страница недоступна. Обновите её и попробуйте снова');
    expect(await actionTitle(restricted)).toMatch(/^AntiMirror/);
    await popup.close();

    console.log('Browser:', context.browser()?.version(), 'popup/manual activation path PASS');
  } finally { await context.close(); }
});
