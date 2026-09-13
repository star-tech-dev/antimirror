import { defineConfig } from 'wxt';
const spike = process.env.ANTIMIRROR_SPIKE === '1';
export default defineConfig({
  outDir: spike ? '.output-spike' : '.output',
  entrypointsDir: spike ? 'testing/extension/entrypoints' : 'entrypoints',
  manifest: {
    name: spike ? 'AntiMirror Feasibility (TEST ONLY)' : '__MSG_extensionName__',
    default_locale: 'en',
    action: { default_icon: { 16: 'icons/off-16.png', 32: 'icons/off-32.png' }, default_title: spike ? 'AntiMirror — OFF' : 'AntiMirror' },
    description: spike ? 'Test-only AntiMirror capability probe.' : '__MSG_extensionDescription__',
    commands: spike ? undefined : {
      'toggle-mirror': {
        suggested_key: { default: 'Alt+Shift+M', mac: 'MacCtrl+Shift+M' },
        description: '__MSG_commandDescription__',
      },
    },
    permissions: ['storage', 'webNavigation', 'scripting'],
    host_permissions: ['http://*/*', 'https://*/*'],
    browser_specific_settings: { gecko: { id: 'antimirror@local.invalid', strict_min_version: '140.0', data_collection_permissions: { required: ['none'] } } },
  },
});
