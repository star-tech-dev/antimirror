import { chromium, expect, test } from '@playwright/test';
import path from 'node:path';
import { popupHarness } from './popup-helper.mjs';

test('S03 production frame selection, binding, navigation and security', async ({ baseURL }, info) => {
  test.setTimeout(120_000);
  const extension = path.resolve('.output/chrome-mv3');
  const context = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true, locale: 'en-US',
    args: ['--lang=en', `--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const openPopup = popupHarness(context, worker);
    const page = await context.newPage();
    const videos = async () => {
      const values = [];
      for (const frame of page.frames()) {
        const rows = await frame.evaluate(() => (window.__antiMirrorFixture?.videos ?? [...document.querySelectorAll('video')])
          .map(v => ({ count: v.getAnimations().length, transform: getComputedStyle(v).transform })));
        values.push(...rows);
      }
      return values;
    };
    const state = async popup => popup.evaluate(`chrome.tabs.query({}).then(tabs => chrome.runtime.sendMessage({
      protocolVersion: 1, type: 'GET_STATE', tabId: tabs.find(t => t.url === ${JSON.stringify(page.url())}).id, requestId: crypto.randomUUID() }))`);
    for (const scenario of ['frame-same', 'frame-cross', 'shadow-frame-closed', 'frame-three', 'frame-hidden', 'frame-srcdoc', 'frame-blank']) {
      await page.goto(`${baseURL}/?case=${scenario}`);
      await expect.poll(async () => (await videos()).length).toBeGreaterThan(0);
      if (scenario === 'frame-three') await expect.poll(() => page.frames().length).toBe(4);
      const popup = await openPopup(page); await popup.click();
      await expect.poll(() => popup.text()).toBe('Video mirrored');
      expect((await videos()).filter(v => v.count === 1)).toHaveLength(1);
      const on = await state(popup);
      expect(on.phase).toBe('on');
      expect(on.target.frameId === 0).toBe(scenario === 'frame-hidden');
      expect(on.ancestors.length).toBe(scenario === 'frame-three' ? 3 : scenario === 'frame-hidden' ? 0 : 1);
      const containers = await page.evaluate(() => window.__antiMirrorFixture.frames.map(f => ({ count: f.getAnimations().length, transform: getComputedStyle(f).transform })));
      expect(containers.every(f => f.count === 0 && f.transform === 'none')).toBe(true);
      await page.screenshot({ path: info.outputPath(`${scenario}-on.png`) });
      if (scenario === 'frame-same') {
        await page.evaluate(() => { const ad = window.__antiMirrorFixture.frames[1]; ad.src = ad.src + '&reload=1'; });
        await page.waitForTimeout(150);
        expect((await state(popup)).phase).toBe('on');
        await page.evaluate(() => window.__antiMirrorFixture.frames[1].remove());
        expect((await state(popup)).phase).toBe('on');
      }
      if (scenario === 'shadow-frame-closed') await page.evaluate(() => document.querySelector('#stage > .shadow-host').remove());
      else if (scenario === 'frame-three') await page.evaluate(() => { const frame = window.__antiMirrorFixture.frames[0]; frame.src = frame.src + '&reload=1'; });
      else if (scenario !== 'frame-hidden') await page.evaluate(() => window.__antiMirrorFixture.frames[0].remove());
      else await popup.click();
      await expect.poll(async () => (await state(popup)).phase).toBe('off');
      await popup.close();
    }

    for (const scenario of ['frame-blob', 'frame-data', 'frame-sandbox']) {
      await page.goto(`${baseURL}/?case=${scenario}`); await page.waitForTimeout(200);
      const popup = await openPopup(page); await popup.click();
      await expect.poll(() => popup.text()).toMatch(/Video mirrored|Could not access the embedded player|Could not completely inspect this page/);
      const current = await state(popup);
      console.log(scenario, current.phase, current.reason ?? 'native supported');
      if (current.phase === 'on') { expect((await videos()).filter(v => v.count === 1)).toHaveLength(1); await popup.click(); }
      if (scenario === 'frame-sandbox') expect(await page.locator('iframe').getAttribute('sandbox')).toBe('allow-scripts');
      await popup.close();
    }

    await page.goto(`${baseURL}/?case=frame-late`);
    let popup = await openPopup(page); await popup.click();
    await page.waitForTimeout(100);
    await page.getByRole('button', { name: 'Добавить iframe', exact: true }).evaluate(el => el.click());
    await expect.poll(() => popup.text()).toBe('Video mirrored');
    await popup.click(); await popup.close();

    await page.goto(`${baseURL}/?case=frame-cross&resources=1`);
    await expect.poll(async () => (await videos()).length).toBe(1);
    const resourceTab = await worker.evaluate(async url => (await chrome.tabs.query({})).find(t => t.url === url).id, page.url());
    await worker.evaluate(async id => chrome.scripting.executeScript({target:{tabId:id, allFrames:true}, func:() => {
      const m = globalThis.frameResources = {mo:0, io:0, timers:new Set(), messages:new Set()};
      for (const [name, key] of [['MutationObserver','mo'], ['IntersectionObserver','io']]) {
        const Original = globalThis[name];
        globalThis[name] = class extends Original {
          active = false;
          observe(...args) { if (!this.active) {this.active=true; m[key]++;} return super.observe(...args); }
          disconnect() {if (this.active) {this.active=false; m[key]--;} return super.disconnect();}
        };
      }
      const schedule=globalThis.setTimeout, clear=globalThis.clearTimeout;
      globalThis.setTimeout=(fn,ms,...args)=>{const t=schedule(()=>{m.timers.delete(t);fn(...args);},ms);m.timers.add(t);return t;};
      globalThis.clearTimeout=t=>{m.timers.delete(t);clear(t);};
      const add=globalThis.addEventListener.bind(globalThis), remove=globalThis.removeEventListener.bind(globalThis);
      globalThis.addEventListener=(type,fn,...args)=>{if(type==='message')m.messages.add(fn);add(type,fn,...args);};
      globalThis.removeEventListener=(type,fn,...args)=>{if(type==='message')m.messages.delete(fn);remove(type,fn,...args);};
    }}), resourceTab);
    const resources = () => worker.evaluate(async id => (await chrome.scripting.executeScript({target:{tabId:id,allFrames:true},func:()=>{
      const m=globalThis.frameResources; return {mo:m.mo,io:m.io,timers:m.timers.size,messages:m.messages.size};
    }})).map(result=>result.result), resourceTab);
    popup=await openPopup(page); await popup.click(); await expect.poll(()=>popup.text()).toBe('Video mirrored');
    const activeResources = await resources();
    expect(activeResources.every(m=>m.io===0 && m.messages===0)).toBe(true);
    expect(activeResources.reduce((sum,m)=>sum+m.timers,0)).toBeLessThanOrEqual(1);
    await popup.click(); await expect.poll(async()=> (await resources()).every(m=>Object.values(m).every(n=>n===0))).toBe(true);
    console.log('all-frame OFF resources', await resources()); await popup.close();

    for (const dropped of ['PREPARE_APPLY', 'COMMIT', 'NAVIGATE']) {
      await page.goto(`${baseURL}/?case=frame-cross&failure=${dropped}`);
      await expect.poll(async () => (await videos()).length).toBe(1);
      await worker.evaluate(dropped => {
        const original = chrome.tabs.sendMessage;
        globalThis.restoreFrameTransport = () => { chrome.tabs.sendMessage = original; };
        let once = false;
        chrome.tabs.sendMessage = async (id, message, options) => {
          const reply = await original(id, message, options);
          if (!once && message.type === (dropped === 'NAVIGATE' ? 'PREPARE_APPLY' : dropped)) {
            once = true;
            if (dropped !== 'NAVIGATE') return new Promise(() => undefined);
            await chrome.scripting.executeScript({target:{tabId:id, frameIds:[options.frameId]}, func:() => location.reload()});
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          return reply;
        };
      }, dropped);
      popup = await openPopup(page); await popup.click();
      await expect.poll(async () => { const current = await state(popup); return current.phase === 'off' &&
        ['APPLY_FAILED', 'NAVIGATION'].includes(current.reason); }, {timeout:8000}).toBe(true);
      await expect.poll(async () => (await videos()).every(v => v.count === 0)).toBe(true);
      await worker.evaluate(() => globalThis.restoreFrameTransport()); await popup.close();
    }

    await page.goto(`${baseURL}/?case=frame-cross&fallback=1`);
    await expect.poll(async () => (await videos()).length).toBe(1);
    await worker.evaluate(async url => {
      const tab = (await chrome.tabs.query({})).find(t => t.url === url);
      await chrome.scripting.executeScript({ target:{tabId:tab.id, allFrames:true}, func:() => globalThis.__antiMirrorAgentV1?.dispose() });
    }, page.url());
    popup = await openPopup(page); await popup.click();
    await expect.poll(() => popup.text()).toBe('Video mirrored'); await popup.click(); await popup.close();

    await page.goto(`${baseURL}/?case=frame-cross`);
    await page.waitForTimeout(100);
    await page.evaluate(() => {
      window.postMessage({ protocolVersion: 1, type: 'SET_ENABLED', desired: true }, '*');
      window.postMessage({ namespace: 'AntiMirror', type: 'FRAME_BIND', operationId: 'forged', token: 'forged' }, '*');
    });
    expect((await videos()).every(v => v.count === 0)).toBe(true);
    popup = await openPopup(page); await popup.click();
    await expect.poll(() => popup.text()).toBe('Video mirrored');
    const on = await state(popup);
    await worker.evaluate(async ({ id, target }) => chrome.tabs.sendMessage(id, {
      protocolVersion: 1, type: 'DISABLE', requestId: 'forged', operationId: 'old', ...target,
      documentNonce: 'wrong-document' }, { frameId: target.frameId }), { id: on.tabId, target: on.target });
    expect((await videos()).filter(v => v.count === 1)).toHaveLength(1);
    await popup.click(); await popup.close();

    await page.goto(`${baseURL}/?case=no-video`);
    await page.evaluate(() => { for (let i = 0; i < 65; i++) { const frame = document.createElement('iframe'); frame.src = 'about:blank'; document.body.append(frame); } });
    await expect.poll(() => page.frames().length).toBe(66);
    popup = await openPopup(page); await popup.click();
    await expect.poll(() => popup.text()).toBe('Could not completely inspect this page'); await popup.close();
    await page.goto(`${baseURL}/?case=frame-cross&revoke=1`);
    await expect.poll(async () => (await videos()).length).toBe(1);
    popup = await openPopup(page); await popup.click();
    await expect.poll(() => popup.text()).toBe('Video mirrored');
    const revokedId = (await state(popup)).tabId;
    const extensionId = worker.url().split('/')[2];
    await popup.close();
    const settings = await context.newPage(); await settings.goto(`chrome://extensions/?id=${extensionId}`);
    await settings.locator('select#hostAccess').selectOption('ON_CLICK');
    await page.bringToFront(); popup = await openPopup(page);
    await expect.poll(() => popup.evaluate(`chrome.runtime.sendMessage({protocolVersion:1,type:'GET_STATE',tabId:${revokedId},requestId:crypto.randomUUID()})`))
      .toMatchObject({ phase: 'off', reason: 'PERMISSION_DENIED' });
    await expect.poll(() => popup.text()).toBe('Site access is unavailable. Allow access and reload the page');
    await expect.poll(async () => (await videos()).every(v => v.count === 0)).toBe(true);
    console.log('host permissions revoked: OFF PASS'); await popup.close();
    console.log('S03 Chromium', context.browser()?.version(), 'frames/bind/cleanup PASS');
  } finally { await context.close(); }
});
