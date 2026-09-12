import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
for (const target of ['chrome', 'firefox']) {
  const base = `.output/${target}-mv3`;
  const m = JSON.parse(await readFile(`${base}/manifest.json`, 'utf8'));
  assert.equal(m.manifest_version, 3);
  assert.equal(m.name, 'AntiMirror');
  assert.deepEqual([...m.permissions].sort(), ['scripting', 'storage', 'webNavigation']);
  assert.deepEqual(m.host_permissions, ['http://*/*', 'https://*/*']);
  assert.ok(m.action.default_popup);
  assert.equal(m.action.default_icon['16'], 'icons/off-16.png');
  assert.equal(m.action.default_title, 'AntiMirror — OFF');
  assert.deepEqual(m.browser_specific_settings.gecko.data_collection_permissions.required, ['none']);
  if (target === 'chrome') assert.ok(m.background.service_worker);
  else { assert.ok(m.background.scripts?.length); assert.equal(m.background.service_worker, undefined); }
  assert.equal(m.content_scripts.length, 1);
  const script = m.content_scripts[0];
  assert.equal(script.all_frames, true);
  assert.equal(script.match_about_blank, true);
  assert.equal(script.match_origin_as_fallback, true);
  assert.equal(script.run_at, 'document_start');
  assert.ok(!script.world || script.world === 'ISOLATED');
  assert.equal(script.css, undefined);
  for (const file of (await readdir(base, { recursive: true })).filter(file => /\.(js|html)$/.test(file))) {
    const code = await readFile(`${base}/${file}`, 'utf8');
    assert.doesNotMatch(code, /SPIKE_|127\.0\.0\.1|__antiMirrorFixture|TEST ONLY/);
  }
  assert.equal(m.externally_connectable, undefined);
  console.log(`${target}: MV3, passive injection flags, background and no spike endpoints PASS`);
}
