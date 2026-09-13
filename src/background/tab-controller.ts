import { browser } from 'wxt/browser';
import { FrameCoordinator } from './frame-coordinator';
import { presentState } from './action-presenter';
import { SessionStore } from './session-store';
import { fingerprint } from './navigation';
import { PROTOCOL_VERSION, isContentResponse, type ContentRequest, type ContentResponse, type OffReason, type TargetRef } from '../shared/protocol';
import { confirmOn, initialState, isCurrentOperation, startApply, startEnable, turnOff, type TabState } from '../shared/state';

const RESPONSE_TIMEOUT_MS = 4_000;
const requestId = () => crypto.randomUUID();

export class TabController {
  private readonly store = new SessionStore();
  private readonly requests = new Map<string, Promise<TabState>>();
  private readonly actionChains = new Map<number, Promise<void>>();
  private readonly pendingOperations = new Map<number, string>();
  private readonly coordinators = new Map<number, FrameCoordinator>();
  private readonly navigationChecks = new Map<number, Promise<void>>();
  private readonly intentions = new Map<number, object>();
  readonly ready = this.store.ready.then(() => this.recover());

  constructor() {
    // Keep initialization failure observable to handlers without an unhandled rejection at boot.
    void this.ready.catch(() => undefined);
  }

  async readState(tabId: number): Promise<TabState> {
    await this.retryCleanup(tabId);
    if (this.getState(tabId).phase === 'on') await this.recover(tabId);
    return this.getState(tabId);
  }

  private async recover(tabId?: number): Promise<void> {
    if (tabId === undefined) await Promise.all(this.store.pendingList().map(state => this.retryCleanup(state.tabId)));
    await Promise.all(this.store.list().filter(state => tabId === undefined || state.tabId === tabId).map(async saved => {
      if (saved.phase === 'off') return;
      try {
        const tab = await browser.tabs.get(saved.tabId).catch(() => undefined);
        if (!tab) { await this.remove(saved.tabId); return; }
        await this.navigationSettled(saved.tabId);
        if (this.getState(saved.tabId) !== saved) return;
        if (tab.discarded || (saved.urlFingerprint && await fingerprint(tab.url ?? '') !== saved.urlFingerprint)) {
          await this.disable(saved.tabId, 'NAVIGATION'); return;
        }
        if (saved.phase !== 'on' && saved.phase !== 'applying') {
          await this.disable(saved.tabId, 'APPLY_FAILED'); return;
        }
        const response = await this.send(saved.tabId, { protocolVersion: 1, type: 'GET_TARGET_STATE',
          requestId: requestId(), operationId: saved.operationId, ...saved.target });
        const watchers = await Promise.all((saved.ancestors ?? []).map(async ancestor => {
          const reply = await this.send(saved.tabId, { protocolVersion: 1, type: 'GET_WATCH_STATE',
            requestId: requestId(), operationId: saved.operationId, documentNonce: ancestor.parentNonce,
            token: ancestor.token }, ancestor.parentFrameId);
          return reply?.type === 'WATCH_COMMITTED' && reply.operationId === saved.operationId &&
            reply.documentNonce === ancestor.parentNonce && reply.token === ancestor.token;
        }));
        const top = await this.send(saved.tabId, { protocolVersion: 1, type: 'PROBE', requestId: requestId() });
        await this.navigationSettled(saved.tabId);
        if (this.getState(saved.tabId) !== saved) return;
        if (top?.type === 'PROBED' && top.documentNonce === saved.topDocumentNonce &&
            this.matches(response, 'COMMITTED', saved.operationId, saved.target) && watchers.every(Boolean)) {
          await this.commitState({ ...saved, phase: 'on', revision: saved.revision + 1 });
        } else await this.disable(saved.tabId, 'AGENT_UNAVAILABLE');
      } catch {
        if (this.getState(saved.tabId) === saved) await this.disable(saved.tabId, 'AGENT_UNAVAILABLE').catch(() => undefined);
      }
    }));
  }

  historyChanged(tabId: number, url: string): Promise<void> {
    const previous = this.navigationChecks.get(tabId);
    const operation = this.pendingOperations.get(tabId);
    const intention = this.intentions.get(tabId);
    const task = (async () => {
      await this.store.ready;
      await previous;
      const hash = await fingerprint(url);
      if (this.intentions.get(tabId) !== intention) return;
      const state = this.getState(tabId);
      if (state.phase !== 'off' && state.urlFingerprint !== hash) await this.resetForNavigation(tabId);
      else if (state.phase === 'off' && operation && this.pendingOperations.get(tabId) === operation) {
        this.pendingOperations.delete(tabId);
      }
    })();
    this.navigationChecks.set(tabId, task);
    void task.finally(() => { if (this.navigationChecks.get(tabId) === task) this.navigationChecks.delete(tabId); }).catch(() => undefined);
    return task;
  }

  getState(tabId: number): TabState { return this.store.get(tabId) ?? initialState(tabId); }

  private async navigationSettled(tabId: number): Promise<void> {
    for (;;) {
      const check = this.navigationChecks.get(tabId);
      if (!check) return;
      await check;
      if (this.navigationChecks.get(tabId) === check) return;
    }
  }

  async permissionsRevoked(): Promise<void> {
    this.pendingOperations.clear();
    for (const coordinator of this.coordinators.values()) coordinator.abort.abort();
    await Promise.all(this.store.list().filter(state => state.phase !== 'off').map(state => this.disable(state.tabId, 'PERMISSION_DENIED')));
  }

  setEnabled(tabId: number, desired: boolean, id: string): Promise<TabState> {
    const key = `${tabId}:${id}`;
    const existing = this.requests.get(key);
    if (existing) return existing;
    const intention = {};
    this.intentions.set(tabId, intention);
    const task = (desired ? this.enable(tabId, intention) : this.disable(tabId, 'USER'))
      .catch(() => this.intentions.get(tabId) === intention ? this.emergencyOff(tabId) : this.getState(tabId));
    this.requests.set(key, task);
    if (this.requests.size > 64) this.requests.delete(this.requests.keys().next().value!);
    return task;
  }

  async resetForNavigation(tabId: number, frameId = 0): Promise<void> {
    const before = this.getState(tabId);
    if (frameId === 0 || (before.phase === 'searching' && this.coordinators.get(tabId)?.knows(frameId)) ||
        (before.phase !== 'off' && (('target' in before && before.target?.frameId === frameId) ||
          before.ancestors?.some(ancestor => ancestor.parentFrameId === frameId || ancestor.childFrameId === frameId)))) {
      this.pendingOperations.delete(tabId); this.coordinators.get(tabId)?.abort.abort();
    }
    await this.store.ready;
    const state = this.getState(tabId);
    const coordinator = this.coordinators.get(tabId);
    const relevant = frameId === 0 || (state.phase === 'searching' && coordinator?.knows(frameId)) ||
      (state.phase !== 'off' && (('target' in state && state.target?.frameId === frameId) ||
        state.ancestors?.some(ancestor => ancestor.parentFrameId === frameId || ancestor.childFrameId === frameId)));
    if (!relevant) return;
    this.pendingOperations.delete(tabId); coordinator?.abort.abort();
    if (state.phase !== 'off' || (frameId === 0 && state.reason === 'TARGET_LOST')) await this.disable(tabId, 'NAVIGATION');
  }

  async frameLost(tabId: number, frameId: number, operationId: string, nonce: string, token: string, reason: OffReason = 'TARGET_LOST'): Promise<void> {
    const state = this.getState(tabId);
    if (state.phase !== 'off' && state.operationId === operationId && state.ancestors?.some(ancestor =>
      ancestor.parentFrameId === frameId && ancestor.parentNonce === nonce && ancestor.token === token)) {
      await this.disable(tabId, reason);
    }
  }

  async targetLost(tabId: number, operationId: string, target: TargetRef, reason: OffReason = 'TARGET_LOST'): Promise<void> {
    const state = this.getState(tabId);
    if (state.phase === 'off' || state.operationId !== operationId || !('target' in state) || !state.target ||
        state.target.documentNonce !== target.documentNonce || state.target.targetId !== target.targetId ||
        state.target.mediaToken !== target.mediaToken || state.target.frameId !== target.frameId) return;
    await this.disable(tabId, reason);
  }

  async remove(tabId: number): Promise<void> {
    this.coordinators.get(tabId)?.abort.abort(); this.coordinators.delete(tabId);
    this.pendingOperations.delete(tabId);
    this.actionChains.delete(tabId);
    this.intentions.delete(tabId);
    await this.store.ready;
    await this.store.delete(tabId);
    for (const key of this.requests.keys()) if (key.startsWith(`${tabId}:`)) this.requests.delete(key);
  }

  private async enable(tabId: number, intention: object): Promise<TabState> {
    if (this.store.pending(tabId)) {
      await this.retryCleanup(tabId);
      if (this.intentions.get(tabId) !== intention) return this.getState(tabId);
      if (this.store.pending(tabId)) return this.disable(tabId, 'AGENT_UNAVAILABLE');
    }
    let state = this.getState(tabId);
    if (state.phase === 'on') return this.readState(tabId);
    if (state.phase !== 'off') await this.disable(tabId, 'USER');
    if (this.intentions.get(tabId) !== intention) return this.getState(tabId);
    const operationId = crypto.randomUUID();
    this.pendingOperations.set(tabId, operationId);
    const urlFingerprint = await fingerprint((await browser.tabs.get(tabId)).url ?? '');
    let probe = await this.send(tabId, { protocolVersion: PROTOCOL_VERSION, type: 'PROBE', requestId: requestId() });
    if (!probe) {
      await this.injectAgent(tabId);
      probe = await this.send(tabId, { protocolVersion: PROTOCOL_VERSION, type: 'PROBE', requestId: requestId() });
    }
    if (this.pendingOperations.get(tabId) !== operationId) {
      await this.cancel(tabId, operationId);
      return this.getState(tabId);
    }
    if (!probe || probe.type !== 'PROBED') return this.fail(tabId, 'AGENT_UNAVAILABLE', operationId);

    state = startEnable(this.getState(tabId), operationId, probe.documentNonce);
    if (state.phase !== 'off') state = { ...state, urlFingerprint };
    await this.commitState(state);
    if (!this.isCurrent(tabId, operationId)) return this.getState(tabId);
    const coordinator = new FrameCoordinator(tabId, operationId, (frameId, message, timeout) => this.send(tabId, message, frameId, timeout));
    this.coordinators.set(tabId, coordinator);
    const selection = await coordinator.collect();
    if (!this.isCurrent(tabId, operationId)) {
      await this.cancel(tabId, operationId);
      return this.getState(tabId);
    }
    if (typeof selection === 'string') return this.fail(tabId, selection, operationId);
    const { target, ancestors } = selection;
    if (coordinator.documents.get(0)?.nonce !== probe.documentNonce) return this.fail(tabId, 'NAVIGATION', operationId);
    state = { ...this.getState(tabId), ancestors } as TabState;
    await this.commitState(state);
    if (!this.isCurrent(tabId, operationId) || !await coordinator.watch(ancestors)) return this.fail(tabId, 'FRAMES_UNAVAILABLE', operationId);
    if (!this.isCurrent(tabId, operationId)) return this.getState(tabId);
    // Persist the possible effect owner before sending the first mutating command.
    state = startApply(this.getState(tabId), operationId, target, selection.warning);
    await this.commitState(state);
    if (!this.isCurrent(tabId, operationId)) return this.getState(tabId);
    const applied = await this.send(tabId, { protocolVersion: PROTOCOL_VERSION, type: 'PREPARE_APPLY',
      requestId: requestId(), operationId, ...target });
    if (!this.isCurrent(tabId, operationId)) {
      await this.disableTarget(tabId, operationId, target);
      return this.getState(tabId);
    }
    if (!this.matches(applied, 'APPLIED', operationId, target)) {
      const reason = applied?.type === 'ERROR' && applied.code === 'TRANSFORM_CONFLICT' ? 'TRANSFORM_CONFLICT' : 'APPLY_FAILED';
      return this.fail(tabId, reason, operationId, target);
    }

    const committed = await this.send(tabId, { protocolVersion: PROTOCOL_VERSION, type: 'COMMIT',
      requestId: requestId(), operationId, ...target });
    if (!this.isCurrent(tabId, operationId) || !this.matches(committed, 'COMMITTED', operationId, target)) {
      await this.disableTarget(tabId, operationId, target);
      if (this.isCurrent(tabId, operationId)) return this.fail(tabId, 'APPLY_FAILED', operationId);
      return this.getState(tabId);
    }

    if (!await coordinator.watch(ancestors, true) || !this.isCurrent(tabId, operationId)) {
      await this.disableTarget(tabId, operationId, target);
      return this.fail(tabId, 'FRAMES_UNAVAILABLE', operationId, target);
    }
    await coordinator.release();
    if (!this.isCurrent(tabId, operationId)) return this.getState(tabId);
    state = confirmOn(this.getState(tabId), operationId, target);
    await this.commitState(state);
    if (this.pendingOperations.get(tabId) === operationId) this.pendingOperations.delete(tabId);
    return this.getState(tabId);
  }

  private async disable(tabId: number, reason: OffReason): Promise<TabState> {
    const previous = this.getState(tabId);
    this.pendingOperations.delete(tabId);
    this.coordinators.get(tabId)?.abort.abort();
    const off = turnOff(previous, reason);
    let failure: unknown;
    try { await this.commitState(off); } catch (error) { failure = error; }
    if (previous.phase !== 'off') await this.cancel(tabId, previous.operationId, previous);
    if (failure) throw failure;
    return this.getState(tabId);
  }

  private async fail(tabId: number, reason: OffReason, operationId?: string, target?: TargetRef): Promise<TabState> {
    if (operationId && this.pendingOperations.get(tabId) !== operationId && !this.isCurrent(tabId, operationId)) return this.getState(tabId);
    this.pendingOperations.delete(tabId);
    const off = turnOff(this.getState(tabId), reason);
    let failure: unknown;
    try { await this.commitState(off); } catch (error) { failure = error; }
    if (operationId && target) await this.disableTarget(tabId, operationId, target);
    if (operationId) await this.cancel(tabId, operationId);
    if (failure) throw failure;
    return this.getState(tabId);
  }

  private async commitState(state: TabState): Promise<void> {
    if (state.phase !== 'off') {
      await this.navigationSettled(state.tabId);
      const current = this.getState(state.tabId);
      if (current.revision > state.revision || (current.phase === 'off' && !this.pendingOperations.has(state.tabId))) return;
    }
    let failure: unknown;
    try { await this.store.set(state); } catch (error) { failure = error; }
    const previous = this.actionChains.get(state.tabId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(async () => {
      if (this.getState(state.tabId).revision !== state.revision) return;
      await presentState(state);
      const current = this.getState(state.tabId);
      if (current.revision !== state.revision) await presentState(current);
    });
    this.actionChains.set(state.tabId, next);
    await next;
    if (failure) throw failure;
  }

  private async emergencyOff(tabId: number): Promise<TabState> {
    const previous = this.getState(tabId);
    this.pendingOperations.delete(tabId);
    const off = turnOff(previous, 'APPLY_FAILED');
    await this.commitState(off).catch(() => undefined);
    if (previous.phase !== 'off' && 'target' in previous && previous.target) await this.disableTarget(tabId, previous.operationId, previous.target);
    if (previous.phase !== 'off') await this.cancel(tabId, previous.operationId, previous);
    return this.getState(tabId);
  }

  private isCurrent(tabId: number, operationId: string): boolean {
    return isCurrentOperation(this.getState(tabId), operationId) && this.pendingOperations.get(tabId) === operationId;
  }

  private matches(response: ContentResponse | undefined, type: 'APPLIED' | 'COMMITTED', operationId: string, target: TargetRef): boolean {
    return response?.type === type && response.operationId === operationId &&
      response.documentNonce === target.documentNonce && response.targetId === target.targetId && response.mediaToken === target.mediaToken;
  }

  private async cancel(tabId: number, operationId: string, state?: TabState): Promise<void> {
    const coordinator = this.coordinators.get(tabId);
    if (coordinator?.operationId === operationId) {
      await coordinator.cancel();
      if (this.coordinators.get(tabId) === coordinator) this.coordinators.delete(tabId);
    }
    // Persisted cleanup is independent of the worker's in-memory coordinator.
    const pending = this.store.pending(tabId);
    if (pending && pending.phase !== 'off' && pending.operationId === operationId) {
      await this.retryCleanup(tabId);
    } else if (!coordinator || coordinator.operationId !== operationId) {
      const ids = new Set([0]);
      if (state && state.phase !== 'off') {
        if ('target' in state && state.target) ids.add(state.target.frameId);
        for (const ancestor of state.ancestors ?? []) ids.add(ancestor.parentFrameId);
      }
      await Promise.all([...ids].map(frameId => this.send(tabId, { protocolVersion: PROTOCOL_VERSION,
        type: 'CANCEL_OPERATION', requestId: requestId(), operationId }, frameId)));
    }
  }

  private async retryCleanup(tabId: number): Promise<void> {
    const state = this.store.pending(tabId);
    if (!state || state.phase === 'off') return;
    const ids = new Set([0]);
    if ('target' in state && state.target) ids.add(state.target.frameId);
    for (const ancestor of state.ancestors ?? []) ids.add(ancestor.parentFrameId);
    const frames = await browser.webNavigation.getAllFrames({ tabId }).catch(() => null);
    const results = await Promise.all([...ids].map(async frameId => {
      if (frames && !frames.some(frame => frame.frameId === frameId)) return true;
      const reply = await this.send(tabId, { protocolVersion: 1, type: 'CANCEL_OPERATION',
        requestId: requestId(), operationId: state.operationId }, frameId, 500);
      return reply?.type === 'CANCELLED' && reply.operationId === state.operationId;
    }));
    if (results.every(Boolean)) {
      await this.store.clearPending(tabId, state.operationId);
    }
  }

  private async disableTarget(tabId: number, operationId: string, target: TargetRef): Promise<void> {
    await this.send(tabId, { protocolVersion: PROTOCOL_VERSION, type: 'DISABLE', requestId: requestId(), operationId, ...target });
  }

  private async injectAgent(tabId: number): Promise<void> {
    try {
      await browser.scripting.executeScript({ target: { tabId, frameIds: [0] }, files: ['/content-scripts/content.js'] });
    } catch { /* Protected or revoked pages remain safely unavailable. */ }
  }

  private async send(tabId: number, message: ContentRequest, frameId = 'frameId' in message ? message.frameId : 0,
    timeout = RESPONSE_TIMEOUT_MS): Promise<ContentResponse | undefined> {
    let timer: number | undefined;
    try {
      if (message.type === 'PREPARE_APPLY' || message.type === 'COMMIT') {
        await this.navigationSettled(tabId);
        if (!this.isCurrent(tabId, message.operationId)) return undefined;
      }
      const result = await Promise.race([
        browser.tabs.sendMessage(tabId, message, { frameId }),
        new Promise<undefined>(resolve => { timer = setTimeout(resolve, timeout); }),
      ]);
      return isContentResponse(result) && result.requestId === message.requestId ? result : undefined;
    } catch { return undefined; }
    finally { if (timer) clearTimeout(timer); }
  }
}
