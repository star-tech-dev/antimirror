import { afterEach, expect, it, vi } from 'vitest';
import { getAccessibleShadowRoot } from '../../src/content/shadow-access';
afterEach(() => vi.unstubAllGlobals());
const host = { namespaceURI: 'http://www.w3.org/1999/xhtml', localName: 'div' };
it('prefers an open root without calling the privileged getter', () => {
  const root = {} as ShadowRoot;
  const getter = vi.fn();
  vi.stubGlobal('chrome', { dom: { openOrClosedShadowRoot: getter } });
  expect(getAccessibleShadowRoot({ ...host, shadowRoot: root } as Element)).toBe(root);
  expect(getter).not.toHaveBeenCalled();
});
it('uses Chromium native accessor and passes the actual element', () => {
  const element = { ...host, shadowRoot: null } as Element;
  const root = {} as ShadowRoot;
  const getter = vi.fn(() => root);
  vi.stubGlobal('chrome', { dom: { openOrClosedShadowRoot: getter } });
  expect(getAccessibleShadowRoot(element)).toBe(root);
  expect(getter).toHaveBeenCalledWith(element);
});
it('uses Firefox accessor or reports unavailable without patching', () => {
  vi.stubGlobal('chrome', {});
  const root = {} as ShadowRoot;
  expect(getAccessibleShadowRoot({ ...host, shadowRoot: null, openOrClosedShadowRoot: root } as unknown as Element)).toBe(root);
  expect(getAccessibleShadowRoot({ ...host, shadowRoot: null } as Element)).toBeNull();
});
it('does not ask privileged APIs for UA media or input controls', () => {
  const getter = vi.fn();
  vi.stubGlobal('chrome', { dom: { openOrClosedShadowRoot: getter } });
  for (const localName of ['video', 'input', 'audio', 'select']) {
    expect(getAccessibleShadowRoot({ ...host, localName } as Element)).toBeNull();
  }
  expect(getter).not.toHaveBeenCalled();
});
