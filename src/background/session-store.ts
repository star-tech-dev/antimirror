import { browser } from 'wxt/browser';
import { isTabState, type TabState } from '../shared/state';

const STORAGE_KEY = 'antimirror.tabs.v1';
const CLEANUP_KEY = 'antimirror.cleanup.v1';

export class SessionStore {
  private states = new Map<number, TabState>();
  private cleanup = new Map<number, TabState>();
  private writeChain = Promise.resolve();
  readonly ready = this.load();

  private async load(): Promise<void> {
    const result = await browser.storage.session.get([STORAGE_KEY, CLEANUP_KEY]);
    const pending = result[CLEANUP_KEY];
    if (pending && typeof pending === 'object') for (const value of Object.values(pending)) {
      if (isTabState(value) && value.phase !== 'off') this.cleanup.set(value.tabId, value);
    }
    const stored = result[STORAGE_KEY];
    if (!stored || typeof stored !== 'object') return;
    for (const value of Object.values(stored as Record<string, unknown>)) {
      if (isTabState(value)) this.states.set(value.tabId, value);
    }
  }

  get(tabId: number): TabState | undefined { return this.states.get(tabId); }
  list(): TabState[] { return [...this.states.values()]; }
  pending(tabId: number): TabState | undefined { return this.cleanup.get(tabId); }
  pendingList(): TabState[] { return [...this.cleanup.values()]; }

  clearPending(tabId: number, operationId: string): Promise<void> {
    const pending = this.cleanup.get(tabId);
    if (pending && pending.phase !== 'off' && pending.operationId === operationId) this.cleanup.delete(tabId);
    return this.write();
  }

  set(state: TabState): Promise<void> {
    const previous = this.states.get(state.tabId);
    if (state.phase === 'off' && previous && previous.phase !== 'off') this.cleanup.set(state.tabId, previous);
    this.states.set(state.tabId, state);
    return this.write();
  }

  delete(tabId: number): Promise<void> {
    this.states.delete(tabId);
    this.cleanup.delete(tabId);
    return this.write();
  }

  private write(): Promise<void> {
    const snapshot = Object.fromEntries(this.states);
    const pending = Object.fromEntries(this.cleanup);
    this.writeChain = this.writeChain.catch(() => undefined).then(() => browser.storage.session.set({ [STORAGE_KEY]: snapshot, [CLEANUP_KEY]: pending }));
    return this.writeChain;
  }
}
