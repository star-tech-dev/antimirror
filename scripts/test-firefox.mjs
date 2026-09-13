import { Builder } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';
import { download } from 'geckodriver';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const binary = await download('0.36.0', path.resolve('.browser-cache/geckodriver'));
const uuid = 'cae27e88-642f-46f1-8e87-13b627e42b50';
// Firefox 155 requires system access for WebDriver navigation to our extension page.
// This is scoped to the temporary automation profile, never the user's running browser.
const options = new firefox.Options().setBinary(process.env.FIREFOX_BINARY ?? '/Applications/Firefox.app/Contents/MacOS/firefox')
  .addArguments('-headless', '-no-remote', '--remote-allow-system-access')
  .setPreference('extensions.webextensions.uuids', JSON.stringify({ 'antimirror@star-tech.dev': uuid }));
const driver = await new Builder().forBrowser('firefox').setFirefoxOptions(options)
  .setFirefoxService(new firefox.ServiceBuilder(binary)).build();
const artifacts = 'test-results/firefox';
await mkdir(artifacts, { recursive: true });
try {
  await driver.installAddon(path.resolve('.output-spike/firefox-mv3'), true);
  console.log('Firefox', (await driver.getCapabilities()).get('browserVersion'));
  await driver.get(`moz-extension://${uuid}/probe.html`);
  const probe = await driver.getWindowHandle();
  await driver.switchTo().newWindow('tab');
  const fixture = await driver.getWindowHandle();
  const evaluate = async (script, ...args) => {
    await driver.switchTo().window(probe);
    return driver.executeAsyncScript(`const done = arguments[arguments.length - 1]; Promise.resolve((async () => { ${script} })()).then(done, e => done({ error: String(e) }));`, ...args);
  };
  for (const scenario of ['closed', 'transforms', 'frame-srcdoc', 'frame-blank']) {
    await driver.switchTo().window(fixture);
    await driver.get(`http://127.0.0.1:${process.env.FIXTURE_PORT ?? 4173}/?case=${scenario}`);
    const embedded = scenario.startsWith('frame-');
    const target = await driver.wait(async () => {
      const frames = await evaluate('return globalThis.probe.frames();');
      return Array.isArray(frames) && frames.find(f => (embedded ? f.frameId !== 0 : f.frameId === 0) && f.reply);
    }, 10000);
    const send = message => evaluate('return globalThis.probe.send(arguments[0], arguments[1], arguments[2]);', target.tabId, target.frameId, message);
    const result = await driver.wait(async () => { const r = await send('SPIKE_APPLY'); return r.before ? r : false; }, 10000);
    if (scenario === 'closed') assert.equal(result.closed, true);
    assert.equal(result.during.style, result.before.style);
    assert.equal(result.during.origin, result.before.origin);
    assert.equal(result.during.animations, result.before.animations + 1);
    const matrices = await driver.executeScript(`const r = arguments[0]; return {
      expected: Array.from(new DOMMatrix(r.before.transform === 'none' ? undefined : r.before.transform).scale(-1, 1).toFloat64Array()),
      actual: Array.from(new DOMMatrix(r.during.transform).toFloat64Array()) };`, result);
    matrices.actual.forEach((n, i) => assert.ok(Math.abs(n - matrices.expected[i]) < 0.00001));
    await driver.switchTo().window(fixture);
    await writeFile(`${artifacts}/${scenario}-on.png`, await driver.takeScreenshot(), 'base64');
    const cancel = await send('SPIKE_CANCEL');
    assert.deepEqual(cancel.after, cancel.before);
    await driver.switchTo().window(fixture);
    await writeFile(`${artifacts}/${scenario}-off.png`, await driver.takeScreenshot(), 'base64');
    console.log(scenario, JSON.stringify(result));
  }
  await evaluate('return globalThis.probe.writeSession();');
  assert.deepEqual(await evaluate('return globalThis.probe.readSession();'), { spike: 'survives-worker-stop' });
  console.log('Firefox native session roundtrip PASS; event-page idle recovery NOT_RUN');
} finally { await driver.quit(); }
