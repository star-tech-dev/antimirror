import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  storageGet: vi.fn(), storageSet: vi.fn(), setIcon: vi.fn(), setTitle: vi.fn(),
  sendMessage: vi.fn(), executeScript: vi.fn(),
}));

vi.mock('wxt/browser', () => ({ browser: {
  storage: { session: { get: mocks.storageGet, set: mocks.storageSet } },
  action: { setIcon: mocks.setIcon, setTitle: mocks.setTitle },
  tabs: { sendMessage: mocks.sendMessage },
  scripting: { executeScript: mocks.executeScript },
} }));

import { TabController } from '../../src/background/tab-controller';

const reply = (message: Record<string, unknown>) => {
  const common = { protocolVersion: 1, requestId: message.requestId };
  switch (message.type) {
    case 'PROBE': return { ...common, type: 'PROBED', documentNonce: 'document' };
    case 'DISCOVER': return { ...common, type: 'CANDIDATES', operationId: message.operationId,
      documentNonce: 'document', complete: true, closedRoots: true,
      candidates: [{ targetId: 'target', mediaToken: 'media', visibleArea: 100_000, playing: false, fullscreen: false }] };
    case 'PREPARE_APPLY': return { ...common, type: 'APPLIED', operationId: message.operationId,
      documentNonce: 'document', targetId: 'target', mediaToken: 'media' };
    case 'COMMIT': return { ...common, type: 'COMMITTED', operationId: message.operationId,
      documentNonce: 'document', targetId: 'target', mediaToken: 'media' };
    case 'DISABLE': return { ...common, type: 'DISABLED', operationId: message.operationId,
      documentNonce: 'document', targetId: 'target', mediaToken: 'media' };
    default: return { ...common, type: 'CANCELLED', operationId: message.operationId, documentNonce: 'document' };
  }
};

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.storageGet.mockResolvedValue({});
  mocks.storageSet.mockResolvedValue(undefined);
  mocks.setIcon.mockResolvedValue(undefined);
  mocks.setTitle.mockResolvedValue(undefined);
  mocks.executeScript.mockResolvedValue([]);
  mocks.sendMessage.mockImplementation((_tabId: number, message: Record<string, unknown>) => Promise.resolve(reply(message)));
});

describe('TabController failures', () => {
  it('keeps open-root support with a persisted capability warning', async () => {
    mocks.sendMessage.mockImplementation((_tabId, message) => Promise.resolve({ ...reply(message), ...(message.type === 'DISCOVER' ? { closedRoots: false } : {}) }));
    const controller = new TabController();
    await controller.ready;
    await expect(controller.setEnabled(3, true, 'request')).resolves.toMatchObject({ phase: 'on', coverageWarning: 'OPEN_ROOTS_ONLY' });
  });
  it('never applies a candidate from incomplete coverage', async () => {
    mocks.sendMessage.mockImplementation((_tabId, message) => Promise.resolve({ ...reply(message), ...(message.type === 'DISCOVER' ? { complete: false } : {}) }));
    const controller = new TabController();
    await controller.ready;
    await expect(controller.setEnabled(3, true, 'request')).resolves.toMatchObject({ phase: 'off', reason: 'INCOMPLETE_COVERAGE' });
    expect(mocks.sendMessage.mock.calls.some(([, message]) => message.type === 'PREPARE_APPLY')).toBe(false);
  });

  it('ignores stale loss reports, but resets the exact selected target', async () => {
    const controller = new TabController();
    await controller.ready;
    const state = await controller.setEnabled(3, true, 'request');
    if (state.phase !== 'on') throw new Error('Expected ON');
    await controller.targetLost(3, 'old-operation', state.target);
    expect(controller.getState(3).phase).toBe('on');
    await controller.targetLost(3, state.operationId, state.target);
    expect(controller.getState(3)).toMatchObject({ phase: 'off', reason: 'TARGET_LOST' });
  });
  it('returns an explainable OFF state when the content agent is unavailable', async () => {
    mocks.sendMessage.mockRejectedValue(new Error('no receiver'));
    mocks.executeScript.mockRejectedValue(new Error('protected page'));
    const controller = new TabController();
    await controller.ready;
    await expect(controller.setEnabled(3, true, 'request')).resolves.toMatchObject({ phase: 'off', reason: 'AGENT_UNAVAILABLE' });
  });

  it('rolls back the target if presenting confirmed ON fails', async () => {
    mocks.setIcon.mockImplementation(({ path }: { path: Record<number, string> }) =>
      path[16]?.includes('/on-') || path[16]?.includes('on-') ? Promise.reject(new Error('action failed')) : Promise.resolve());
    const controller = new TabController();
    await controller.ready;
    await expect(controller.setEnabled(4, true, 'request')).resolves.toMatchObject({ phase: 'off', reason: 'APPLY_FAILED' });
    expect(mocks.sendMessage.mock.calls.some(([, message]) => message.type === 'DISABLE')).toBe(true);
  });

  it('rolls back the target if a transitional storage write fails', async () => {
    let failed = false;
    mocks.storageSet.mockImplementation((payload: Record<string, Record<string, { phase: string }>>) => {
      const phases = Object.values(Object.values(payload)[0] ?? {}).map(state => state.phase);
      if (!failed && phases.includes('applying')) { failed = true; return Promise.reject(new Error('storage failed')); }
      return Promise.resolve();
    });
    const controller = new TabController();
    await controller.ready;
    await expect(controller.setEnabled(5, true, 'request')).resolves.toMatchObject({ phase: 'off', reason: 'APPLY_FAILED' });
    expect(mocks.sendMessage.mock.calls.some(([, message]) => message.type === 'DISABLE')).toBe(true);
  });
});
