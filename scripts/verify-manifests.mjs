import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
for (const target of ['chrome', 'firefox']) {
  const base = `.output/${target}-mv3`;
  const m = JSON.parse(await readFile(`${base}/manifest.json`, 'utf8'));
  assert.equal(m.manifest_version, 3);
  assert.equal(m.name, '__MSG_extensionName__');
  assert.equal(m.default_locale, 'en');
  assert.deepEqual([...m.permissions].sort(), ['scripting', 'storage', 'webNavigation']);
  assert.deepEqual(m.host_permissions, ['http://*/*', 'https://*/*']);
  assert.ok(m.action.default_popup);
  assert.equal(m.action.default_icon['16'], 'icons/off-16.png');
  assert.deepEqual(m.icons, {
    16: 'icons/brand-16.png', 32: 'icons/brand-32.png', 48: 'icons/brand-48.png', 128: 'icons/brand-128.png',
  });
  assert.equal(m.version, '1.0.0');
  assert.equal(m.homepage_url, 'https://star-tech.dev/');
  assert.equal(m.action.default_title, 'AntiMirror');
  assert.deepEqual(m.commands['toggle-mirror'].suggested_key, { default: 'Alt+Shift+M', mac: 'MacCtrl+Shift+M' });
  assert.equal(m.commands['toggle-mirror'].description, '__MSG_commandDescription__');
  assert.deepEqual(m.browser_specific_settings.gecko.data_collection_permissions.required, ['none']);
  assert.equal(m.browser_specific_settings.gecko.id, 'antimirror@star-tech.dev');
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
  const en = JSON.parse(await readFile(`${base}/_locales/en/messages.json`, 'utf8'));
  const ru = JSON.parse(await readFile(`${base}/_locales/ru/messages.json`, 'utf8'));
  for (const key of ['extensionName', 'extensionNameShort', 'extensionDescription', 'commandDescription', 'off', 'on',
    'reasonPermission', 'reasonPip', 'shortcutAssigned', 'shortcutUnassigned', 'languageLabel']) {
    assert.ok(en[key]?.message); assert.ok(ru[key]?.message);
  }
  assert.notEqual(en.off.message, ru.off.message);
  console.log(`${target}: MV3, passive injection flags, background and no spike endpoints PASS`);
}
