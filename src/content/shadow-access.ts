/** Only author roots; never patch attachShadow or consume page-provided references. */
export function getAccessibleShadowRoot(element: Element): ShadowRoot | null {
  // Only HTML author-shadow hosts. In particular, never enter video/input UA controls.
  if (element.namespaceURI !== 'http://www.w3.org/1999/xhtml' ||
      (!element.localName.includes('-') && !AUTHOR_HOSTS.has(element.localName))) return null;
  if (element.shadowRoot) return element.shadowRoot;
  const chromeApi = (globalThis as unknown as {
    chrome?: { dom?: { openOrClosedShadowRoot?: (element: Element) => ShadowRoot | null } };
  }).chrome;
  if (chromeApi?.dom?.openOrClosedShadowRoot) return chromeApi.dom.openOrClosedShadowRoot(element);
  return (element as Element & { openOrClosedShadowRoot?: ShadowRoot | null }).openOrClosedShadowRoot ?? null;
}

const AUTHOR_HOSTS = new Set(['article', 'aside', 'blockquote', 'body', 'div', 'footer', 'h1', 'h2',
  'h3', 'h4', 'h5', 'h6', 'header', 'main', 'nav', 'p', 'section', 'span']);

export function hasNativeShadowAccess(): boolean {
  const chromeApi = (globalThis as unknown as { chrome?: { dom?: { openOrClosedShadowRoot?: unknown } } }).chrome;
  return typeof chromeApi?.dom?.openOrClosedShadowRoot === 'function' ||
    'openOrClosedShadowRoot' in document.createElement('div');
}
