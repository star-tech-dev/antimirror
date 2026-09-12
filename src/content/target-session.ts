/** Snapshot belongs only to the short candidate lease; never serialized. */
export function captureMediaIdentity(video: HTMLVideoElement): () => boolean {
  const src = video.currentSrc, attribute = video.getAttribute('src'), stream = video.srcObject;
  const children = Array.from(video.children);
  const sources = children.filter((node): node is HTMLSourceElement => node instanceof HTMLSourceElement);
  const attributes = sources.map(node => [node.src, node.type, node.media]);
  return () => video.currentSrc === src && video.getAttribute('src') === attribute && video.srcObject === stream &&
    video.children.length === children.length && children.every((node, index) => video.children[index] === node) &&
    sources.every((node, index) => node.src === attributes[index]![0] && node.type === attributes[index]![1] && node.media === attributes[index]![2]);
}

/** Local ownership checks. No discovery and no communication while the target is healthy. */
export function watchTargetSession(video: HTMLVideoElement, healthy: () => boolean, lost: () => void): { dispose(): void; check(): boolean } {
  const source = video.currentSrc;
  const attribute = video.getAttribute('src');
  const stream = video.srcObject;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const events = ['emptied', 'loadstart', 'error', 'ended'] as const;
  const invalidate = () => { if (!disposed) { dispose(); lost(); } };
  const check = () => {
    if (disposed) return false;
    if (!video.isConnected || video.error || video.ended || video.currentSrc !== source ||
        video.getAttribute('src') !== attribute || video.srcObject !== stream || !healthy()) invalidate();
    return !disposed;
  };
  const schedule = () => {
    clearTimeout(timer); timer = undefined;
    if (!disposed && !video.ownerDocument.hidden) timer = setTimeout(() => { check(); schedule(); }, 1000);
  };
  const visibility = () => { check(); schedule(); };
  const observer = new MutationObserver(records => {
    if (records.some(record => record.type === 'attributes' &&
      (record.target === video || record.target instanceof HTMLSourceElement) ||
      [...record.addedNodes, ...record.removedNodes].some(node => node instanceof HTMLSourceElement))) invalidate();
  });
  // Only this video's source attributes/children, never the document subtree.
  observer.observe(video, { attributes: true, attributeFilter: ['src', 'type', 'media'], childList: true, subtree: true });
  for (const event of events) video.addEventListener(event, invalidate);
  video.ownerDocument.addEventListener('visibilitychange', visibility);
  function dispose() {
    if (disposed) return;
    disposed = true; clearTimeout(timer); observer.disconnect();
    for (const event of events) video.removeEventListener(event, invalidate);
    video.ownerDocument.removeEventListener('visibilitychange', visibility);
  }
  schedule();
  return { dispose, check };
}
