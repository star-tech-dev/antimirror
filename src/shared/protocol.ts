export const PROTOCOL_VERSION = 1 as const;

export type OffReason =
  | 'INITIAL'
  | 'USER'
  | 'NO_VIDEO'
  | 'AMBIGUOUS_TARGET'
  | 'NAVIGATION'
  | 'AGENT_UNAVAILABLE'
  | 'APPLY_FAILED'
  | 'TRANSFORM_CONFLICT';

export interface TargetRef {
  frameId: number;
  documentNonce: string;
  documentId?: string;
  targetId: string;
  mediaToken: string;
}
export type UiRequest =
  | { protocolVersion: 1; type: 'GET_STATE'; tabId: number; requestId: string }
  | { protocolVersion: 1; type: 'SET_ENABLED'; tabId: number; desired: boolean; requestId: string };

export type ContentRequest =
  | { protocolVersion: 1; type: 'PROBE'; requestId: string }
  | { protocolVersion: 1; type: 'DISCOVER'; requestId: string; operationId: string; documentNonce: string }
  | ({ protocolVersion: 1; type: 'PREPARE_APPLY'; requestId: string; operationId: string } & TargetRef)
  | ({ protocolVersion: 1; type: 'COMMIT'; requestId: string; operationId: string } & TargetRef)
  | { protocolVersion: 1; type: 'CANCEL_OPERATION'; requestId: string; operationId: string }
  | ({ protocolVersion: 1; type: 'DISABLE'; requestId: string; operationId: string } & TargetRef);

export interface CandidateRef {
  targetId: string;
  mediaToken: string;
}

export type ContentResponse =
  | { protocolVersion: 1; type: 'PROBED'; requestId: string; documentNonce: string }
  | { protocolVersion: 1; type: 'CANDIDATES'; requestId: string; operationId: string; documentNonce: string; candidates: CandidateRef[] }
  | ({ protocolVersion: 1; type: 'APPLIED' | 'COMMITTED' | 'DISABLED'; requestId: string; operationId: string } & CandidateRef & { documentNonce: string })
  | { protocolVersion: 1; type: 'CANCELLED'; requestId: string; operationId: string; documentNonce: string }
  | { protocolVersion: 1; type: 'ERROR'; requestId: string; code: OffReason | 'STALE_OPERATION' | 'STALE_DOCUMENT' | 'STALE_TARGET' };

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128;
}

export function isUiRequest(value: unknown): value is UiRequest {
  if (!isRecord(value) || value.protocolVersion !== PROTOCOL_VERSION || !isId(value.requestId) ||
      !Number.isSafeInteger(value.tabId) || (value.tabId as number) < 0) return false;
  if (value.type === 'GET_STATE') return true;
  return value.type === 'SET_ENABLED' && typeof value.desired === 'boolean';
}

export function isContentRequest(value: unknown): value is ContentRequest {
  if (!isRecord(value) || value.protocolVersion !== PROTOCOL_VERSION || !isId(value.requestId)) return false;
  if (value.type === 'PROBE') return true;
  if (value.type === 'CANCEL_OPERATION') return isId(value.operationId);
  if (value.type === 'DISCOVER') return isId(value.operationId) && isId(value.documentNonce);
  if (!['PREPARE_APPLY', 'COMMIT', 'DISABLE'].includes(String(value.type))) return false;
  return isId(value.operationId) && value.frameId === 0 && isId(value.documentNonce) &&
    isId(value.targetId) && isId(value.mediaToken);
}

export function isContentResponse(value: unknown): value is ContentResponse {
  if (!isRecord(value) || value.protocolVersion !== PROTOCOL_VERSION || !isId(value.requestId) || !isId(value.type)) return false;
  if (value.type === 'ERROR') return isId(value.code);
  if (value.type === 'PROBED') return isId(value.documentNonce);
  if (value.type === 'CANCELLED') return isId(value.operationId) && isId(value.documentNonce);
  if (value.type === 'CANDIDATES') {
    return isId(value.operationId) && isId(value.documentNonce) && Array.isArray(value.candidates) &&
      value.candidates.length <= 2 && value.candidates.every(candidate =>
        isRecord(candidate) && isId(candidate.targetId) && isId(candidate.mediaToken));
  }
  return ['APPLIED', 'COMMITTED', 'DISABLED'].includes(value.type) && isId(value.operationId) &&
    isId(value.documentNonce) && isId(value.targetId) && isId(value.mediaToken);
}
