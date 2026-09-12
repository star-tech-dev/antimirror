import { getAccessibleShadowRoot, hasNativeShadowAccess } from './shadow-access';
import { candidateScore, type CandidateScore } from './candidates';

export const DISCOVERY_LIMITS = { deadline: 3_000, slice: 4, elements: 25_000, roots: 256, candidates: 32 } as const;
export interface DiscoveredVideo extends CandidateScore { video: HTMLVideoElement }
export interface DiscoveryResult { complete: boolean; closedRoots: boolean; candidates: DiscoveredVideo[]; frames: HTMLIFrameElement[]; visits: number }

/** Every observer, DOM reference and scheduled task belongs to this single attempt. */
export class DiscoverySession {
  readonly controller = new AbortController();
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private readonly observers: MutationObserver[] = [];
  private readonly roots = new Set<Document | ShadowRoot>();
  private readonly videos = new Set<HTMLVideoElement>();
  private readonly frames = new Set<HTMLIFrameElement>();
  private readonly queue: { node: Node; walker?: TreeWalker }[] = [];
  private readonly additions: Iterator<Node>[] = [];
  private io?: IntersectionObserver;
  private readonly entries = new Map<HTMLVideoElement, IntersectionObserverEntry>();
  private resolve?: (result: DiscoveryResult) => void;
  private started = 0;
  private visits = 0;
  private pumping = false;
  private measuring = false;
  private changed = false;
  private closedRoots = false;

  constructor(private readonly durationMs = 3000, private readonly elementLimit = 25000) {}

  run(): Promise<DiscoveryResult> {
    return new Promise(resolve => {
      this.resolve = resolve;
      this.started = performance.now();
      if (this.controller.signal.aborted) { this.finish(false); return; }
      try {
        this.closedRoots = hasNativeShadowAccess();
        this.addRoot(document);
        this.schedule(() => this.finish(!this.queue.length && !this.additions.length && !this.measuring), this.durationMs);
        for (const delay of [500, 1_500]) this.schedule(() => {
          for (const root of this.roots) this.enqueue(root);
          this.pump();
        }, delay);
        this.pump();
      } catch { this.finish(false); }
    });
  }

  dispose(): void { this.finish(false); }

  private schedule(fn: () => void, delay: number): void {
    if (this.controller.signal.aborted) return;
    const timer = setTimeout(() => { this.timers.delete(timer); fn(); }, delay);
    this.timers.add(timer);
  }

  private enqueue(node: Node): void {
    if (!node.isConnected || this.controller.signal.aborted) return;
    if (this.queue.length >= DISCOVERY_LIMITS.elements) { this.finish(false); return; }
    this.queue.push({ node });
    this.changed = true;
  }

  private addRoot(root: Document | ShadowRoot): void {
    if (this.roots.has(root) || this.controller.signal.aborted) return;
    if (this.roots.size >= DISCOVERY_LIMITS.roots) { this.finish(false); return; }
    this.roots.add(root);
    const observer = new MutationObserver(records => {
      for (const record of records) {
        if (this.additions.length >= DISCOVERY_LIMITS.elements) { this.finish(false); return; }
        if (record.addedNodes.length) this.additions.push(record.addedNodes.values());
      }
      this.changed = true;
      this.pump();
    });
    this.observers.push(observer);
    observer.observe(root, { childList: true, subtree: true });
    this.enqueue(root);
  }

  private visit(element: Element): void {
    if (this.controller.signal.aborted) return;
    if (this.visits >= this.elementLimit || performance.now() - this.started >= this.durationMs) {
      this.finish(false); return;
    }
    this.visits++;
    if (!element.isConnected) return;
    // Late passes revisit hosts, but never count a slotted/light-DOM video twice.
    const shadow = getAccessibleShadowRoot(element);
    if (shadow) this.addRoot(shadow);
    if (element instanceof HTMLIFrameElement) {
      if (!this.frames.has(element) && this.frames.size >= 64) { this.finish(false); return; }
      this.frames.add(element);
    }
    if (element instanceof HTMLVideoElement && !this.videos.has(element)) {
      if (this.videos.size >= DISCOVERY_LIMITS.candidates) { this.finish(false); return; }
      this.videos.add(element);
    }
  }

  private pump(): void {
    if (this.pumping || this.measuring || this.controller.signal.aborted) return;
    this.pumping = true;
    const tick = () => {
      if (this.controller.signal.aborted) return;
      try {
        const start = performance.now();
        while ((this.queue.length || this.additions.length) && performance.now() - start < DISCOVERY_LIMITS.slice) {
          this.checkDeadline();
          if (this.additions.length) {
            const next = this.additions[0]!.next();
            if (next.done) this.additions.shift(); else this.enqueue(next.value);
          } else {
            const job = this.queue[0]!;
            if (!job.node.isConnected) this.queue.shift();
            else if (!job.walker) {
              job.walker = document.createTreeWalker(job.node, NodeFilter.SHOW_ELEMENT);
              if (job.node instanceof Element) this.visit(job.node);
            } else {
              const next = job.walker.nextNode();
              if (next) this.visit(next as Element); else this.queue.shift();
            }
          }
          if (this.controller.signal.aborted) return;
        }
        if (this.queue.length || this.additions.length) this.schedule(tick, 0);
        else { this.pumping = false; this.measure(); }
      } catch { this.finish(false); }
    };
    tick();
  }

  private measure(): void {
    for (const video of this.videos) if (!video.isConnected) this.videos.delete(video);
    if (!this.videos.size) { if (this.frames.size) this.finish(true); return; }
    this.measuring = true;
    this.changed = false;
    this.entries.clear();
    this.io = new IntersectionObserver(entries => {
      try {
        for (const entry of entries) this.entries.set(entry.target as HTMLVideoElement, entry);
        if (this.entries.size < this.videos.size) return;
        this.io?.disconnect(); this.io = undefined;
        this.score();
      } catch { this.finish(false); }
    });
    for (const video of this.videos) this.io.observe(video);
  }

  private checkDeadline = (): void => {
    if (performance.now() - this.started >= this.durationMs) throw new Error('Discovery deadline');
  };

  private score(): void {
    const remaining = this.videos.values();
    const candidates: DiscoveredVideo[] = [];
    const tick = () => {
      if (this.controller.signal.aborted) return;
      try {
        const start = performance.now();
        while (performance.now() - start < DISCOVERY_LIMITS.slice) {
          this.checkDeadline();
          const next = remaining.next();
          if (next.done) {
            this.measuring = false;
            if (this.changed) this.pump();
            else if (candidates.length) this.finish(true, candidates);
            return;
          }
          const video = next.value;
          const entry = this.entries.get(video);
          const score = entry && candidateScore(video, entry, this.checkDeadline);
          if (score) candidates.push({ video, ...score });
        }
        this.schedule(tick, 0);
      } catch { this.finish(false); }
    };
    tick();
  }

  private finish(complete: boolean, candidates: DiscoveredVideo[] = []): void {
    if (!this.resolve) { this.controller.abort(); return; }
    const resolve = this.resolve;
    this.resolve = undefined;
    this.controller.abort();
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    for (const observer of this.observers) observer.disconnect();
    this.observers.length = 0;
    this.io?.disconnect(); this.io = undefined;
    const frames = complete ? [...this.frames].filter(frame => frame.isConnected) : [];
    this.queue.length = 0; this.additions.length = 0; this.roots.clear(); this.videos.clear(); this.entries.clear(); this.frames.clear();
    resolve({ complete, closedRoots: this.closedRoots, candidates, frames, visits: this.visits });
  }
}
