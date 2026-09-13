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
  console.log('Firefox production UX', (await driver.getCapabilities()).get('browserVersion'));
  await driver.get(`moz-extension://${uuid}/popup.html`);
  await driver.wait(() => driver.executeScript('return document.querySelector("#status")?.textContent.length > 0'), 5000);
  const popup = await driver.executeScript(`return {
    lang: document.documentElement.lang,
    title: document.querySelector('h1').textContent,
    status: document.querySelector('#status').textContent,
    button: document.querySelector('#toggle').textContent,
    buttons: document.querySelectorAll('button').length,
    live: document.querySelector('#status').getAttribute('aria-live'),
    describedBy: document.querySelector('#toggle').getAttribute('aria-describedby'),
    shortcut: document.querySelector('#shortcut').textContent
  }`);
  assert.deepEqual(popup, { lang: 'en', title: 'AntiMirror', status: 'Could not read the current status',
    button: 'Please wait…', buttons: 1, live: 'polite', describedBy: 'shortcut',
    shortcut: popup.shortcut });
  assert.match(popup.shortcut, /^Shortcut: .+/);
  const commands = await driver.executeAsyncScript(`const done=arguments[arguments.length-1];
    browser.commands.getAll().then(done, error => done({error:String(error)}));`);
  const command = commands.find(item => item.name === 'toggle-mirror');
  assert.ok(command?.shortcut, JSON.stringify(commands));
  const extension = await driver.getWindowHandle();
  await driver.switchTo().newWindow('tab');
  const fixture = await driver.getWindowHandle();
  const evaluate = async (script, ...args) => {
    await driver.switchTo().window(extension);
    await driver.executeScript(`window.uxResult=null; Promise.resolve((async()=>{${script}})()).then(value=>window.uxResult={value},error=>window.uxResult={value:{error:String(error)}});`, ...args);
    await driver.switchTo().window(fixture);
    const wrapped = await driver.wait(async () => {
      await driver.executeAsyncScript('const done=arguments[arguments.length-1];setTimeout(done,100)');
      await driver.switchTo().window(extension);
      const result = await driver.executeScript('return window.uxResult');
      await driver.switchTo().window(fixture);
      return result;
    }, 7000);
    assert.ok(!wrapped.value?.error, JSON.stringify(wrapped.value)); return wrapped.value;
  };
  for (const scenario of ['transforms', 'important', 'origin-corner', 'site-animation']) {
    await driver.switchTo().window(fixture);
    const url = `http://127.0.0.1:${process.env.FIXTURE_PORT ?? 4173}/?case=${scenario}`;
    await driver.get(url);
    await driver.wait(() => driver.executeScript('return !!window.__antiMirrorFixture?.first()'), 5000);
    const before = await driver.executeScript(`const v=window.__antiMirrorFixture.first();return {
      style:v.getAttribute('style'),transform:getComputedStyle(v).transform,origin:getComputedStyle(v).transformOrigin,
      backface:getComputedStyle(v).backfaceVisibility,animations:v.getAnimations().length}`);
    const result = await evaluate(`
      const tab=(await browser.tabs.query({})).find(tab=>tab.url===arguments[0]);
      const send=message=>browser.tabs.sendMessage(tab.id,{protocolVersion:1,requestId:crypto.randomUUID(),...message},{frameId:0});
      const probe=await send({type:'PROBE'}),operationId=crypto.randomUUID();
      const found=await send({type:'DISCOVER',documentNonce:probe.documentNonce,operationId});
      const selected=found.candidates[0];
      const target={operationId,frameId:0,documentNonce:probe.documentNonce,targetId:selected.targetId,mediaToken:selected.mediaToken};
      const applied=await send({type:'PREPARE_APPLY',...target});
      if(applied.type==='APPLIED') await send({type:'COMMIT',...target});
      window.uxTarget=target;window.uxTab=tab.id;return {applied};`, url);
    await driver.switchTo().window(fixture);
    const during = await driver.executeScript(`const v=window.__antiMirrorFixture.first();return {
      style:v.getAttribute('style'),transform:getComputedStyle(v).transform,origin:getComputedStyle(v).transformOrigin,
      backface:getComputedStyle(v).backfaceVisibility,animations:v.getAnimations().length}`);
    assert.equal(during.style, before.style); assert.equal(during.origin, before.origin); assert.equal(during.backface, before.backface);
    if (result.applied.type === 'APPLIED') {
      if (scenario !== 'site-animation') {
        const matrices = await driver.executeScript(`const a=arguments[0],b=arguments[1];return {
          expected:Array.from(new DOMMatrix(a==='none'?undefined:a).scale(-1,1).toFloat64Array()),
          actual:Array.from(new DOMMatrix(b).toFloat64Array())}`, before.transform, during.transform);
        matrices.actual.forEach((value, index) => assert.ok(Math.abs(value - matrices.expected[index]) < 0.00001));
      }
      assert.equal(during.animations, before.animations + 1);
      await evaluate(`return browser.tabs.sendMessage(window.uxTab,{protocolVersion:1,requestId:crypto.randomUUID(),type:'DISABLE',...window.uxTarget},{frameId:0});`);
    } else {
      assert.equal(result.applied.code, 'TRANSFORM_CONFLICT'); assert.equal(during.animations, before.animations);
    }
    await driver.switchTo().window(fixture);
    assert.equal(await driver.executeScript('return window.__antiMirrorFixture.first().getAnimations().length'), before.animations);
    console.log(scenario, result.applied.type, 'preserve/cleanup PASS');
  }
  console.log('Firefox EN native i18n, shortcut declaration and production transform matrix PASS');
} finally { await driver.quit(); }
