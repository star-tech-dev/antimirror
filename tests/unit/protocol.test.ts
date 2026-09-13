import { describe, expect, it } from 'vitest';
import { isContentRequest, isContentResponse, isTargetLost, isUiRequest } from '../../src/shared/protocol';

describe('protocol runtime guards', () => {
  it('accepts only versioned bounded UI messages', () => {
    expect(isUiRequest({ protocolVersion: 1, type: 'SET_ENABLED', tabId: 3, desired: true, requestId: 'r' })).toBe(true);
    expect(isUiRequest({ protocolVersion: 2, type: 'SET_ENABLED', tabId: 3, desired: true, requestId: 'r' })).toBe(false);
    expect(isUiRequest({ protocolVersion: 1, type: 'SET_ENABLED', tabId: 3, desired: 'yes', requestId: 'r' })).toBe(false);
    expect(isUiRequest({ protocolVersion: 1, type: 'GET_STATE', tabId: 3, requestId: 'x'.repeat(129) })).toBe(false);
  });

  it('rejects forged frame IDs and oversized candidate arrays', () => {
    const addressed = { protocolVersion: 1, type: 'PREPARE_APPLY', requestId: 'r', operationId: 'o',
      frameId: 0, documentNonce: 'd', targetId: 't', mediaToken: 'm' };
    expect(isContentRequest(addressed)).toBe(true);
    expect(isContentRequest({ ...addressed, frameId: 8 })).toBe(true);
    expect(isContentRequest({ ...addressed, frameId: -1 })).toBe(false);
    expect(isContentRequest({ ...addressed, documentId: 'x'.repeat(129) })).toBe(false);
    expect(isContentRequest({ ...addressed, type: { toString: () => 'PREPARE_APPLY' } })).toBe(false);
    const snapshot = { targetId: 't', mediaToken: 'm', visibleArea: 1000, playing: false, fullscreen: false };
    const response = { protocolVersion: 1, type: 'CANDIDATES', requestId: 'r', operationId: 'o',
      documentNonce: 'd', complete: true, closedRoots: true, candidates: [snapshot], visits: 10, frameCount: 0 };
    expect(isContentResponse(response)).toBe(true);
    expect(isContentResponse({ ...response, candidates: Array.from({ length: 33 }, () => snapshot) })).toBe(false);
    expect(isContentResponse({ ...response, candidates: [{ ...snapshot, visibleArea: NaN }] })).toBe(false);
    expect(isContentResponse({ ...response, candidates: [{ ...snapshot, visibleArea: Number.MAX_VALUE }] })).toBe(false);
    expect(isContentResponse({ ...response, candidates: [{ ...snapshot, playing: 'yes' }] })).toBe(false);
    expect(isContentResponse({ ...response, frameCount: 65 })).toBe(false);
    expect(isContentResponse({ ...response, visits: 25001 })).toBe(false);
    const discover = { protocolVersion:1, type:'DISCOVER', requestId:'r', operationId:'o', documentNonce:'d' };
    expect(isContentRequest({ ...discover, durationMs:3001 })).toBe(false);
    expect(isContentRequest({ ...discover, elementLimit:25001 })).toBe(false);
    expect(isContentResponse({ protocolVersion: 1, type: 'ERROR', requestId: 'r', code: 'PAGE_SUPPLIED' })).toBe(false);
    expect(isContentResponse({ protocolVersion: 1, type: 'ERROR', requestId: 'r', code: 'STALE_TARGET' })).toBe(true);
  });

  it('accepts only declared target-loss reasons', () => {
    const lost = { protocolVersion: 1, type: 'TARGET_LOST', operationId: 'o', frameId: 0,
      documentNonce: 'd', targetId: 't', mediaToken: 'm' };
    expect(isTargetLost({ ...lost, reason: 'MEDIA_CHANGED' })).toBe(true);
    expect(isTargetLost({ ...lost, reason: 'PIP_UNSUPPORTED' })).toBe(false);
    expect(isTargetLost({ ...lost, reason: 'UNKNOWN' })).toBe(false);
    expect(isTargetLost({ ...lost, reason: { toString: () => 'NAVIGATION' } })).toBe(false);
  });
});
