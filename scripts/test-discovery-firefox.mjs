import { Builder } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';
import { download } from 'geckodriver';
import path from 'node:path';
import assert from 'node:assert/strict';

const binary = await download('0.36.0', path.resolve('.browser-cache/geckodriver'));
const uuid = 'cae27e88-642f-46f1-8e87-13b627e42b50';
const options = new firefox.Options().setBinary(process.env.FIREFOX_BINARY ?? '/Applications/Firefox.app/Contents/MacOS/firefox')
  .addArguments('-headless', '-no-remote', '--remote-allow-system-access')
  .setPreference('extensions.webextensions.uuids', JSON.stringify({ 'antimirror@local.invalid': uuid }));
const driver = await new Builder().forBrowser('firefox').setFirefoxOptions(options)
  .setFirefoxService(new firefox.ServiceBuilder(binary)).build();
try {
  await driver.installAddon(path.resolve('.output/firefox-mv3'), true);
  console.log('Firefox production discovery', (await driver.getCapabilities()).get('browserVersion'));
  await driver.get(`moz-extension://${uuid}/popup.html`);
  const extension = await driver.getWindowHandle();
  await driver.switchTo().newWindow('tab');
  const fixture = await driver.getWindowHandle();
  const evaluate = async (script, ...args) => {
    await driver.switchTo().window(extension);
    await driver.executeScript(`window.discoveryTestResult = null; Promise.resolve((async () => { ${script} })()).then(value => { window.discoveryTestResult = { value }; }, e => { window.discoveryTestResult = { value: { error: String(e) } }; });`, ...args);
    await driver.switchTo().window(fixture);
    // Keep the actual target visible while native IntersectionObserver delivers geometry.
    const wrapped = await driver.wait(async () => {
      await driver.executeAsyncScript('const done = arguments[arguments.length - 1]; setTimeout(done, 100)');
      await driver.switchTo().window(extension);
      const result = await driver.executeScript('return window.discoveryTestResult');
      await driver.switchTo().window(fixture);
      return result;
    }, 7000);
    const result = wrapped.value;
    assert.ok(!result?.error, JSON.stringify(result)); return result;
  };
  for (const scenario of ['open', 'closed', 'nested', 'slot', 'secondary', 'late-shadow']) {
    await driver.switchTo().window(fixture);
    const url = `http://127.0.0.1:${process.env.FIXTURE_PORT ?? 4173}/?case=${scenario}`;
    await driver.get(url);
    await driver.wait(() => driver.executeScript('return !!window.__antiMirrorFixture'), 5000);
    if (scenario === 'late-shadow') await driver.executeScript('setTimeout(() => window.__antiMirrorFixture.attachLate(), 500)');
    // Real production content module through native extension messaging. No test-only entrypoint.
    const result = await evaluate(`
      const tab = (await browser.tabs.query({})).find(t => t.url === arguments[0]);
      const send = message => browser.tabs.sendMessage(tab.id, { protocolVersion: 1, requestId: crypto.randomUUID(), ...message }, { frameId: 0 });
      const probe = await send({ type: 'PROBE' });
      const operationId = crypto.randomUUID();
      const found = await send({ type: 'DISCOVER', documentNonce: probe.documentNonce, operationId });
      const selected = found.candidates?.slice().sort((a,b) => b.visibleArea - a.visibleArea)[0];
      if (!found.complete || !selected) return { found };
      const target = { operationId, frameId: 0, documentNonce: probe.documentNonce, targetId: selected.targetId, mediaToken: selected.mediaToken };
      const applied = await send({ type: 'PREPARE_APPLY', ...target });
      const committed = await send({ type: 'COMMIT', ...target });
      window.discoveryTestTarget = target; window.discoveryTestTab = tab.id;
      return { found, applied, committed };
    `, url);
    assert.equal(result.found.complete, true, JSON.stringify(result));
    assert.equal(result.found.closedRoots, true, JSON.stringify(result));
    assert.equal(result.found.candidates.length, scenario === 'secondary' ? 2 : 1);
    assert.equal(result.applied.type, 'APPLIED'); assert.equal(result.committed.type, 'COMMITTED');
    await driver.switchTo().window(fixture);
    const during = await driver.executeScript('return window.__antiMirrorFixture.videos.map(v => ({ count: v.getAnimations().length, transform: getComputedStyle(v).transform }))');
    assert.equal(during[0].count, 1); assert.equal(during[0].transform, 'matrix(-1, 0, 0, 1, 0, 0)');
    if (scenario === 'secondary') assert.equal(during[1].count, 0);
    await evaluate(`return browser.tabs.sendMessage(window.discoveryTestTab, { protocolVersion: 1, requestId: crypto.randomUUID(), type: 'DISABLE', ...window.discoveryTestTarget }, { frameId: 0 });`);
    await driver.switchTo().window(fixture);
    assert.deepEqual(await driver.executeScript('return window.__antiMirrorFixture.videos.map(v => v.getAnimations().length)'), scenario === 'secondary' ? [0, 0] : [0]);
    console.log(scenario, 'native production discovery/apply/commit/disable PASS');
  }
} finally { await driver.quit(); }
