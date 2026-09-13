import { Builder } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';
import { download } from 'geckodriver';
import path from 'node:path';
import assert from 'node:assert/strict';

const binary = await download('0.36.0', path.resolve('.browser-cache/geckodriver'));
const uuid = 'cae27e88-642f-46f1-8e87-13b627e42b50';
const options = new firefox.Options().setBinary(process.env.FIREFOX_BINARY ?? '/Applications/Firefox.app/Contents/MacOS/firefox')
  .addArguments('-headless', '-no-remote', '--remote-allow-system-access')
  .setPreference('extensions.webextensions.uuids', JSON.stringify({ 'antimirror@star-tech.dev': uuid }));
const driver = await new Builder().forBrowser('firefox').setFirefoxOptions(options)
  .setFirefoxService(new firefox.ServiceBuilder(binary)).build();
try {
  await driver.installAddon(path.resolve('.output/firefox-mv3'), true);
  console.log('Firefox frame coordination', (await driver.getCapabilities()).get('browserVersion'));
  await driver.get(`moz-extension://${uuid}/popup.html`);
  const extension = await driver.getWindowHandle();
  await driver.switchTo().newWindow('tab');
  const fixture = await driver.getWindowHandle();
  const evaluate = async (script, ...args) => {
    await driver.switchTo().window(extension);
    await driver.executeScript(`window.frameTestResult = null; Promise.resolve((async () => {
      await new Promise(resolve => setTimeout(resolve, 200)); ${script}
    })()).then(value => { window.frameTestResult = { value }; }, e => { window.frameTestResult = { value: { error: String(e) } }; });`, ...args);
    await driver.switchTo().window(fixture);
    const wrapped = await driver.wait(async () => {
      await driver.executeAsyncScript('const done = arguments[arguments.length - 1]; setTimeout(done, 300)');
      await driver.switchTo().window(extension);
      const result = await driver.executeScript('return window.frameTestResult');
      await driver.switchTo().window(fixture); return result;
    }, 10000);
    assert.ok(!wrapped.value?.error, JSON.stringify(wrapped.value)); return wrapped.value;
  };
  for (const scenario of ['frame-same', 'frame-cross', 'shadow-frame-closed', 'frame-three', 'frame-srcdoc', 'frame-blank', 'frame-blob', 'frame-data', 'frame-sandbox']) {
    const url = `http://127.0.0.1:${process.env.FIXTURE_PORT ?? 4173}/?case=${scenario}`;
    await driver.get(url);
    await driver.wait(() => driver.executeScript('return !!window.__antiMirrorFixture'), 5000);
    const result = await evaluate(`
      const tab = (await browser.tabs.query({})).find(t => t.url === arguments[0]);
      window.frameTestTab = tab.id;
      window.frameLostReports = [];
      if (!window.frameReportListener) {
        window.frameReportListener = (message, sender) => {
          if (message?.type === 'FRAME_LOST' && sender.id === browser.runtime.id && window.frameLostReports.length < 8)
            window.frameLostReports.push({ ...message, senderFrameId: sender.frameId });
        };
        browser.runtime.onMessage.addListener(window.frameReportListener);
      }
      const operationId = crypto.randomUUID();
      const send = (frameId, message) => browser.tabs.sendMessage(tab.id,
        { protocolVersion: 1, requestId: crypto.randomUUID(), operationId, ...message }, { frameId });
      const frames = await browser.webNavigation.getAllFrames({ tabId: tab.id });
      const docs = [];
      for (const frame of frames) {
        try {
          const probe = await send(frame.frameId, {type:'PROBE'});
          const found = await send(frame.frameId, {type:'DISCOVER', documentNonce:probe.documentNonce, durationMs:300});
          docs.push({ ...frame, nonce:probe.documentNonce, found });
        } catch { /* Native inaccessible frames remain unsupported. */ }
      }
      window.frameTestDocs = docs;
      window.frameTestOperation = operationId;
      const chosen = docs.find(doc => doc.found.complete && doc.found.candidates.length === 1);
      if (!chosen) return { phase:'off', reason:'FRAMES_UNAVAILABLE' };
      const candidate = chosen.found.candidates[0];
      const ancestors = [];
      for (let child = chosen; child.frameId !== 0;) {
        const parent = docs.find(doc => doc.frameId === child.parentFrameId);
        if (!parent) return { phase:'off', reason:'FRAMES_UNAVAILABLE' };
        const token = crypto.randomUUID();
        const common = { token, documentNonce:parent.nonce };
        await send(parent.frameId, {type:'BIND_CHILD', ...common, childFrameId:child.frameId, childNonce:child.nonce});
        await send(child.frameId, {type:'EMIT_BIND', documentNonce:child.nonce, token});
        const bound = await send(parent.frameId, {type:'READ_BIND', ...common});
        if (bound.type !== 'BOUND' || !bound.visible) return { phase:'off', reason:'FRAMES_UNAVAILABLE', bound };
        const watching = await send(parent.frameId, {type:'WATCH_CHILD', ...common});
        if (watching.type !== 'WATCHING') return {phase:'off', reason:'FRAMES_UNAVAILABLE'};
        ancestors.push({parentFrameId:parent.frameId, parentNonce:parent.nonce, token}); child=parent;
      }
      const target = {frameId:chosen.frameId, documentNonce:chosen.nonce, targetId:candidate.targetId, mediaToken:candidate.mediaToken};
      const applied = await send(chosen.frameId, {type:'PREPARE_APPLY', ...target});
      const committed = await send(chosen.frameId, {type:'COMMIT', ...target});
      if (applied.type !== 'APPLIED' || committed.type !== 'COMMITTED') return {phase:'off', reason:'APPLY_FAILED', applied, committed};
      for (const ancestor of ancestors) await send(ancestor.parentFrameId, {type:'COMMIT_WATCH', documentNonce:ancestor.parentNonce, token:ancestor.token});
      for (const doc of docs) await send(doc.frameId, {type:'RELEASE_DISCOVERY', documentNonce:doc.nonce});
      return {phase:'on', target, ancestors};
    `, url);
    const related = ['frame-blob', 'frame-data', 'frame-sandbox'].includes(scenario);
    if (!related) assert.equal(result?.phase, 'on', `${scenario}: ${JSON.stringify(result)}`);
    else assert.ok(result?.phase === 'on' || ['FRAMES_UNAVAILABLE', 'INCOMPLETE_COVERAGE'].includes(result?.reason), JSON.stringify(result));
    if (result.phase === 'on') {
      assert.notEqual(result.target.frameId, 0);
      assert.equal(result.ancestors.length, scenario === 'frame-three' ? 3 : 1);
      const actual = await evaluate(`return (await browser.scripting.executeScript({ target: { tabId: window.frameTestTab, frameIds: [arguments[0]] }, func: () => {
        const roots = [document];
        for (let i = 0; i < roots.length; i++) for (const el of roots[i].querySelectorAll('*')) {
          if (el.tagName === 'VIDEO') return { count: el.getAnimations().length, transform: getComputedStyle(el).transform };
          const root = el.shadowRoot || el.openOrClosedShadowRoot; if (root) roots.push(root);
        }
      } }))[0].result;`, result.target.frameId);
      assert.equal(actual.count, 1); assert.equal(actual.transform, 'matrix(-1, 0, 0, 1, 0, 0)');
      await driver.executeScript('window.__antiMirrorFixture.frames[0].remove()');
      const reports = await evaluate('return window.frameLostReports;');
      assert.ok(reports.some(report => result.ancestors.some(a => a.parentFrameId === report.senderFrameId &&
        a.parentNonce === report.documentNonce && a.token === report.token)), JSON.stringify(reports));
    }
    await evaluate(`return Promise.all(window.frameTestDocs.map(doc => browser.tabs.sendMessage(window.frameTestTab,
      {protocolVersion:1, type:'CANCEL_OPERATION', requestId:crypto.randomUUID(), operationId:window.frameTestOperation},
      {frameId:doc.frameId}).catch(() => undefined)));`);
    console.log(scenario, result.phase === 'on' ? 'native apply + verified parent removal report PASS' : result.reason);
  }
} finally { await driver.quit(); }
