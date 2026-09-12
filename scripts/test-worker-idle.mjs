// Raw CDP attaches only to the probe page, never to the extension worker.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const profile = await mkdtemp(path.join(tmpdir(), 'antimirror-idle-'));
const extension = path.resolve('.output-spike/chrome-mv3');
const child = spawn(chromium.executablePath(), ['--headless=new', '--no-first-run',
  `--user-data-dir=${profile}`, '--remote-debugging-port=0',
  `--disable-extensions-except=${extension}`, `--load-extension=${extension}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
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
  const { targetId } = await send('Target.createTarget', { url: `chrome-extension://${id}/probe.html` });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await send('Target.createTarget', { url: `http://127.0.0.1:${process.env.FIXTURE_PORT ?? 4173}/?case=basic` });
  let target;
  for (let attempt = 0; attempt < 100 && !target; attempt++) {
    const frames = await evaluate('globalThis.probe?.frames()');
    if (attempt === 99) console.log('Probe frames:', frames, await evaluate('location.href'));
    target = frames?.find(f => f.frameId === 0 && f.reply);
    if (!target) await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(target);
  const message = name => evaluate(`globalThis.probe.send(${target.tabId}, ${target.frameId}, ${JSON.stringify(name)})`);
  const active = await message('SPIKE_APPLY');
  assert.ok(active.during);
  await evaluate('globalThis.probe.writeSession()');
  const boot = await evaluate('globalThis.probe.boot()');
  console.log('Waiting 40 seconds without attaching a debugger to the worker');
  await new Promise(resolve => setTimeout(resolve, 40000));
  const targets = (await send('Target.getTargets')).targetInfos;
  assert.ok(!targets.some(t => t.targetId === worker.targetId), 'Original worker naturally stopped');
  assert.notEqual(await evaluate('globalThis.probe.boot()'), boot);
  assert.deepEqual(await evaluate('globalThis.probe.readSession()'), { spike: 'survives-worker-stop' });
  assert.deepEqual(await message('SPIKE_SNAPSHOT'), active.during);
  await message('SPIKE_CANCEL');
  console.log('PASS: natural idle worker stop, new boot, native session and active mirror preserved');
} finally {
  socket?.close();
  const exited = new Promise(resolve => child.once('exit', resolve));
  child.kill('SIGTERM');
  await exited;
  await rm(profile, { recursive: true, force: true });
}
