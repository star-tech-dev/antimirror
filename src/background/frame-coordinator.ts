import { browser } from 'wxt/browser';
import { rankCandidates } from '../content/candidates';
import type { CandidateSnapshot, ContentRequest, ContentResponse, FrameBindingRef, OffReason, TargetRef } from '../shared/protocol';

export type FrameSend = (frameId: number, message: ContentRequest, timeout?: number) => Promise<ContentResponse | undefined>;
interface Frame { frameId: number; parentFrameId: number; documentId?: string }
interface Found extends Frame { nonce: string; candidates: CandidateSnapshot[]; closedRoots: boolean; visits: number; frameCount: number }
export interface FrameSelection { target: TargetRef; ancestors: FrameBindingRef[]; warning?: 'OPEN_ROOTS_ONLY' | 'FRAMES_UNAVAILABLE' }

export async function bounded<T>(task: Promise<T>, ms: number, signal?: AbortSignal): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: () => void = () => undefined;
  try {
    return await Promise.race([task, new Promise<undefined>(resolve => {
      abort = () => resolve(undefined);
      if (signal?.aborted) { abort(); return; }
      signal?.addEventListener('abort', abort, { once: true });
      timer = setTimeout(abort, Math.max(1, ms));
    })]);
  } catch { return undefined; }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}

export class FrameCoordinator {
  readonly abort = new AbortController();
  readonly documents = new Map<number, Found>();
  private readonly touched = new Set<number>();
  private readonly start = Date.now();
  private used = 0;
  private reserved = 0;
  private restricted = false;
  private readonly unavailable = new Set<number>();
  private incomplete = false;
  constructor(private readonly tabId: number, readonly operationId: string, private readonly send: FrameSend) {}

  knows(frameId: number): boolean { return this.touched.has(frameId); }

  async collect(): Promise<FrameSelection | OffReason> {
    let frames: Frame[] = [];
    for (let round = 0; round < 3 && !this.abort.signal.aborted; round++) {
      const raw = await bounded(browser.webNavigation.getAllFrames({ tabId: this.tabId }), this.remaining(), this.abort.signal);
      if (!raw || raw.length > 64) return 'INCOMPLETE_COVERAGE';
      frames = raw.map(({ frameId, parentFrameId, documentId }) => ({ frameId, parentFrameId, documentId }));
      if (!frames.some(frame => frame.frameId === 0)) return 'FRAMES_UNAVAILABLE';
      const duration = round === 0 ? 480 : round === 1 ? 980 : this.remaining() - 30;
      let cursor = 0;
      await Promise.all(Array.from({ length: Math.min(4, frames.length) }, async () => {
        while (cursor < frames.length && !this.abort.signal.aborted && !this.incomplete) {
          const frame = frames[cursor++]!;
          const previous = this.documents.get(frame.frameId);
          if (previous?.candidates.length) continue;
          await this.scan(frame, Math.max(1, Math.min(duration, this.remaining() - 30)));
        }
      }));
      if (this.abort.signal.aborted) return 'NAVIGATION';
      if (this.incomplete) return 'INCOMPLETE_COVERAGE';
      const latest = await bounded(browser.webNavigation.getAllFrames({ tabId: this.tabId }), this.remaining(), this.abort.signal);
      if (!latest || latest.length > 64) return 'INCOMPLETE_COVERAGE';
      const added = latest.filter(frame => !this.touched.has(frame.frameId));
      if (added.length) {
        // New documents join only this bounded attempt, never an already-active target.
        let next = 0;
        await Promise.all(Array.from({ length: Math.min(4, added.length) }, async () => {
          while (next < added.length && !this.incomplete) await this.scan(added[next++]!, Math.max(1, this.remaining() - 30));
        }));
        frames = latest.map(({ frameId, parentFrameId, documentId }) => ({ frameId, parentFrameId, documentId }));
      }
      if (this.incomplete) return 'INCOMPLETE_COVERAGE';
      this.restricted = [...this.unavailable].some(id => latest.some(frame => frame.frameId === id));
      for (const doc of this.documents.values()) {
        if (doc.frameCount > latest.filter(frame => frame.parentFrameId === doc.frameId).length) this.restricted = true;
      }
      if ([...this.documents.values()].some(doc => doc.candidates.length)) return this.select(frames);
      if (round < 2) {
        const until = this.start + (round === 0 ? 500 : 1500) - Date.now();
        if (until > 0) await bounded(new Promise<never>(() => undefined), until, this.abort.signal);
      }
    }
    return this.restricted ? 'FRAMES_UNAVAILABLE' : [...this.documents.values()].some(doc => !doc.closedRoots)
      ? 'INCOMPLETE_COVERAGE' : 'NO_VIDEO';
  }

  async cancel(): Promise<void> {
    this.abort.abort();
    await Promise.all([...this.touched].map(frameId => this.send(frameId,
      { protocolVersion: 1, type: 'CANCEL_OPERATION', requestId: crypto.randomUUID(), operationId: this.operationId }, 500)));
  }

  async release(): Promise<void> {
    await Promise.all([...this.documents.values()].map(doc => this.send(doc.frameId,
      { protocolVersion: 1, type: 'RELEASE_DISCOVERY', requestId: crypto.randomUUID(), operationId: this.operationId, documentNonce: doc.nonce }, 500)));
  }

  async watch(ancestors: FrameBindingRef[], commit = false): Promise<boolean> {
    const deadline = Date.now() + 1000;
    for (const ancestor of ancestors) {
      if (this.abort.signal.aborted || Date.now() >= deadline) return false;
      const reply = await this.send(ancestor.parentFrameId, { protocolVersion: 1,
        type: commit ? 'COMMIT_WATCH' : 'WATCH_CHILD', requestId: crypto.randomUUID(),
        operationId: this.operationId, documentNonce: ancestor.parentNonce, token: ancestor.token }, Math.max(1, deadline - Date.now()));
      if (reply?.type !== (commit ? 'WATCH_COMMITTED' : 'WATCHING') ||
          reply.operationId !== this.operationId || reply.documentNonce !== ancestor.parentNonce || reply.token !== ancestor.token) return false;
    }
    return true;
  }

  private remaining(): number { return Math.max(1, 3000 - (Date.now() - this.start)); }

  private async scan(frame: Frame, durationMs: number): Promise<void> {
    if (this.abort.signal.aborted || this.remaining() < 20 || this.touched.size >= 64 && !this.touched.has(frame.frameId)) {
      this.incomplete = true; return;
    }
    this.touched.add(frame.frameId);
    let probe = await this.send(frame.frameId, { protocolVersion: 1, type: 'PROBE', requestId: crypto.randomUUID() }, Math.min(250, this.remaining()));
    if (!probe && !this.abort.signal.aborted) {
      await bounded(browser.scripting.executeScript({ target: { tabId: this.tabId, frameIds: [frame.frameId] },
        files: ['/content-scripts/content.js'] }), Math.min(250, this.remaining()), this.abort.signal);
      probe = await this.send(frame.frameId, { protocolVersion: 1, type: 'PROBE', requestId: crypto.randomUUID() }, Math.min(250, this.remaining()));
    }
    if (this.abort.signal.aborted) return;
    if (probe?.type !== 'PROBED') { this.unavailable.add(frame.frameId); return; }
    this.unavailable.delete(frame.frameId);
    const previous = this.documents.get(frame.frameId);
    if (previous && previous.nonce !== probe.documentNonce) { this.incomplete = true; return; }
    const allowance = Math.min(25000 - (previous?.visits ?? 0), 100000 - this.used - this.reserved);
    if (allowance <= 0) { this.incomplete = true; return; }
    this.reserved += allowance;
    const result = await this.send(frame.frameId, { protocolVersion: 1, type: 'DISCOVER',
      requestId: crypto.randomUUID(), operationId: this.operationId, documentNonce: probe.documentNonce,
      durationMs: Math.max(1, Math.min(durationMs, this.remaining() - 10)), elementLimit: allowance }, this.remaining() + 50);
    this.reserved -= allowance;
    if (this.abort.signal.aborted) {
      await this.send(frame.frameId, { protocolVersion: 1, type: 'CANCEL_OPERATION', requestId: crypto.randomUUID(), operationId: this.operationId }, 500);
      return;
    }
    if (result?.type !== 'CANDIDATES' || result.operationId !== this.operationId || result.documentNonce !== probe.documentNonce ||
        !result.complete || result.visits > allowance) { this.incomplete = true; return; }
    this.used += result.visits;
    this.documents.set(frame.frameId, { frameId: frame.frameId, parentFrameId: frame.parentFrameId,
      documentId: frame.documentId, nonce: probe.documentNonce, candidates: result.candidates,
      closedRoots: result.closedRoots, visits: (previous?.visits ?? 0) + result.visits, frameCount: result.frameCount });
  }

  private async select(frames: Frame[]): Promise<FrameSelection | OffReason> {
    const bindings = new Map<number, FrameBindingRef & { visible: boolean; fullscreen: boolean }>();
    // Bind candidate ancestors only; unrelated inaccessible ads cannot invalidate a verified target.
    for (const doc of this.documents.values()) {
      if (!doc.candidates.length) continue;
      let child = doc;
      const visited = new Set<number>();
      while (child.frameId !== 0) {
        if (this.abort.signal.aborted || this.remaining() < 20) return 'INCOMPLETE_COVERAGE';
        if (visited.has(child.frameId)) return 'INCOMPLETE_COVERAGE';
        visited.add(child.frameId);
        if (bindings.has(child.frameId)) break;
        const parent = this.documents.get(child.parentFrameId);
        if (!parent) { this.restricted = true; break; }
        const token = crypto.randomUUID();
        const common = { protocolVersion: 1 as const, operationId: this.operationId, token };
        const ready = await this.send(parent.frameId, { ...common, type: 'BIND_CHILD', requestId: crypto.randomUUID(),
          documentNonce: parent.nonce, childFrameId: child.frameId, childNonce: child.nonce }, Math.min(900, this.remaining()));
        if (ready?.type !== 'BIND_READY' || ready.token !== token || ready.documentNonce !== parent.nonce || ready.operationId !== this.operationId) return 'FRAMES_UNAVAILABLE';
        await this.send(child.frameId, { ...common, type: 'EMIT_BIND', requestId: crypto.randomUUID(), documentNonce: child.nonce }, Math.min(900, this.remaining()));
        const bound = await this.send(parent.frameId, { ...common, type: 'READ_BIND', requestId: crypto.randomUUID(), documentNonce: parent.nonce }, Math.min(1000, this.remaining()));
        if (bound?.type !== 'BOUND' || bound.token !== token || bound.documentNonce !== parent.nonce || bound.operationId !== this.operationId) return 'FRAMES_UNAVAILABLE';
        bindings.set(child.frameId, { parentFrameId: parent.frameId, parentNonce: parent.nonce,
          childFrameId: child.frameId, childNonce: child.nonce, token, visible: bound.visible, fullscreen: bound.fullscreen });
        child = parent;
      }
    }
    const candidates = [...this.documents.values()].flatMap(doc => {
      const ancestors: FrameBindingRef[] = [];
      let frameId = doc.frameId, fullscreen = false;
      for (let depth = 0; frameId !== 0 && depth < 64; depth++) {
        const bound = bindings.get(frameId);
        if (!bound || !bound.visible) return [];
        ancestors.push(bound); fullscreen ||= bound.fullscreen; frameId = bound.parentFrameId;
      }
      return doc.candidates.map(candidate => ({ ...candidate, fullscreen: candidate.fullscreen || fullscreen, doc, ancestors }));
    });
    const selected = rankCandidates(candidates);
    if (!selected || selected === 'AMBIGUOUS_TARGET') return selected ?? (this.restricted ? 'FRAMES_UNAVAILABLE' : 'NO_VIDEO');
    const latest = await bounded(browser.webNavigation.getAllFrames({ tabId: this.tabId }), Math.min(500, this.remaining()), this.abort.signal);
    if (Date.now() - this.start >= 3000) return 'INCOMPLETE_COVERAGE';
    if (!latest || latest.length !== frames.length || frames.some(frame => {
      const current = latest.find(item => item.frameId === frame.frameId);
      return !current || (frame.documentId && frame.documentId !== current.documentId);
    })) return 'NAVIGATION';
    return { target: { frameId: selected.doc.frameId, documentNonce: selected.doc.nonce,
      documentId: selected.doc.documentId, targetId: selected.targetId, mediaToken: selected.mediaToken }, ancestors: selected.ancestors,
      warning: this.restricted ? 'FRAMES_UNAVAILABLE' : [...this.documents.values()].some(doc => !doc.closedRoots) ? 'OPEN_ROOTS_ONLY' : undefined };
  }
}
