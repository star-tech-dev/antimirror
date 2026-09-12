import { browser } from 'wxt/browser';
import { isTabState, type TabState } from '../shared/state';

const STORAGE_KEY = 'antimirror.tabs.v1';

export class SessionStore {
  private states = new Map<number, TabState>();
  private writeChain = Promise.resolve();
  readonly ready = this.load().catch(() => undefined);

  private async load(): Promise<void> {
    const result = await browser.storage.session.get(STORAGE_KEY);
    const stored = result[STORAGE_KEY];
    if (!stored || typeof stored !== 'object') return;
    for (const value of Object.values(stored as Record<string, unknown>)) {
      if (isTabState(value)) this.states.set(value.tabId, value);
    }
  }

  get(tabId: number): TabState | undefined { return this.states.get(tabId); }

  set(state: TabState): Promise<void> {
    this.states.set(state.tabId, state);
    const snapshot = Object.fromEntries(this.states);
    this.writeChain = this.writeChain.catch(() => undefined).then(() => browser.storage.session.set({ [STORAGE_KEY]: snapshot }));
    return this.writeChain;
  }

  delete(tabId: number): Promise<void> {
    this.states.delete(tabId);
    const snapshot = Object.fromEntries(this.states);
    this.writeChain = this.writeChain.catch(() => undefined).then(() => browser.storage.session.set({ [STORAGE_KEY]: snapshot }));
    return this.writeChain;
  }
}
