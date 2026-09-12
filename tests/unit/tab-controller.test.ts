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
      documentNonce: 'document', candidates: [{ targetId: 'target', mediaToken: 'media' }] };
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
