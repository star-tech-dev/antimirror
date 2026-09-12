import { browser } from 'wxt/browser';
import { FrameCoordinator } from './frame-coordinator';
import { presentState } from './action-presenter';
import { SessionStore } from './session-store';
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
  readonly ready = this.store.ready;

  getState(tabId: number): TabState { return this.store.get(tabId) ?? initialState(tabId); }

  async permissionsRevoked(): Promise<void> {
    this.pendingOperations.clear();
    for (const coordinator of this.coordinators.values()) coordinator.abort.abort();
    await Promise.all(this.store.list().filter(state => state.phase !== 'off').map(state => this.disable(state.tabId, 'FRAMES_UNAVAILABLE')));
  }

  setEnabled(tabId: number, desired: boolean, id: string): Promise<TabState> {
    const key = `${tabId}:${id}`;
    const existing = this.requests.get(key);
    if (existing) return existing;
    const task = (desired ? this.enable(tabId) : this.disable(tabId, 'USER'))
      .catch(() => this.emergencyOff(tabId));
    this.requests.set(key, task);
    if (this.requests.size > 64) this.requests.delete(this.requests.keys().next().value!);
    return task;
  }

  async resetForNavigation(tabId: number, frameId = 0): Promise<void> {
    const state = this.getState(tabId);
    const coordinator = this.coordinators.get(tabId);
    const relevant = frameId === 0 || (state.phase === 'searching' && coordinator?.knows(frameId)) ||
      (state.phase !== 'off' && (('target' in state && state.target?.frameId === frameId) ||
        state.ancestors?.some(ancestor => ancestor.parentFrameId === frameId || ancestor.childFrameId === frameId)));
    if (!relevant) return;
    this.pendingOperations.delete(tabId); coordinator?.abort.abort();
    if (state.phase !== 'off') await this.disable(tabId, 'NAVIGATION');
  }

  async frameLost(tabId: number, frameId: number, operationId: string, nonce: string, token: string): Promise<void> {
    const state = this.getState(tabId);
    if (state.phase !== 'off' && state.operationId === operationId && state.ancestors?.some(ancestor =>
      ancestor.parentFrameId === frameId && ancestor.parentNonce === nonce && ancestor.token === token)) {
      await this.disable(tabId, 'TARGET_LOST');
    }
  }

  async targetLost(tabId: number, operationId: string, target: TargetRef): Promise<void> {
    const state = this.getState(tabId);
    if (state.phase === 'off' || state.operationId !== operationId || !('target' in state) || !state.target ||
        state.target.documentNonce !== target.documentNonce || state.target.targetId !== target.targetId ||
        state.target.mediaToken !== target.mediaToken || state.target.frameId !== target.frameId) return;
    await this.disable(tabId, 'TARGET_LOST');
  }

  async remove(tabId: number): Promise<void> {
    this.coordinators.get(tabId)?.abort.abort(); this.coordinators.delete(tabId);
    this.pendingOperations.delete(tabId);
    this.actionChains.delete(tabId);
    await this.store.delete(tabId);
    for (const key of this.requests.keys()) if (key.startsWith(`${tabId}:`)) this.requests.delete(key);
  }

  private async enable(tabId: number): Promise<TabState> {
    let state = this.getState(tabId);
    if (state.phase === 'on') return state;
    if (state.phase !== 'off') await this.disable(tabId, 'USER');
    const operationId = crypto.randomUUID();
    this.pendingOperations.set(tabId, operationId);
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

    state = startApply(this.getState(tabId), operationId, target, selection.warning);
    await this.commitState(state);
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
    this.pendingOperations.delete(tabId);
    return state;
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
    return off;
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
    return off;
  }

  private async commitState(state: TabState): Promise<void> {
    await this.store.set(state);
    const previous = this.actionChains.get(state.tabId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(async () => {
      if (this.getState(state.tabId).revision !== state.revision) return;
      await presentState(state);
      const current = this.getState(state.tabId);
      if (current.revision !== state.revision) await presentState(current);
    });
    this.actionChains.set(state.tabId, next);
    await next;
  }

  private async emergencyOff(tabId: number): Promise<TabState> {
    const previous = this.getState(tabId);
    this.pendingOperations.delete(tabId);
    const off = turnOff(previous, 'APPLY_FAILED');
    await this.store.set(off).catch(() => undefined);
    await presentState(off).catch(() => undefined);
    if (previous.phase !== 'off' && 'target' in previous && previous.target) await this.disableTarget(tabId, previous.operationId, previous.target);
    if (previous.phase !== 'off') await this.cancel(tabId, previous.operationId, previous);
    return off;
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
    } else {
      const ids = new Set([0]);
      if (state && state.phase !== 'off') {
        if ('target' in state && state.target) ids.add(state.target.frameId);
        for (const ancestor of state.ancestors ?? []) ids.add(ancestor.parentFrameId);
      }
      await Promise.all([...ids].map(frameId => this.send(tabId, { protocolVersion: PROTOCOL_VERSION,
        type: 'CANCEL_OPERATION', requestId: requestId(), operationId }, frameId)));
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
      const result = await Promise.race([
        browser.tabs.sendMessage(tabId, message, { frameId }),
        new Promise<undefined>(resolve => { timer = setTimeout(resolve, timeout); }),
      ]);
      return isContentResponse(result) && result.requestId === message.requestId ? result : undefined;
    } catch { return undefined; }
    finally { if (timer) clearTimeout(timer); }
  }
}
