import { browser } from 'wxt/browser';
// Deliberately packaged only in .output-spike; no website bridge or production endpoint.
Object.assign(globalThis, { probe: {
  frames: async () => {
    const tabs = await browser.tabs.query({});
    const tab = tabs.find(tab => tab.url?.startsWith('http://127.0.0.1:'));
    if (tab?.id === undefined) throw new Error('Fixture tab missing');
    const frames = await browser.webNavigation.getAllFrames({ tabId: tab.id });
    return Promise.all((frames ?? []).map(async frame => ({ ...frame, tabId: tab.id,
      reply: await browser.tabs.sendMessage(tab.id!, 'SPIKE_PING', { frameId: frame.frameId }).catch(() => null),
    })));
  },
  send: (tabId: number, frameId: number, message: string) => browser.tabs.sendMessage(tabId, message, { frameId }),
  boot: () => browser.runtime.sendMessage('SPIKE_BOOT'),
  writeSession: () => browser.storage.session.set({ spike: 'survives-worker-stop' }),
  readSession: () => browser.runtime.sendMessage('SPIKE_SESSION'),
} });
