import { chromium, expect, test } from '@playwright/test';
import path from 'node:path';

test('S00 native extension capabilities', async ({ baseURL }, info) => {
  const extension = path.resolve('.output-spike/chrome-mv3');
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).host;
    const probe = await context.newPage();
    await probe.goto(`chrome-extension://${id}/probe.html`);
    const page = await context.newPage();
    console.log('Browser:', context.browser()?.version());
    for (const scenario of ['closed', 'transforms', 'frame-srcdoc', 'frame-blank']) {
      await page.goto(`${baseURL}/?case=${scenario}`);
      const embedded = scenario.startsWith('frame-');
      if (embedded) await expect.poll(() => page.frames().length).toBe(2);
      await expect.poll(async () => {
        const frames = await probe.evaluate(() => globalThis.probe.frames());
        return frames.find(f => embedded ? f.frameId !== 0 : f.frameId === 0)?.reply;
      }).toBeTruthy();
      const frames = await probe.evaluate(() => globalThis.probe.frames());
      const target = frames.find(f => embedded ? f.frameId !== 0 : f.frameId === 0);
      const send = message => probe.evaluate(({ target, message }) => globalThis.probe.send(target.tabId, target.frameId, message), { target, message });
      let result;
      await expect.poll(async () => { result = await send('SPIKE_APPLY'); return !!result.before; }).toBe(true);
      if (scenario === 'closed') expect(result.closed).toBe(true);
      expect(result.during.style).toBe(result.before.style);
      expect(result.during.origin).toBe(result.before.origin);
      expect(result.during.animations).toBe(result.before.animations + 1);
      const matrices = await page.evaluate(result => ({
        expected: Array.from(new DOMMatrix(result.before.transform === 'none' ? undefined : result.before.transform).scale(-1, 1).toFloat64Array()),
        actual: Array.from(new DOMMatrix(result.during.transform).toFloat64Array()),
      }), result);
      matrices.actual.forEach((n, i) => expect(n).toBeCloseTo(matrices.expected[i], 5));
      await page.screenshot({ path: info.outputPath(`${scenario}-on.png`) });
      const cancel = await send('SPIKE_CANCEL');
      expect(cancel.after).toEqual(cancel.before);
      await page.screenshot({ path: info.outputPath(`${scenario}-off.png`) });
      console.log(scenario, JSON.stringify(result));
    }
    const frames = await probe.evaluate(() => globalThis.probe.frames());
    const target = frames.find(f => f.frameId !== 0);
    const active = await probe.evaluate(t => globalThis.probe.send(t.tabId, t.frameId, 'SPIKE_APPLY'), target);
    await probe.evaluate(() => globalThis.probe.writeSession());
    const idleBoot = await probe.evaluate(() => globalThis.probe.boot());
    const cdp = await context.newCDPSession(page);
    await cdp.send('ServiceWorker.enable');
    await cdp.send('ServiceWorker.stopAllWorkers');
    expect(await probe.evaluate(() => globalThis.probe.readSession())).toEqual({ spike: 'survives-worker-stop' });
    const restartedBoot = await probe.evaluate(() => globalThis.probe.boot());
    expect(restartedBoot).not.toBe(idleBoot);
    expect(await probe.evaluate(t => globalThis.probe.send(t.tabId, t.frameId, 'SPIKE_SNAPSHOT'), target)).toEqual(active.during);
    await probe.evaluate(t => globalThis.probe.send(t.tabId, t.frameId, 'SPIKE_CANCEL'), target);
    console.log('storage.session + active effect after confirmed worker restart PASS');
  } finally { await context.close(); }
});
