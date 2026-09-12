import type { OffReason, TargetRef } from './protocol';

export interface Identity {
  tabId: number;
  operationId: string;
  revision: number;
  topDocumentNonce: string;
}

export type TabState =
  | { phase: 'off'; tabId: number; revision: number; reason: OffReason }
  | ({ phase: 'searching' } & Identity)
  | ({ phase: 'applying'; target: TargetRef } & Identity)
  | ({ phase: 'on'; target: TargetRef } & Identity)
  | ({ phase: 'disabling'; target?: TargetRef } & Identity);

export function initialState(tabId: number): TabState {
  return { phase: 'off', tabId, revision: 0, reason: 'INITIAL' };
}

export function startEnable(state: TabState, operationId: string, topDocumentNonce: string): TabState {
  return { phase: 'searching', tabId: state.tabId, revision: state.revision + 1, operationId, topDocumentNonce };
}

export function startApply(state: TabState, operationId: string, target: TargetRef): TabState {
  if (state.phase !== 'searching' || state.operationId !== operationId) return state;
  return { ...state, phase: 'applying', revision: state.revision + 1, target };
}

export function confirmOn(state: TabState, operationId: string, target: TargetRef): TabState {
  if (state.phase !== 'applying' || state.operationId !== operationId || state.target.targetId !== target.targetId) return state;
  return { ...state, phase: 'on', revision: state.revision + 1, target };
}

export function turnOff(state: TabState, reason: OffReason): TabState {
  return { phase: 'off', tabId: state.tabId, revision: state.revision + 1, reason };
}

export function isCurrentOperation(state: TabState, operationId: string): boolean {
  return state.phase !== 'off' && state.operationId === operationId;
}

export function isTabState(value: unknown): value is TabState {
  if (typeof value !== 'object' || value === null) return false;
  const state = value as Record<string, unknown>;
  if (!Number.isSafeInteger(state.tabId) || !Number.isSafeInteger(state.revision) ||
      (state.revision as number) < 0) return false;
  if (state.phase === 'off') return typeof state.reason === 'string';
  if (!['searching', 'applying', 'on', 'disabling'].includes(String(state.phase)) ||
      typeof state.operationId !== 'string' || typeof state.topDocumentNonce !== 'string') return false;
  if (state.phase === 'searching') return true;
  if (state.phase === 'disabling' && state.target === undefined) return true;
  if (typeof state.target !== 'object' || state.target === null) return false;
  const target = state.target as Record<string, unknown>;
  return target.frameId === 0 && typeof target.documentNonce === 'string' &&
    typeof target.targetId === 'string' && typeof target.mediaToken === 'string';
}
