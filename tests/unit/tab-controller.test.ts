import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  storageGet: vi.fn(), storageSet: vi.fn(), setIcon: vi.fn(), setTitle: vi.fn(),
  sendMessage: vi.fn(), executeScript: vi.fn(), getAllFrames: vi.fn(), getTab: vi.fn(),
}));

vi.mock('wxt/browser', () => ({ browser: {
  storage: { session: { get: mocks.storageGet, set: mocks.storageSet } },
  action: { setIcon: mocks.setIcon, setTitle: mocks.setTitle },
  tabs: { sendMessage: mocks.sendMessage, get: mocks.getTab },
  scripting: { executeScript: mocks.executeScript },
  webNavigation: { getAllFrames: mocks.getAllFrames },
} }));

import { TabController } from '../../src/background/tab-controller';

const reply = (message: Record<string, unknown>) => {
  const common = { protocolVersion: 1, requestId: message.requestId };
  switch (message.type) {
    case 'PROBE': return { ...common, type: 'PROBED', documentNonce: 'document' };
    case 'DISCOVER': return { ...common, type: 'CANDIDATES', operationId: message.operationId,
      documentNonce: 'document', complete: true, closedRoots: true, visits: 10, frameCount: 0,
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
  mocks.getTab.mockResolvedValue({ id: 3, url: 'https://example.test/' });
  mocks.getAllFrames.mockResolvedValue([{ frameId: 0, parentFrameId: -1 }]);
  mocks.sendMessage.mockImplementation((_tabId: number, message: Record<string, unknown>) => Promise.resolve(reply(message)));
});

describe('TabController failures', () => {
  it('does not disguise unavailable session storage as an empty successful initialization', async () => {
    mocks.storageGet.mockRejectedValue(new Error('Session read failed'));
    const controller = new TabController();
    await expect(controller.ready).rejects.toThrow('Session read failed');
    expect(mocks.sendMessage).not.toHaveBeenCalled();
    expect(mocks.setIcon).not.toHaveBeenCalled();
  });
  it('holds COMMIT behind a delayed URL comparison', async () => {
    const controller = new TabController(); await controller.ready;
    let resolveApply!: (value: unknown) => void;
    let prepared!: () => void;
    const waiting = new Promise<void>(resolve => { prepared = resolve; });
    let apply: Record<string, unknown>;
    mocks.sendMessage.mockImplementation(async (_tabId, message) => {
      if (message.type === 'PREPARE_APPLY') {
        apply = message; prepared(); return new Promise(resolve => { resolveApply = resolve; });
      }
      return reply(message);
    });
    const enabled = controller.setEnabled(3, true, 'enable'); await waiting;
    const nativeDigest = crypto.subtle.digest.bind(crypto.subtle);
    let finish!: () => void;
    const digest = vi.spyOn(crypto.subtle, 'digest').mockImplementation((algorithm, data) => new Promise(resolve => {
      finish = () => { void nativeDigest(algorithm, data).then(resolve); };
    }));
    try {
      const navigation = controller.historyChanged(3, 'https://example.test/#next');
      await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
      resolveApply(reply(apply!));
      await Promise.resolve(); await Promise.resolve();
      expect(mocks.sendMessage.mock.calls.some(([, message]) => message.type === 'COMMIT')).toBe(false);
      finish(); await navigation; await enabled;
      expect(controller.getState(3)).toMatchObject({ phase: 'off', reason: 'NAVIGATION' });
      expect(mocks.sendMessage.mock.calls.some(([, message]) => message.type === 'COMMIT')).toBe(false);
    } finally { digest.mockRestore(); }
  });

  it('cancels an uncommitted saved apply instead of replaying COMMIT', async () => {
    mocks.storageGet.mockResolvedValue({ 'antimirror.tabs.v1': { 3: {
      tabId: 3, phase: 'applying', revision: 4, operationId: 'saved', topDocumentNonce: 'document',
      target: { frameId: 0, documentNonce: 'document', targetId: 'target', mediaToken: 'media' },
    } } });
    mocks.sendMessage.mockImplementation(async (_tabId, message) => message.type === 'GET_TARGET_STATE'
      ? reply({ ...message, type: 'PREPARE_APPLY' }) : reply(message));
    const controller = new TabController(); await controller.ready;
    expect(controller.getState(3).phase).toBe('off');
    expect(mocks.sendMessage.mock.calls.some(([, message]) => message.type === 'COMMIT')).toBe(false);
    expect(mocks.sendMessage.mock.calls.some(([, message]) => message.type === 'CANCEL_OPERATION')).toBe(true);
  });

  it('retries persisted CANCEL cleanup before allowing another target', async () => {
    const saved = { tabId: 3, phase: 'on', revision: 4, operationId: 'saved', topDocumentNonce: 'document',
      target: { frameId: 0, documentNonce: 'document', targetId: 'target', mediaToken: 'media' } };
    mocks.storageGet.mockResolvedValue({ 'antimirror.tabs.v1': { 3: { phase: 'off', tabId: 3, revision: 5, reason: 'USER' } },
      'antimirror.cleanup.v1': { 3: saved } });
    let available = false;
    mocks.sendMessage.mockImplementation(async (_tabId, message) => {
      if (message.type === 'CANCEL_OPERATION' && !available) throw new Error('Transport unavailable');
      return reply(message);
    });
    const controller = new TabController(); await controller.ready;
    await expect(controller.setEnabled(3, true, 'blocked')).resolves.toMatchObject({phase:'off'});
    expect(mocks.sendMessage.mock.calls.some(([, message]) => message.type === 'DISCOVER')).toBe(false);
    available = true;
    await expect(controller.setEnabled(3, true, 'retry')).resolves.toMatchObject({phase:'on'});
    expect(mocks.storageSet.mock.calls.at(-1)?.[0]['antimirror.cleanup.v1']).toEqual({});
  });

  it('rejects an old APPLIED after OFF then a new successful ON', async () => {
    let release!: (value: unknown) => void;
    let prepared!: () => void;
    const waiting = new Promise<void>(resolve => { prepared = resolve; });
    let oldMessage: Record<string, unknown>;
    mocks.sendMessage.mockImplementation(async (_tabId, message) => {
      if (message.type === 'PREPARE_APPLY' && !oldMessage) {
        oldMessage = message; prepared();
        return new Promise(resolve => { release = resolve; });
      }
      return reply(message);
    });
    const controller = new TabController(); await controller.ready;
    const old = controller.setEnabled(3, true, 'old'); await waiting;
    await controller.setEnabled(3, false, 'off');
    const current = await controller.setEnabled(3, true, 'new');
    expect(current.phase).toBe('on');
    release(reply(oldMessage!)); await old;
    expect(controller.getState(3)).toEqual(current);
  });

  it('does not let a delayed old failure turn off a newer operation', async () => {
    let reject!: (error: Error) => void;
    mocks.getTab.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    const controller = new TabController(); await controller.ready;
    const old = controller.setEnabled(3, true, 'old');
    await controller.setEnabled(3, false, 'off');
    const current = await controller.setEnabled(3, true, 'new');
    reject(new Error('Delayed tab query failure')); await old;
    expect(controller.getState(3)).toEqual(current);
  });

  it('preserves same URL history and resets an actual hash change', async () => {
    const controller = new TabController(); await controller.ready;
    await controller.setEnabled(3, true, 'enable');
    await controller.historyChanged(3, 'https://example.test/');
    expect(controller.getState(3).phase).toBe('on');
    await controller.historyChanged(3, 'https://example.test/#next');
    expect(controller.getState(3)).toMatchObject({ phase: 'off', reason: 'NAVIGATION' });
  });

  for (const phase of ['on', 'applying', 'searching'] as const) {
    it(`reconciles saved ${phase} without discovery`, async () => {
      mocks.storageGet.mockResolvedValue({ 'antimirror.tabs.v1': { 3: {
        tabId: 3, phase, revision: 4, operationId: 'saved', topDocumentNonce: 'document',
        target: { frameId: 0, documentNonce: 'document', targetId: 'target', mediaToken: 'media' },
      } } });
      mocks.sendMessage.mockImplementation(async (_tabId, message) => message.type === 'GET_TARGET_STATE'
        ? { ...reply({ ...message, type: 'COMMIT' }) } : reply(message));
      const controller = new TabController(); await controller.ready;
      expect(controller.getState(3).phase).toBe(phase === 'searching' ? 'off' : 'on');
      expect(mocks.sendMessage.mock.calls.some(([, message]) => ['DISCOVER', 'PREPARE_APPLY', 'COMMIT'].includes(message.type))).toBe(false);
    });
  }

  it('cancels a saved target when an ancestor watcher is missing', async () => {
    mocks.storageGet.mockResolvedValue({ 'antimirror.tabs.v1': { 3: {
      tabId: 3, phase: 'on', revision: 4, operationId: 'saved', topDocumentNonce: 'document',
      target: { frameId: 1, documentNonce: 'document', targetId: 'target', mediaToken: 'media' },
      ancestors: [{ parentFrameId: 0, parentNonce: 'document', childFrameId: 1, childNonce: 'document', token: 'binding' }],
    } } });
    mocks.sendMessage.mockImplementation(async (_tabId, message) => message.type === 'GET_TARGET_STATE'
      ? reply({ ...message, type: 'COMMIT' }) : reply(message));
    const controller = new TabController(); await controller.ready;
    expect(controller.getState(3)).toMatchObject({ phase: 'off', reason: 'AGENT_UNAVAILABLE' });
    expect(mocks.sendMessage.mock.calls.filter(([, message]) => message.type === 'CANCEL_OPERATION').length).toBeGreaterThanOrEqual(1);
  });

  it('addresses APPLY to exactly one child and cleans up on permission revocation', async () => {
    mocks.getAllFrames.mockResolvedValue([{ frameId: 0, parentFrameId: -1 }, { frameId: 1, parentFrameId: 0 }]);
    mocks.sendMessage.mockImplementation(async (_tabId, message, { frameId }) => {
      const base = { protocolVersion: 1, requestId: message.requestId, operationId: message.operationId,
        documentNonce: frameId === 0 ? 'document' : 'child' };
      if (message.type === 'PROBE') return { ...base, type: 'PROBED' };
      if (message.type === 'DISCOVER') return { ...reply(message), ...base, frameCount: frameId === 0 ? 1 : 0,
        candidates: frameId === 0 ? [] : [{ targetId: 'target', mediaToken: 'media', visibleArea: 1000, fullscreen: false, playing: true }] };
      const bind = { BIND_CHILD: 'BIND_READY', EMIT_BIND: 'BIND_SENT', READ_BIND: 'BOUND', WATCH_CHILD: 'WATCHING', COMMIT_WATCH: 'WATCH_COMMITTED' } as Record<string, string>;
      if (bind[message.type]) return { ...base, type: bind[message.type], token: message.token, visible: true, fullscreen: false };
      return { ...reply(message), ...base };
    });
    const controller = new TabController(); await controller.ready;
    await expect(controller.setEnabled(3, true, 'request')).resolves.toMatchObject({phase:'on', target:{frameId:1}});
    const applies = mocks.sendMessage.mock.calls.filter(([, message]) => message.type === 'PREPARE_APPLY');
    expect(applies).toHaveLength(1); expect(applies[0]![2]).toEqual({ frameId: 1 });
    await controller.permissionsRevoked();
    expect(controller.getState(3)).toMatchObject({phase:'off', reason:'PERMISSION_DENIED'});
    expect(new Set(mocks.sendMessage.mock.calls.filter(([, message]) => message.type === 'CANCEL_OPERATION').map(call => call[2].frameId))).toEqual(new Set([0, 1]));
  });

  it('refuses malformed discovery metadata before APPLY', async () => {
    mocks.sendMessage.mockImplementation(async (_tabId, message) => ({ ...reply(message),
      ...(message.type === 'DISCOVER' ? { candidates: Array.from({ length: 33 }, () => ({targetId:'t', mediaToken:'m'})) } : {}) }));
    const controller = new TabController(); await controller.ready;
    await expect(controller.setEnabled(3, true, 'request')).resolves.toMatchObject({phase:'off', reason:'INCOMPLETE_COVERAGE'});
    expect(mocks.sendMessage.mock.calls.some(([, message]) => message.type === 'PREPARE_APPLY')).toBe(false);
  });
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
