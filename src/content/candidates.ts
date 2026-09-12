export interface CandidateScore {
  visibleArea: number;
  playing: boolean;
  fullscreen: boolean;
}

export function rankCandidates<T extends CandidateScore>(candidates: readonly T[]): T | 'AMBIGUOUS_TARGET' | undefined {
  const sorted = candidates.filter(c => Number.isFinite(c.visibleArea) && c.visibleArea > 0)
    .slice().sort((a, b) => Number(b.fullscreen) - Number(a.fullscreen) || score(b) - score(a));
  const [first, second] = sorted;
  if (first && second && first.fullscreen === second.fullscreen && score(first) / score(second) < 1.15) {
    return 'AMBIGUOUS_TARGET';
  }
  return first;
}

function score(candidate: CandidateScore): number {
  return candidate.visibleArea * (candidate.playing ? 1.25 : 1);
}

export function composedParent(node: Node): Node | null {
  if (node instanceof Element && node.assignedSlot) return node.assignedSlot;
  return node.parentNode ?? (node instanceof ShadowRoot ? node.host : null);
}

export function isEligibleVideo(video: HTMLVideoElement, checkBudget: () => void = () => undefined): boolean {
  if (!video.isConnected || video.error) return false;
  const bounds = video.getBoundingClientRect();
  if (bounds.width < 64 || bounds.height < 36 || bounds.right <= 0 || bounds.bottom <= 0 ||
      bounds.left >= innerWidth || bounds.top >= innerHeight) return false;
  for (let node: Node | null = video; node; node = composedParent(node)) {
    checkBudget();
    if (!(node instanceof Element)) continue;
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' ||
        Number(style.opacity) === 0 || style.contentVisibility === 'hidden') return false;
  }
  return true;
}

export function candidateScore(video: HTMLVideoElement, entry: IntersectionObserverEntry, checkBudget?: () => void): CandidateScore | undefined {
  if (!entry.isIntersecting || !isEligibleVideo(video, checkBudget)) return undefined;
  const visibleArea = entry.intersectionRect.width * entry.intersectionRect.height;
  if (visibleArea <= 0) return undefined;
  let fullscreen = false;
  for (let node: Node | null = video; node; node = composedParent(node)) {
    checkBudget?.();
    if (node instanceof Element) {
      const root = node.getRootNode() as Document | ShadowRoot;
      if (root.fullscreenElement === node) fullscreen = true;
    }
  }
  return { visibleArea, playing: !video.paused && !video.ended && video.readyState >= 2, fullscreen };
}
