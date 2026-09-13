import { chromium, expect, test } from '@playwright/test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { popupHarness } from './popup-helper.mjs';

const extension = path.resolve('.output/chrome-mv3');

test('S05 popup, shortcut and renderer compatibility', async ({ baseURL }) => {
  test.setTimeout(90_000);
  const context = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true, locale: 'en-US',
    args: ['--lang=en', `--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const openPopup = popupHarness(context, worker);
    const page = await context.newPage();
    const load = async scenario => {
      await page.goto(`${baseURL}/?case=${scenario}`);
      await page.waitForFunction(() => !!window.__antiMirrorFixture);
    };
    const animations = () => page.locator('video').evaluate(video => video.getAnimations().length);
    const command = (await worker.evaluate(() => chrome.commands.getAll())).find(item => item.name === 'toggle-mirror');
    expect(command?.shortcut).toBeTruthy();

    await load('basic');
    let popup = await openPopup(page);
    expect(await popup.evaluate('document.documentElement.lang')).toBe('en');
    expect(await popup.evaluate('document.querySelectorAll("button").length')).toBe(1);
    expect(await popup.evaluate('document.querySelectorAll("select").length')).toBe(1);
    expect(await popup.evaluate('document.querySelector("#language").getAttribute("title")')).toBe('Popup language');
    expect(await popup.evaluate('document.querySelector("#status").getAttribute("aria-live")')).toBe('polite');
    expect(await popup.evaluate('document.querySelector("#toggle").getAttribute("aria-describedby")')).toBe('shortcut');
    expect(await popup.evaluate('document.querySelector("#shortcut").textContent')).toContain(command.shortcut);
    await popup.evaluate(`const select=document.querySelector('#language');select.value='ru';select.dispatchEvent(new Event('change',{bubbles:true}))`);
    await expect.poll(() => popup.text()).toBe('Выключено');
    await popup.close();
    popup = await openPopup(page);
    expect(await popup.evaluate('document.documentElement.lang')).toBe('ru');
    expect(await popup.evaluate('document.querySelector("#toggle").textContent')).toBe('Включить');
    await popup.evaluate(`const select=document.querySelector('#language');select.value='en';select.dispatchEvent(new Event('change',{bubbles:true}))`);
    await expect.poll(() => popup.text()).toBe('Off');
    await popup.close();

    await load('transforms');
    const before = await page.locator('video').evaluate(video => ({
      style: video.getAttribute('style'), transform: getComputedStyle(video).transform,
      origin: getComputedStyle(video).transformOrigin, backface: getComputedStyle(video).backfaceVisibility,
    }));
    popup = await openPopup(page); await popup.click(); await expect.poll(() => popup.text()).toBe('Video mirrored');
    const during = await page.locator('video').evaluate(video => ({
      style: video.getAttribute('style'), transform: getComputedStyle(video).transform,
      origin: getComputedStyle(video).transformOrigin, backface: getComputedStyle(video).backfaceVisibility,
    }));
    expect(during.style).toBe(before.style); expect(during.origin).toBe(before.origin); expect(during.backface).toBe(before.backface);
    const expected = await page.evaluate(transform => Array.from(new DOMMatrix(transform).scale(-1, 1).toFloat64Array()), before.transform);
    const actual = await page.evaluate(transform => Array.from(new DOMMatrix(transform).toFloat64Array()), during.transform);
    actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index], 5));
    await page.locator('video').evaluate(video => { video.style.transform = 'translateX(44px) scale(.8)'; });
    await popup.click(); await expect.poll(() => popup.text()).toBe('Off');
    expect(await page.locator('video').getAttribute('style')).toContain('translateX(44px) scale(0.8)');
    await popup.close();

    await load('important');
    const important = await page.locator('video').evaluate(video => ({ style: video.getAttribute('style'), transform: getComputedStyle(video).transform }));
    popup = await openPopup(page); await popup.click();
    await expect.poll(() => popup.text()).toBe('Page styles prevent safe mirroring');
    expect(await animations()).toBe(0);
    expect(await page.locator('video').evaluate(video => ({ style: video.getAttribute('style'), transform: getComputedStyle(video).transform }))).toEqual(important);
    await popup.close();

    await load('site-animation');
    const siteAnimation = await page.locator('video').evaluate(video => video.getAnimations()[0]?.currentTime);
    popup = await openPopup(page); await popup.click();
    await expect.poll(() => popup.text()).toMatch(/Video mirrored|Page styles prevent safe mirroring/);
    const siteResult = await popup.text();
    if (siteResult === 'Video mirrored') await popup.click();
    await page.waitForTimeout(120);
    expect(await page.locator('video').evaluate(video => video.getAnimations().some(animation =>
      animation.animationName === 'site-motion' && Number(animation.currentTime) > 0))).toBe(true);
    expect(Number(siteAnimation)).toBeGreaterThanOrEqual(0);
    await popup.close();

    await load('origin-corner');
    const origin = await page.locator('video').evaluate(video => getComputedStyle(video).transformOrigin);
    popup = await openPopup(page); await popup.click(); await expect.poll(() => popup.text()).toBe('Video mirrored');
    expect(await page.locator('video').evaluate(video => getComputedStyle(video).transformOrigin)).toBe(origin);
    await popup.click(); await popup.close();

    await load('basic');
    popup = await openPopup(page); await popup.click(); await expect.poll(() => popup.text()).toBe('Video mirrored');
    expect(await page.locator('video').evaluate(video => video.controls)).toBe(true);
    expect(await page.locator('figcaption').evaluate(caption => ({ animations: caption.getAnimations().length, transform: getComputedStyle(caption).transform })))
      .toEqual({ animations: 0, transform: 'none' });
    await page.locator('video').evaluate(video => video.dispatchEvent(new window.Event('enterpictureinpicture')));
    await expect.poll(() => popup.evaluate('chrome.tabs.query({active:true,currentWindow:true}).then(([tab])=>chrome.runtime.sendMessage({protocolVersion:1,type:"GET_STATE",tabId:tab.id,requestId:crypto.randomUUID()})).then(state=>state.reason)'))
      .toBe('PIP_UNSUPPORTED');
    await popup.close();
    await load('basic');
    popup = await openPopup(page); await popup.click(); await expect.poll(() => popup.text()).toBe('Video mirrored');
    await page.locator('video').evaluate(video => video.getAnimations().forEach(animation => animation.cancel()));
    await expect.poll(() => popup.evaluate('chrome.tabs.query({active:true,currentWindow:true}).then(([tab])=>chrome.runtime.sendMessage({protocolVersion:1,type:"GET_STATE",tabId:tab.id,requestId:crypto.randomUUID()})).then(state=>state.reason)'))
      .toBe('EFFECT_LOST');
    await popup.close(); popup = await openPopup(page);
    expect(await popup.text()).toBe('The page removed the mirror effect'); await popup.close();
    console.log('S05 popup/a11y, declared shortcut, transforms, conflict, site animation, controls/overlay and PiP policy PASS');
  } finally { await context.close(); }
});

test('S05 English locale and unassigned-shortcut display', async ({ baseURL }) => {
  const unassignedExtension = await mkdtemp(path.join(os.tmpdir(), 'antimirror-unassigned-'));
  await cp(extension, unassignedExtension, { recursive: true });
  const manifestPath = path.join(unassignedExtension, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  delete manifest.commands['toggle-mirror'].suggested_key;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const context = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true, locale: 'en-US',
    args: ['--lang=en', `--disable-extensions-except=${unassignedExtension}`, `--load-extension=${unassignedExtension}`] });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const page = await context.newPage(); await page.goto(`${baseURL}/?case=basic`);
    const popup = await popupHarness(context, worker)(page);
    expect(await popup.evaluate('document.documentElement.lang')).toBe('en');
    expect(await popup.text()).toBe('Off');
    expect(await popup.evaluate('document.querySelector("#toggle").textContent')).toBe('Turn on');
    expect(await popup.evaluate('document.querySelector("#shortcut").textContent')).toBe(
      'Shortcut is not assigned. Set it in the browser’s extension shortcut settings.');
    await popup.close();
  } finally { await context.close(); await rm(unassignedExtension, { recursive: true, force: true }); }
});
