import { defineConfig } from 'wxt';
const spike = process.env.ANTIMIRROR_SPIKE === '1';
export default defineConfig({
  outDir: spike ? '.output-spike' : '.output',
  entrypointsDir: spike ? 'testing/extension/entrypoints' : 'entrypoints',
  manifest: {
    name: spike ? 'AntiMirror Feasibility (TEST ONLY)' : 'AntiMirror',
    action: { default_icon: { 16: 'icons/off-16.png', 32: 'icons/off-32.png' }, default_title: 'AntiMirror — OFF' },
    description: 'Manual, per-tab video mirroring. Foundation build; activation not yet available.',
    permissions: ['storage', 'webNavigation', 'scripting'],
    host_permissions: ['http://*/*', 'https://*/*'],
    browser_specific_settings: { gecko: { id: 'antimirror@local.invalid', strict_min_version: '140.0', data_collection_permissions: { required: ['none'] } } },
  },
});
