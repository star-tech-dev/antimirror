import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ContentRequest } from '../../src/shared/protocol';
const mocks = vi.hoisted(() => ({ frames: vi.fn(), inject: vi.fn() }));
vi.mock('wxt/browser', () => ({ browser: { webNavigation: { getAllFrames: mocks.frames }, scripting: { executeScript: mocks.inject } } }));
import { FrameCoordinator, bounded } from '../../src/background/frame-coordinator';

beforeEach(() => { mocks.frames.mockReset(); mocks.inject.mockReset(); mocks.inject.mockResolvedValue([]); });
afterEach(() => vi.useRealTimers());
const frame = (frameId: number, parentFrameId = 0) => ({ frameId, parentFrameId, documentId: `doc-${frameId}` });
const response = (id: number, message: ContentRequest, hasVideo = false) => {
  const base = { protocolVersion: 1 as const, requestId: message.requestId, documentNonce: `nonce-${id}` };
  if (message.type === 'PROBE') return { ...base, type: 'PROBED' as const };
  const common = { ...base, operationId: 'operation' };
  if (message.type === 'DISCOVER') return { ...common, type: 'CANDIDATES' as const, complete: true, closedRoots: true, visits: 20, frameCount: 0,
    candidates: hasVideo ? [{ targetId: `target-${id}`, mediaToken: 'media', visibleArea: 1000, playing: true, fullscreen: false }] : [] };
  if ('token' in message) {
    const types = { BIND_CHILD: 'BIND_READY', EMIT_BIND: 'BIND_SENT', READ_BIND: 'BOUND', WATCH_CHILD: 'WATCHING', COMMIT_WATCH: 'WATCH_COMMITTED' } as const;
    return { ...common, type: types[message.type as keyof typeof types], token: message.token, visible: true, fullscreen: false };
  }
  return { ...common, type: 'CANCELLED' as const };
};

it('binds the selected document ancestry and never broadcasts APPLY', async () => {
  mocks.frames.mockResolvedValue([frame(0, -1), frame(1), frame(2, 1)]);
  const send = vi.fn(async (id: number, message: ContentRequest) => response(id, message, id === 2));
  const coordinator = new FrameCoordinator(10, 'operation', send);
  const selected = await coordinator.collect();
  expect(selected).toMatchObject({ target: { frameId: 2, documentNonce: 'nonce-2' }, ancestors: [
    { parentFrameId: 1, childFrameId: 2 }, { parentFrameId: 0, childFrameId: 1 } ] });
  expect(send.mock.calls.filter(([, message]) => message.type === 'PREPARE_APPLY')).toHaveLength(0);
  await coordinator.cancel();
  expect(send.mock.calls.filter(([, message]) => message.type === 'CANCEL_OPERATION')).toHaveLength(3);
});

it('refuses a tab beyond the frame cap without starting DOM discovery', async () => {
  mocks.frames.mockResolvedValue(Array.from({ length: 65 }, (_, i) => frame(i, i === 0 ? -1 : 0)));
  const send = vi.fn();
  expect(await new FrameCoordinator(1, 'operation', send).collect()).toBe('INCOMPLETE_COVERAGE');
  expect(send).not.toHaveBeenCalled();
});

it('limits active scans to four and reserves at most 100k visits across the tab', async () => {
  mocks.frames.mockResolvedValue(Array.from({ length: 8 }, (_, i) => frame(i, i === 0 ? -1 : 0)));
  let active = 0, maxActive = 0, reserved = 0, maxReserved = 0;
  const send = vi.fn(async (id: number, message: ContentRequest) => {
    if (message.type !== 'DISCOVER') return response(id, message, id === 0);
    active++; reserved += message.elementLimit!; maxActive = Math.max(maxActive, active); maxReserved = Math.max(maxReserved, reserved);
    await new Promise(resolve => setTimeout(resolve, 5));
    active--; reserved -= message.elementLimit!;
    return response(id, message, id === 0);
  });
  expect(await new FrameCoordinator(1, 'operation', send).collect()).toMatchObject({ target: { frameId: 0 } });
  expect(maxActive).toBe(4); expect(maxReserved).toBeLessThanOrEqual(100000);
});

it('distinguishes missing frames from empty documents and keeps accessible candidates with warning', async () => {
  mocks.frames.mockResolvedValue([frame(0, -1), frame(1)]);
  const send = vi.fn(async (id: number, message: ContentRequest) => id === 1 ? undefined : response(id, message, true));
  expect(await new FrameCoordinator(1, 'operation', send).collect()).toMatchObject({ target: { frameId: 0 }, warning: 'FRAMES_UNAVAILABLE' });
});

it('stops before spending more than 100k element visits across documents', async () => {
  mocks.frames.mockResolvedValue(Array.from({length:8}, (_, i) => frame(i, i === 0 ? -1 : 0)));
  let spent = 0;
  const send = vi.fn(async (id: number, message: ContentRequest) => {
    const reply = response(id, message);
    if (message.type === 'DISCOVER') { spent += message.elementLimit!; return {...reply, visits:message.elementLimit!}; }
    return reply;
  });
  expect(await new FrameCoordinator(1, 'operation', send).collect()).toBe('INCOMPLETE_COVERAGE');
  expect(spent).toBe(100000);
  expect(send.mock.calls.filter(([,message])=>message.type==='DISCOVER')).toHaveLength(4);
});

it('rejects incomplete responses and detects document replacement before selection', async () => {
  mocks.frames.mockResolvedValue([frame(0, -1)]);
  const send = vi.fn(async (id: number, message: ContentRequest) => ({ ...response(id, message, true), ...(message.type === 'DISCOVER' ? { complete: false } : {}) }));
  expect(await new FrameCoordinator(1, 'operation', send).collect()).toBe('INCOMPLETE_COVERAGE');
  mocks.frames.mockResolvedValueOnce([frame(0, -1)]).mockResolvedValueOnce([frame(0, -1)]).mockResolvedValue([{ ...frame(0, -1), documentId: 'replaced' }]);
  expect(await new FrameCoordinator(1, 'operation', async (id, message) => response(id, message, true)).collect()).toBe('NAVIGATION');
});

it('cancels bounded waits immediately and clears timeout resources', async () => {
  vi.useFakeTimers();
  const abort = new AbortController();
  const waiting = bounded(new Promise<never>(() => undefined), 1000, abort.signal);
  abort.abort(); expect(await waiting).toBeUndefined(); expect(vi.getTimerCount()).toBe(0);
  const timeout = bounded(new Promise<never>(() => undefined), 1000);
  await vi.advanceTimersByTimeAsync(1000); expect(await timeout).toBeUndefined(); expect(vi.getTimerCount()).toBe(0);
});
