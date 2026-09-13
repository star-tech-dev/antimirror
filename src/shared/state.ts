import { isFrameBindingRef, isId, isOffReason, isTargetRef, type OffReason, type TargetRef, type FrameBindingRef } from './protocol';

export interface Identity {
  tabId: number;
  operationId: string;
  revision: number;
  topDocumentNonce: string;
  urlFingerprint?: string;
  coverageWarning?: 'OPEN_ROOTS_ONLY' | 'FRAMES_UNAVAILABLE';
  ancestors?: FrameBindingRef[];
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

export function startApply(state: TabState, operationId: string, target: TargetRef, coverageWarning?: Identity['coverageWarning']): TabState {
  if (state.phase !== 'searching' || state.operationId !== operationId) return state;
  return { ...state, phase: 'applying', revision: state.revision + 1, target, ...(coverageWarning ? { coverageWarning } : {}) };
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
  if (state.urlFingerprint !== undefined && (typeof state.urlFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(state.urlFingerprint))) return false;
  if (state.coverageWarning !== undefined &&
      (typeof state.coverageWarning !== 'string' || !['OPEN_ROOTS_ONLY', 'FRAMES_UNAVAILABLE'].includes(state.coverageWarning))) return false;
  if (state.ancestors !== undefined && (!Array.isArray(state.ancestors) || state.ancestors.length > 64 ||
      !state.ancestors.every(isFrameBindingRef))) return false;
  if (!Number.isSafeInteger(state.tabId) || !Number.isSafeInteger(state.revision) ||
      (state.tabId as number) < 0 || (state.revision as number) < 0) return false;
  if (state.phase === 'off') return isOffReason(state.reason);
  if (typeof state.phase !== 'string' || !['searching', 'applying', 'on', 'disabling'].includes(state.phase) ||
      !isId(state.operationId) || !isId(state.topDocumentNonce)) return false;
  if (state.phase === 'searching') return true;
  if (state.phase === 'disabling' && state.target === undefined) return true;
  return isTargetRef(state.target);
}
