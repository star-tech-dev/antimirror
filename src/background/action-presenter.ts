import { browser } from 'wxt/browser';
import type { TabState } from '../shared/state';

const OFF_ICONS = { 16: 'icons/off-16.png', 32: 'icons/off-32.png' };
const ON_ICONS = { 16: 'icons/on-16.png', 32: 'icons/on-32.png' };

export async function presentState(state: TabState): Promise<void> {
  const enabled = state.phase === 'on';
  await browser.action.setIcon({ tabId: state.tabId, path: enabled ? ON_ICONS : OFF_ICONS });
  await browser.action.setTitle({ tabId: state.tabId, title: `AntiMirror — ${enabled ? 'ON' : state.phase.toUpperCase()}` });
}
