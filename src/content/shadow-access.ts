/** Only author roots; never patch attachShadow or consume page-provided references. */
export function getAccessibleShadowRoot(element: Element): ShadowRoot | null {
  if (element.shadowRoot) return element.shadowRoot;
  const chromeApi = (globalThis as unknown as {
    chrome?: { dom?: { openOrClosedShadowRoot?: (element: Element) => ShadowRoot | null } };
  }).chrome;
  if (chromeApi?.dom?.openOrClosedShadowRoot) return chromeApi.dom.openOrClosedShadowRoot(element);
  return (element as Element & { openOrClosedShadowRoot?: ShadowRoot | null }).openOrClosedShadowRoot ?? null;
}
