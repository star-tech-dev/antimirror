export const PROTOCOL_VERSION = 1 as const;

export const OFF_REASONS = [
  'INITIAL', 'USER', 'NO_VIDEO', 'INCOMPLETE_COVERAGE', 'FRAMES_UNAVAILABLE',
  'PERMISSION_DENIED', 'TARGET_LOST', 'MEDIA_CHANGED', 'PLAYBACK_ENDED',
  'PIP_UNSUPPORTED', 'EFFECT_LOST', 'AMBIGUOUS_TARGET', 'NAVIGATION',
  'AGENT_UNAVAILABLE', 'APPLY_FAILED', 'TRANSFORM_CONFLICT',
] as const;
export type OffReason = typeof OFF_REASONS[number];

export interface TargetRef {
  frameId: number;
  documentNonce: string;
  documentId?: string;
  targetId: string;
  mediaToken: string;
}
export interface FrameBindingRef {
  parentFrameId: number;
  parentNonce: string;
  childFrameId: number;
  childNonce: string;
  token: string;
}
export type BindingRequest = { protocolVersion: 1; requestId: string; operationId: string; documentNonce: string; token: string } & (
  | { type: 'BIND_CHILD'; childFrameId: number; childNonce: string }
  | { type: 'EMIT_BIND' | 'READ_BIND' | 'WATCH_CHILD' | 'COMMIT_WATCH' | 'GET_WATCH_STATE' }
);
export type UiRequest =
  | { protocolVersion: 1; type: 'GET_STATE'; tabId: number; requestId: string }
  | { protocolVersion: 1; type: 'SET_ENABLED'; tabId: number; desired: boolean; requestId: string };

export type ContentRequest =
  | { protocolVersion: 1; type: 'PROBE'; requestId: string }
  | { protocolVersion: 1; type: 'DISCOVER'; requestId: string; operationId: string; documentNonce: string; durationMs?: number; elementLimit?: number }
  | BindingRequest
  | { protocolVersion: 1; type: 'RELEASE_DISCOVERY'; requestId: string; operationId: string; documentNonce: string }
  | ({ protocolVersion: 1; type: 'PREPARE_APPLY'; requestId: string; operationId: string } & TargetRef)
  | ({ protocolVersion: 1; type: 'COMMIT'; requestId: string; operationId: string } & TargetRef)
  | ({ protocolVersion: 1; type: 'GET_TARGET_STATE'; requestId: string; operationId: string } & TargetRef)
  | { protocolVersion: 1; type: 'CANCEL_OPERATION'; requestId: string; operationId: string }
  | ({ protocolVersion: 1; type: 'DISABLE'; requestId: string; operationId: string } & TargetRef);

export interface CandidateRef {
  targetId: string;
  mediaToken: string;
}

export interface CandidateSnapshot extends CandidateRef {
  visibleArea: number;
  playing: boolean;
  fullscreen: boolean;
}

const TARGET_LOST_REASONS = ['NAVIGATION', 'MEDIA_CHANGED', 'PLAYBACK_ENDED', 'EFFECT_LOST'] as const;
export type TargetLostReason = typeof TARGET_LOST_REASONS[number];
export type TargetLost = { protocolVersion: 1; type: 'TARGET_LOST'; operationId: string; reason?: TargetLostReason } & TargetRef;

export function isTargetLost(value: unknown): value is TargetLost {
  return isRecord(value) && value.protocolVersion === 1 && value.type === 'TARGET_LOST' &&
    isId(value.operationId) && isTargetRef(value) &&
    (value.reason === undefined || isOneOf(value.reason, TARGET_LOST_REASONS));
}

export type FrameLost = { protocolVersion: 1; type: 'FRAME_LOST'; operationId: string; documentNonce: string; token: string; reason?: 'NAVIGATION' };
export function isFrameLost(value: unknown): value is FrameLost {
  return isRecord(value) && value.protocolVersion === 1 && value.type === 'FRAME_LOST' &&
    isId(value.operationId) && isId(value.documentNonce) && isId(value.token) && (value.reason === undefined || value.reason === 'NAVIGATION');
}

export type ContentResponse =
  | { protocolVersion: 1; type: 'PROBED'; requestId: string; documentNonce: string }
  | { protocolVersion: 1; type: 'CANDIDATES'; requestId: string; operationId: string; documentNonce: string; complete: boolean; closedRoots: boolean; candidates: CandidateSnapshot[]; visits: number; frameCount: number }
  | { protocolVersion: 1; type: 'BOUND'; requestId: string; operationId: string; documentNonce: string; token: string; visible: boolean; fullscreen: boolean }
  | { protocolVersion: 1; type: 'BIND_READY' | 'BIND_SENT' | 'WATCHING' | 'WATCH_COMMITTED' | 'RELEASED'; requestId: string; operationId: string; documentNonce: string; token?: string }
  | ({ protocolVersion: 1; type: 'APPLIED' | 'COMMITTED' | 'DISABLED'; requestId: string; operationId: string } & CandidateRef & { documentNonce: string })
  | { protocolVersion: 1; type: 'CANCELLED'; requestId: string; operationId: string; documentNonce: string }
  | { protocolVersion: 1; type: 'ERROR'; requestId: string; code: OffReason | 'STALE_OPERATION' | 'STALE_DOCUMENT' | 'STALE_TARGET' };

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

export function isId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128;
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && allowed.includes(value as T);
}

export function isTargetRef(value: unknown): value is TargetRef {
  return isRecord(value) && isFrameId(value.frameId) && isId(value.documentNonce) &&
    (value.documentId === undefined || isId(value.documentId)) && isId(value.targetId) && isId(value.mediaToken);
}

export function isFrameBindingRef(value: unknown): value is FrameBindingRef {
  return isRecord(value) && isFrameId(value.parentFrameId) && isId(value.parentNonce) &&
    isFrameId(value.childFrameId) && isId(value.childNonce) && isId(value.token);
}

export function isOffReason(value: unknown): value is OffReason {
  return isOneOf(value, OFF_REASONS);
}

export function isFrameId(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

export function isUiRequest(value: unknown): value is UiRequest {
  if (!isRecord(value) || value.protocolVersion !== PROTOCOL_VERSION || !isId(value.requestId) ||
      !Number.isSafeInteger(value.tabId) || (value.tabId as number) < 0) return false;
  if (value.type === 'GET_STATE') return true;
  return value.type === 'SET_ENABLED' && typeof value.desired === 'boolean';
}

export function isContentRequest(value: unknown): value is ContentRequest {
  if (!isRecord(value) || value.protocolVersion !== PROTOCOL_VERSION || !isId(value.requestId) || typeof value.type !== 'string') return false;
  if (value.type === 'PROBE') return true;
  if (value.type === 'CANCEL_OPERATION') return isId(value.operationId);
  if (value.type === 'DISCOVER') return isId(value.operationId) && isId(value.documentNonce) &&
    (value.durationMs === undefined || (Number.isInteger(value.durationMs) && (value.durationMs as number) > 0 && (value.durationMs as number) <= 3000)) &&
    (value.elementLimit === undefined || (Number.isInteger(value.elementLimit) && (value.elementLimit as number) > 0 && (value.elementLimit as number) <= 25000));
  if (value.type === 'RELEASE_DISCOVERY') return isId(value.operationId) && isId(value.documentNonce);
  if (['BIND_CHILD', 'EMIT_BIND', 'READ_BIND', 'WATCH_CHILD', 'COMMIT_WATCH', 'GET_WATCH_STATE'].includes(value.type)) {
    return isId(value.operationId) && isId(value.documentNonce) && isId(value.token) &&
      (value.type !== 'BIND_CHILD' || (isFrameId(value.childFrameId) && isId(value.childNonce)));
  }
  if (!['PREPARE_APPLY', 'COMMIT', 'DISABLE', 'GET_TARGET_STATE'].includes(value.type)) return false;
  return isId(value.operationId) && isTargetRef(value);
}

export function isContentResponse(value: unknown): value is ContentResponse {
  if (!isRecord(value) || value.protocolVersion !== PROTOCOL_VERSION || !isId(value.requestId) || !isId(value.type)) return false;
  if (value.type === 'ERROR') return isOffReason(value.code) ||
    isOneOf(value.code, ['STALE_OPERATION', 'STALE_DOCUMENT', 'STALE_TARGET'] as const);
  if (value.type === 'PROBED') return isId(value.documentNonce);
  if (value.type === 'CANCELLED') return isId(value.operationId) && isId(value.documentNonce);
  if (['BOUND', 'BIND_READY', 'BIND_SENT', 'WATCHING', 'WATCH_COMMITTED', 'RELEASED'].includes(value.type)) {
    return isId(value.operationId) && isId(value.documentNonce) && (value.type === 'RELEASED' || isId(value.token)) &&
      (value.type !== 'BOUND' || (typeof value.visible === 'boolean' && typeof value.fullscreen === 'boolean'));
  }
  if (value.type === 'CANDIDATES') {
    return isId(value.operationId) && isId(value.documentNonce) && Array.isArray(value.candidates) &&
      typeof value.complete === 'boolean' && typeof value.closedRoots === 'boolean' &&
      Number.isInteger(value.visits) && (value.visits as number) >= 0 && (value.visits as number) <= 25000 &&
      Number.isInteger(value.frameCount) && (value.frameCount as number) >= 0 && (value.frameCount as number) <= 64 &&
      value.candidates.length <= 32 && value.candidates.every(candidate =>
        isRecord(candidate) && isId(candidate.targetId) && isId(candidate.mediaToken) &&
        typeof candidate.visibleArea === 'number' && Number.isFinite(candidate.visibleArea) &&
        candidate.visibleArea > 0 && candidate.visibleArea <= Number.MAX_SAFE_INTEGER &&
        typeof candidate.playing === 'boolean' && typeof candidate.fullscreen === 'boolean');
  }
  return ['APPLIED', 'COMMITTED', 'DISABLED'].includes(value.type) && isId(value.operationId) &&
    isId(value.documentNonce) && isId(value.targetId) && isId(value.mediaToken);
}
