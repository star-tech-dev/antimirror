import { describe, expect, it } from 'vitest';
import { confirmOn, initialState, isCurrentOperation, isTabState, startApply, startEnable, turnOff } from '../../src/shared/state';
import type { TargetRef } from '../../src/shared/protocol';

const target: TargetRef = { frameId: 0, documentNonce: 'document', targetId: 'video', mediaToken: 'media' };

describe('tab state reducer', () => {
  it('requires the same operation and target before confirming ON', () => {
    const searching = startEnable(initialState(7), 'operation', 'document');
    expect(startApply(searching, 'late', target)).toBe(searching);
    const applying = startApply(searching, 'operation', target);
    expect(confirmOn(applying, 'late', target)).toBe(applying);
    expect(confirmOn(applying, 'operation', { ...target, targetId: 'other' })).toBe(applying);
    expect(confirmOn(applying, 'operation', target)).toMatchObject({ phase: 'on', revision: 3, target });
  });

  it('invalidates the operation before late results arrive', () => {
    const searching = startEnable(initialState(2), 'first', 'document');
    const off = turnOff(searching, 'USER');
    expect(off).toEqual({ phase: 'off', tabId: 2, revision: 2, reason: 'USER' });
    expect(isCurrentOperation(off, 'first')).toBe(false);
    expect(startApply(off, 'first', target)).toBe(off);
    expect(startEnable(off, 'second', 'document')).toMatchObject({ operationId: 'second', revision: 3 });
  });

  it('rejects malformed session records', () => {
    expect(isTabState(initialState(1))).toBe(true);
    expect(isTabState({ phase: 'on', tabId: 1, revision: 2, operationId: 'o', topDocumentNonce: 'd' })).toBe(false);
    expect(isTabState({ phase: 'off', tabId: '1', revision: 2, reason: 'USER' })).toBe(false);
    expect(isTabState({ phase: 'off', tabId: -1, revision: 2, reason: 'USER' })).toBe(false);
    expect(isTabState({ phase: 'off', tabId: 1, revision: 2, reason: 'PAGE_SUPPLIED' })).toBe(false);
    expect(isTabState({ phase: 'searching', tabId: 1, revision: 2,
      operationId: 'x'.repeat(129), topDocumentNonce: 'd' })).toBe(false);
    expect(isTabState({ phase: 'on', tabId: 1, revision: 2, operationId: 'o', topDocumentNonce: 'd',
      target: { ...target, mediaToken: 'x'.repeat(129) } })).toBe(false);
    expect(isTabState({ phase: 'on', tabId: 1, revision: 2, operationId: 'o', topDocumentNonce: 'd', target,
      ancestors: [{ parentFrameId: 0, parentNonce: 'd', childFrameId: 1, childNonce: 'd', token: 'x'.repeat(129) }] })).toBe(false);
    expect(isTabState({ phase: { toString: () => 'searching' }, tabId: 1, revision: 2,
      operationId: 'o', topDocumentNonce: 'd' })).toBe(false);
  });
});
