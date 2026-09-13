import { chromium, expect } from '@playwright/test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { popupHarness } from '../tests/e2e/popup-helper.mjs';

const extension = path.resolve('.output/chrome-mv3');
const helper = await mkdtemp(path.join(tmpdir(), 'antimirror-management-'));
await writeFile(path.join(helper, 'manifest.json'), JSON.stringify({
  manifest_version: 3, name: 'AntiMirror lifecycle helper', version: '1.0.0',
  permissions: ['management'], background: { service_worker: 'helper.js' },
}));
await writeFile(path.join(helper, 'helper.js'), 'chrome.runtime.onInstalled.addListener(() => {});');

const launch = () => chromium.launchPersistentContext('', { channel: 'chromium', headless: true,
  args: [`--disable-extensions-except=${extension},${helper}`, `--load-extension=${extension},${helper}`] });
let context = await launch();
try {
  const productWorker = context.serviceWorkers().find(worker => worker.url().endsWith('/background.js')) ??
    await context.waitForEvent('serviceworker', { predicate: worker => worker.url().endsWith('/background.js') });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${process.env.FIXTURE_PORT ?? 4173}/?case=basic`);
  await expect(page.locator('video')).toBeVisible();
  const popup = await popupHarness(context, productWorker)(page);
  await popup.click(); await expect.poll(() => popup.text()).toBe('Video mirrored');
  await expect.poll(() => page.locator('video').evaluate(video => video.getAnimations().length)).toBe(1);
  await popup.close();
  console.log('clean-profile install and first activation PASS');

  await productWorker.evaluate(() => chrome.runtime.reload());
  const effectsAfterRuntimeReload = await page.locator('video').evaluate(video => video.getAnimations().length);
  await page.reload(); await expect(page.locator('video')).toBeVisible();
  await expect.poll(() => page.locator('video').evaluate(video => video.getAnimations().length)).toBe(0);
  console.log(`runtime reload boundary PASS; immediate effects=${effectsAfterRuntimeReload}, page reload effects=0`);
} finally { await context.close().catch(() => undefined); }

context = await launch();
try {
  const productWorker = context.serviceWorkers().find(worker => worker.url().endsWith('/background.js')) ??
    await context.waitForEvent('serviceworker', { predicate: worker => worker.url().endsWith('/background.js') });
  const helperWorker = context.serviceWorkers().find(worker => worker.url().endsWith('/helper.js')) ??
    await context.waitForEvent('serviceworker', { predicate: worker => worker.url().endsWith('/helper.js') });
  const extensionId = new URL(productWorker.url()).host;
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${process.env.FIXTURE_PORT ?? 4173}/?case=basic`);
  await expect(page.locator('video')).toBeVisible();
  const popup = await popupHarness(context, productWorker)(page);
  await popup.click(); await expect.poll(() => popup.text()).toBe('Video mirrored'); await popup.close();
  const disabled = await helperWorker.evaluate(async id => {
    try { await chrome.management.setEnabled(id, false); return 'disabled'; }
    catch (error) { return String(error); }
  }, extensionId);
  expect(disabled).toBe('disabled');
  const effectsAfterDisable = await page.locator('video').evaluate(video => video.getAnimations().length);
  if (effectsAfterDisable !== 0) {
    await page.reload(); await expect(page.locator('video')).toBeVisible();
    await expect.poll(() => page.locator('video').evaluate(video => video.getAnimations().length)).toBe(0);
  }
  console.log(`disable flow PASS; immediate effects=${effectsAfterDisable}, reload effects=0`);
} finally {
  await context.close();
  await rm(helper, { recursive: true, force: true });
}
