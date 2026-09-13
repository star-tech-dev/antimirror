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

export type TargetSessionLoss = 'MEDIA_CHANGED' | 'PLAYBACK_ENDED' | 'EFFECT_LOST' | undefined;

/** Local ownership checks. No discovery and no communication while the target is healthy. */
export function watchTargetSession(video: HTMLVideoElement, healthy: () => boolean,
  lost: (reason: TargetSessionLoss) => void): { dispose(): void; check(): boolean } {
  const source = video.currentSrc;
  const attribute = video.getAttribute('src');
  const stream = video.srcObject;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const mediaReset = () => invalidate('MEDIA_CHANGED');
  const playbackEnded = () => invalidate('PLAYBACK_ENDED');
  const invalidate = (reason: TargetSessionLoss) => { if (!disposed) { dispose(); lost(reason); } };
  const check = () => {
    if (disposed) return false;
    if (!video.isConnected) invalidate(undefined);
    else if (video.error || video.ended) invalidate('PLAYBACK_ENDED');
    else if (video.currentSrc !== source || video.getAttribute('src') !== attribute || video.srcObject !== stream) invalidate('MEDIA_CHANGED');
    else if (!healthy()) invalidate('EFFECT_LOST');
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
      [...record.addedNodes, ...record.removedNodes].some(node => node instanceof HTMLSourceElement))) invalidate('MEDIA_CHANGED');
  });
  // Only this video's source attributes/children, never the document subtree.
  observer.observe(video, { attributes: true, attributeFilter: ['src', 'type', 'media'], childList: true, subtree: true });
  for (const event of ['emptied', 'loadstart']) video.addEventListener(event, mediaReset);
  for (const event of ['error', 'ended']) video.addEventListener(event, playbackEnded);
  video.ownerDocument.addEventListener('visibilitychange', visibility);
  function dispose() {
    if (disposed) return;
    disposed = true; clearTimeout(timer); observer.disconnect();
    for (const event of ['emptied', 'loadstart']) video.removeEventListener(event, mediaReset);
    for (const event of ['error', 'ended']) video.removeEventListener(event, playbackEnded);
    video.ownerDocument.removeEventListener('visibilitychange', visibility);
  }
  schedule();
  return { dispose, check };
}
