import { afterEach, expect, it, vi } from 'vitest';
import { getAccessibleShadowRoot } from '../../src/content/shadow-access';
afterEach(() => vi.unstubAllGlobals());
it('prefers an open root without calling the privileged getter', () => {
  const root = {} as ShadowRoot;
  const getter = vi.fn();
  vi.stubGlobal('chrome', { dom: { openOrClosedShadowRoot: getter } });
  expect(getAccessibleShadowRoot({ shadowRoot: root } as Element)).toBe(root);
  expect(getter).not.toHaveBeenCalled();
});
it('uses Chromium native accessor and passes the actual element', () => {
  const element = { shadowRoot: null } as Element;
  const root = {} as ShadowRoot;
  const getter = vi.fn(() => root);
  vi.stubGlobal('chrome', { dom: { openOrClosedShadowRoot: getter } });
  expect(getAccessibleShadowRoot(element)).toBe(root);
  expect(getter).toHaveBeenCalledWith(element);
});
it('uses Firefox accessor or reports unavailable without patching', () => {
  vi.stubGlobal('chrome', {});
  const root = {} as ShadowRoot;
  expect(getAccessibleShadowRoot({ shadowRoot: null, openOrClosedShadowRoot: root } as unknown as Element)).toBe(root);
  expect(getAccessibleShadowRoot({ shadowRoot: null } as Element)).toBeNull();
});
