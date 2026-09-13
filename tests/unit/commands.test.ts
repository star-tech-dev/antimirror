import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('wxt/browser', () => ({ browser: { tabs: { query: mocks.query } } }));
import { handleBrowserCommand } from '../../src/background/commands';

describe('trusted browser command', () => {
  beforeEach(() => { mocks.query.mockReset(); });

  it('toggles the active tab with a fresh request id', async () => {
    mocks.query.mockResolvedValue([{ id: 7 }]);
    const controller = { ready: Promise.resolve(), readState: vi.fn().mockResolvedValue({ phase: 'off' }), setEnabled: vi.fn() };
    await handleBrowserCommand(controller as never, 'toggle-mirror');
    expect(controller.setEnabled).toHaveBeenCalledWith(7, true, expect.any(String));
    controller.readState.mockResolvedValue({ phase: 'searching' });
    await handleBrowserCommand(controller as never, 'toggle-mirror');
    expect(controller.setEnabled).toHaveBeenLastCalledWith(7, false, expect.any(String));
  });

  it('ignores unknown commands and a missing active tab', async () => {
    const controller = { ready: Promise.resolve(), readState: vi.fn(), setEnabled: vi.fn() };
    await handleBrowserCommand(controller as never, 'other');
    expect(mocks.query).not.toHaveBeenCalled();
    mocks.query.mockResolvedValue([]);
    await handleBrowserCommand(controller as never, 'toggle-mirror');
    expect(controller.setEnabled).not.toHaveBeenCalled();
  });
});
