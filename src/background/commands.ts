import { browser } from 'wxt/browser';
import type { TabController } from './tab-controller';

/** Called only from the browser-owned commands event, never from runtime/page messages. */
export async function handleBrowserCommand(controller: TabController, command: string): Promise<void> {
  if (command !== 'toggle-mirror') return;
  await controller.ready;
  const [active] = await browser.tabs.query({ active: true, currentWindow: true });
  if (active?.id === undefined) return;
  const state = await controller.readState(active.id);
  await controller.setEnabled(active.id, state.phase === 'off', crypto.randomUUID());
}
