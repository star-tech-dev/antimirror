import { describe, expect, it } from 'vitest';
import { isContentRequest, isContentResponse, isUiRequest } from '../../src/shared/protocol';

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
    expect(isContentRequest({ ...addressed, frameId: 8 })).toBe(false);
    expect(isContentResponse({ protocolVersion: 1, type: 'CANDIDATES', requestId: 'r', operationId: 'o',
      documentNonce: 'd', candidates: [{ targetId: '1', mediaToken: '1' }, { targetId: '2', mediaToken: '2' },
        { targetId: '3', mediaToken: '3' }] })).toBe(false);
  });
});
