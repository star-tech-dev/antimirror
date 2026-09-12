import { composedParent } from './candidates';

/** Observe only the selected node's ancestor chain, never whole subtrees. */
export function watchTargetConnection(video: HTMLVideoElement, lost: () => void): { dispose(): void } {
  let disposed = false;
  const observer = new MutationObserver(() => {
    if (disposed) return;
    if (!video.isConnected) { dispose(); lost(); }
    else observe(); // Synchronous reparent preserves the same target.
  });
  const observe = () => {
    observer.disconnect();
    for (let node = composedParent(video); node; node = composedParent(node)) {
      observer.observe(node, { childList: true });
    }
  };
  const dispose = () => { disposed = true; observer.disconnect(); };
  try { observe(); } catch (error) { dispose(); throw error; }
  return { dispose };
}
