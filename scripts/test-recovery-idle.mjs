// Production build; raw CDP attaches only to pages, never to the extension worker.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const profile = await mkdtemp(path.join(tmpdir(), 'antimirror-idle-'));
const discardMode = process.env.ANTIMIRROR_LIFECYCLE === 'discard';
const restartMode = process.env.ANTIMIRROR_LIFECYCLE === 'restart';
const extension = path.resolve('.output/chrome-mv3');
const launch = (extra = []) => spawn(chromium.executablePath(), ['--headless=new', '--no-first-run',
  '--window-size=1280,900', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
  `--user-data-dir=${profile}`, '--remote-debugging-port=0',
  `--disable-extensions-except=${extension}`, `--load-extension=${extension}`, ...extra, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
let child = launch();
let socket;
try {
  const endpoint = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('CDP startup timed out')), 15000);
    child.once('error', reject);
    child.stderr.on('data', data => {
      output += data.toString();
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
  });
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let sequence = 0;
  const pending = new Map();
  socket.onmessage = event => {
    const data = JSON.parse(event.data);
    const request = pending.get(data.id);
    if (request) { pending.delete(data.id); clearTimeout(request.timer); if (data.error) request.reject(data.error); else request.resolve(data.result); }
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 15000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
  const extensionId = createHash('sha256').update(extension).digest('hex').slice(0, 32).replace(/[0-9a-f]/g, char => String.fromCharCode(97 + parseInt(char, 16)));
  let worker;
  for (let attempt = 0; attempt < 30 && !worker; attempt++) {
    worker = (await send('Target.getTargets')).targetInfos.find(t => t.type === 'service_worker' && t.url === `chrome-extension://${extensionId}/background.js`);
    if (!worker) await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(worker, 'Extension worker loaded: ' + JSON.stringify((await send('Target.getTargets')).targetInfos));
  const id = new URL(worker.url).host;
  const { targetId } = await send('Target.createTarget', { url: `chrome-extension://${id}/popup.html` });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const evaluateIn = async (expression, session = sessionId) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, session);
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const waitFor = async (fn, label) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const result = await fn(); if (result) return result;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Timed out: ' + label);
  };
  const fixture = await send('Target.createTarget', { url: `http://127.0.0.1:${process.env.FIXTURE_PORT ?? 4173}/?case=frame-cross` });
  const fixtureSession = discardMode ? undefined : (await send('Target.attachToTarget', { targetId: fixture.targetId, flatten: true })).sessionId;
  const tabId = await waitFor(() => evaluateIn('(async()=> (await chrome.tabs.query({active:true,currentWindow:true}))[0]?.id)()'), 'fixture tab');
  const openPopup = async () => {
    await send('Target.activateTarget', { targetId: fixture.targetId });
    await evaluateIn('chrome.action.openPopup()');
    const popup = await waitFor(async () => (await send('Target.getTargets')).targetInfos.find(t =>
      t.url === `chrome-extension://${id}/popup.html` && t.targetId !== targetId), 'action popup');
    const session = (await send('Target.attachToTarget', { targetId: popup.targetId, flatten: true })).sessionId;
    await waitFor(() => evaluateIn('document.querySelector("#toggle")?.disabled === false', session), 'popup ready');
    return { evaluate: expression => evaluateIn(expression, session),
      close: () => send('Target.closeTarget', { targetId: popup.targetId }) };
  };
  const state = () => evaluateIn(`chrome.storage.session.get('antimirror.tabs.v1').then(r=>r['antimirror.tabs.v1']?.[${tabId}])`);
  const snapshot = () => evaluateIn(`chrome.scripting.executeScript({target:{tabId:${tabId},allFrames:true},world:'MAIN',func:()=>window.__antiMirrorFixture?.videos.map(v=>({animations:v.getAnimations().length,transform:getComputedStyle(v).transform}))}).then(r=>r.flatMap(x=>x.result??[]))`);
  await waitFor(async () => (await snapshot()).length >= 1, 'fixture media');
  let popup = await openPopup();
  await popup.evaluate('document.querySelector("#toggle").click()');
  await waitFor(async () => (await popup.evaluate('document.querySelector("#status").textContent')) === 'Видео отражено', 'ON')
    .catch(async error => { console.log('Failed ON:', await popup.evaluate('document.body.textContent'), await state(), await snapshot()); throw error; });
  const before = await state();
  assert.equal(before.phase, 'on');
  assert.ok(before.ancestors.length > 0, 'Ancestor watchers included');
  const original = await snapshot();
  assert.equal(original.filter(v => v.animations === 1).length, 1);
  await popup.close();
  if (restartMode) {
    const receive = socket.onmessage;
    const stopped = new Promise(resolve => child.once('exit', resolve));
    socket.close(); child.kill('SIGTERM'); await stopped;
    child = launch(['--restore-last-session']);
    const restartedEndpoint = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('Restart CDP startup timed out')), 15000);
      child.once('error', reject);
      child.stderr.on('data', data => {
        output += data.toString();
        const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
    });
    socket = new WebSocket(restartedEndpoint);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    socket.onmessage = receive;
    const probe = await send('Target.createTarget', { url: `chrome-extension://${id}/popup.html` });
    const restartedSession = (await send('Target.attachToTarget', { targetId: probe.targetId, flatten: true })).sessionId;
    await waitFor(() => evaluateIn('!!globalThis.chrome?.storage?.session', restartedSession), 'restarted extension');
    const stored = await evaluateIn("chrome.storage.session.get(['antimirror.tabs.v1','antimirror.cleanup.v1'])", restartedSession);
    assert.deepEqual(stored, {}, 'Native session is empty after a full process restart using the same profile');
    const restored = await waitFor(() => evaluateIn(`chrome.tabs.query({}).then(tabs=>tabs.find(t=>t.url===${JSON.stringify(`http://127.0.0.1:${process.env.FIXTURE_PORT ?? 4173}/?case=frame-cross`)}))`, restartedSession), 'restored fixture tab');
    await evaluateIn(`chrome.tabs.update(${restored.id},{active:true})`, restartedSession);
    const animations = await waitFor(() => evaluateIn(`chrome.scripting.executeScript({target:{tabId:${restored.id},allFrames:true},world:'MAIN',func:()=>window.__antiMirrorFixture?.videos.map(v=>v.getAnimations().length)}).then(r=>{const values=r.flatMap(x=>x.result??[]);return values.length?values:null})`, restartedSession), 'restored videos');
    assert.ok(animations.every(count => count === 0));
    assert.equal(await evaluateIn(`chrome.action.getTitle({tabId:${restored.id}})`, restartedSession), 'AntiMirror — OFF');
    console.log('PASS: full browser-process restart, same profile, restored tab, empty native session and OFF effects/icon');
  } else if (discardMode) {
    const other = await send('Target.createTarget', { url: 'about:blank' });
    await send('Target.activateTarget', { targetId: other.targetId });
    await evaluateIn(`chrome.tabs.discard(${tabId})`);
    await waitFor(async () => (await state())?.phase === 'off', 'discard OFF');
    await waitFor(async () => await evaluateIn(`chrome.action.getTitle({tabId:${tabId}})`) === 'AntiMirror — OFF', 'discard OFF icon');
    await evaluateIn(`chrome.tabs.update(${tabId},{active:true})`);
    await waitFor(async () => (await snapshot()).length > 0, 'restored document');
    assert.ok((await snapshot()).every(video => video.animations === 0));
    popup = await openPopup();
    assert.equal(await popup.evaluate('document.querySelector("#toggle").getAttribute("aria-pressed")'), 'false');
    await popup.close();
    console.log('PASS: real discard/restore without page debugger, OFF state/icon and zero effects');
  } else {
  // Probe tab and fixture debugger sessions do not attach to or ping the worker.
  console.log('Waiting 40 seconds for natural production-worker idle; no worker debugger/ports/pings');
  await new Promise(resolve => setTimeout(resolve, 40000));
  assert.ok(!(await send('Target.getTargets')).targetInfos.some(t => t.targetId === worker.targetId), 'Original worker naturally stopped');
  assert.deepEqual(await snapshot(), original);
  popup = await openPopup(); // GET_STATE wakes the production worker and reconciles.
  assert.equal(await popup.evaluate('document.querySelector("#status").textContent'), 'Видео отражено');
  const after = await state();
  assert.equal(after.phase, 'on');
  assert.equal(after.operationId, before.operationId);
  assert.deepEqual(after.target, before.target);
  assert.deepEqual(await snapshot(), original);
  assert.equal(await evaluateIn(`chrome.action.getTitle({tabId:${tabId}})`), 'AntiMirror — ON');
  await popup.close();
  // After restart, local parent loss still addresses the persisted ancestor binding.
  await evaluateIn('document.querySelector("iframe").remove()', fixtureSession);
  await waitFor(async () => (await state())?.phase === 'off', 'parent loss after recovery');
  await waitFor(async () => await evaluateIn(`chrome.action.getTitle({tabId:${tabId}})`) === 'AntiMirror — OFF', 'OFF icon');
  console.log('PASS: production natural idle, exact target/ancestor recovery, icon and subsequent parent-loss cleanup');
  }

} finally {
  socket?.close();
  if (child.exitCode === null && child.signalCode === null) {
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill('SIGTERM');
    await exited;
  }
  await rm(profile, { recursive: true, force: true });
}
