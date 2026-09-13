import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const version = JSON.parse(await readFile('package.json', 'utf8')).version;
const artifacts = {
  chrome: `.output/antimirror-${version}-chrome.zip`,
  firefox: `.output/antimirror-${version}-firefox.zip`,
  sources: `.output/antimirror-${version}-sources.zip`,
};
const runUnzip = (args) => {
  const result = spawnSync('unzip', args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr || `unzip ${args.join(' ')} failed`);
  return result.stdout;
};
const entries = file => runUnzip(['-Z1', file]).trim().split('\n').filter(Boolean);
const forbidden = /(^|\/)(?:\.git|\.output(?:-spike)?|node_modules|test-results|playwright-report|testing|tests)(?:\/|$)|\.(?:map|pem|key)$/;
const expectedRuntime = [
  '_locales/en/messages.json', '_locales/ru/messages.json', 'assets/', 'background.js',
  'chunks/', 'content-scripts/content.js', 'icons/', 'manifest.json', 'popup.html',
];

for (const target of ['chrome', 'firefox']) {
  const file = artifacts[target];
  const files = entries(file);
  assert.ok(files.includes('manifest.json'), `${target}: manifest.json must be at ZIP root`);
  assert.ok(files.every(name => expectedRuntime.some(prefix => name === prefix || name.startsWith(prefix))),
    `${target}: unexpected runtime entry`);
  assert.ok(files.every(name => !forbidden.test(name)), `${target}: forbidden file in runtime ZIP`);
  const manifest = JSON.parse(runUnzip(['-p', file, 'manifest.json']));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, version);
  assert.deepEqual(Object.keys(manifest.icons).sort(), ['128', '16', '32', '48']);
  assert.equal(target === 'chrome', typeof manifest.background.service_worker === 'string');
  for (const name of files.filter(name => /\.(?:css|html|js|json)$/.test(name))) {
    const content = runUnzip(['-p', file, name]);
    assert.doesNotMatch(content, /\/Users\/|127\.0\.0\.1|localhost|__antiMirrorFixture|SPIKE_|TEST ONLY/,
      `${target}: development marker in ${name}`);
  }
}

const sourceFiles = entries(artifacts.sources);
for (const required of ['.node-version', 'README.md', 'package.json', 'pnpm-lock.yaml', 'wxt.config.ts',
  'entrypoints/background.ts', 'entrypoints/content/index.ts', 'src/shared/protocol.ts',
  'scripts/verify-manifests.mjs']) {
  assert.ok(sourceFiles.includes(required), `sources: missing ${required}`);
}
assert.ok(sourceFiles.every(name => !forbidden.test(name)), 'sources: forbidden file present');
assert.ok(sourceFiles.every(name => !['PACK_MANIFEST.json', 'AGENTS.md', 'START_CODEX.md'].includes(name)),
  'sources: non-build coordination file present');

for (const [name, file] of Object.entries(artifacts)) {
  const content = await readFile(file);
  console.log(`${name} ${content.length} ${createHash('sha256').update(content).digest('hex')} ${file}`);
}
console.log('release packages: root manifests, allowlists and source archive PASS');
