import { defineContentScript } from 'wxt/utils/define-content-script';
import { browser } from 'wxt/browser';
import { createMirrorEffect } from '../../src/content/mirror-effect';
import { DiscoverySession } from '../../src/content/discovery';
import { isEligibleVideo } from '../../src/content/candidates';
import { watchTargetConnection } from '../../src/content/target-connection';
import { FrameBindings } from '../../src/content/frame-bindings';
import { PROTOCOL_VERSION, isContentRequest, type CandidateRef, type ContentResponse } from '../../src/shared/protocol';

const AGENT_KEY = '__antiMirrorAgentV1';
const APPLY_LEASE_MS = 5_000;

interface ActiveTarget extends CandidateRef {
  operationId: string;
  video: HTMLVideoElement;
  handle: { dispose(): void };
  lease?: ReturnType<typeof setTimeout>;
  connection?: { dispose(): void };
}

interface AgentGlobal { dispose(): void }

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  allFrames: true, matchAboutBlank: true, matchOriginAsFallback: true,
  runAt: 'document_start',
  main(ctx) {
    const root = globalThis as typeof globalThis & { [AGENT_KEY]?: AgentGlobal };
    if (root[AGENT_KEY]) return;
    const documentNonce = crypto.randomUUID();
    const targets = new Map<string, { video: HTMLVideoElement; mediaToken: string }>();
    let active: ActiveTarget | undefined;
    let discovery: { operationId: string; session: DiscoverySession } | undefined;
    let candidateOperation: string | undefined;
    let bindings: FrameBindings | undefined;
    const cancelled = new Set<string>();

    const disposeActive = (operationId?: string) => {
      if (!active || (operationId && active.operationId !== operationId)) return;
      if (active.lease) clearTimeout(active.lease);
      active.connection?.dispose();
      active.handle.dispose();
      active = undefined;
    };

    const error = (requestId: string, code: 'STALE_OPERATION' | 'STALE_DOCUMENT' | 'STALE_TARGET' | 'TRANSFORM_CONFLICT'): ContentResponse =>
      ({ protocolVersion: PROTOCOL_VERSION, type: 'ERROR', requestId, code });

    const listener = async (message: unknown, sender: { id?: string }): Promise<ContentResponse | undefined> => {
      if (sender.id !== browser.runtime.id || !isContentRequest(message)) return undefined;
      if (message.type === 'PROBE') return { protocolVersion: PROTOCOL_VERSION, type: 'PROBED', requestId: message.requestId, documentNonce };
      if (message.type !== 'CANCEL_OPERATION' && message.documentNonce !== documentNonce) return error(message.requestId, 'STALE_DOCUMENT');
      if (message.type === 'EMIT_BIND') {
        if (cancelled.has(message.operationId) || bindings?.operationId !== message.operationId) return error(message.requestId, 'STALE_OPERATION');
        parent.postMessage({ namespace: 'AntiMirror', type: 'FRAME_BIND', operationId: message.operationId, token: message.token }, '*');
        return { protocolVersion: 1, type: 'BIND_SENT', requestId: message.requestId,
          operationId: message.operationId, documentNonce, token: message.token };
      }
      if (message.type === 'BIND_CHILD' || message.type === 'READ_BIND' || message.type === 'WATCH_CHILD' || message.type === 'COMMIT_WATCH') {
        return bindings ? bindings.handle(message) : error(message.requestId, 'STALE_OPERATION');
      }
      if (message.type === 'RELEASE_DISCOVERY') {
        if (candidateOperation === message.operationId) { targets.clear(); candidateOperation = undefined; }
        if (bindings?.operationId === message.operationId) bindings.release();
        return { protocolVersion: 1, type: 'RELEASED', requestId: message.requestId, operationId: message.operationId, documentNonce };
      }
      if (message.type === 'DISCOVER') {
        if (active || cancelled.has(message.operationId)) return error(message.requestId, 'STALE_OPERATION');
        discovery?.session.dispose();
        bindings?.dispose(); bindings = new FrameBindings(message.operationId, documentNonce);
        targets.clear();
        candidateOperation = message.operationId;
        const session = new DiscoverySession(message.durationMs, message.elementLimit);
        discovery = { operationId: message.operationId, session };
        const result = await session.run();
        if (discovery?.session !== session || candidateOperation !== message.operationId) return error(message.requestId, 'STALE_OPERATION');
        discovery = undefined;
        bindings.setFrames(result.frames);
        const candidates = result.candidates.map(({ video, ...score }) => {
          const candidate = { targetId: crypto.randomUUID(), mediaToken: crypto.randomUUID(), ...score };
          targets.set(candidate.targetId, { video, mediaToken: candidate.mediaToken });
          return candidate;
        });
        return { protocolVersion: PROTOCOL_VERSION, type: 'CANDIDATES', requestId: message.requestId,
          operationId: message.operationId, documentNonce, complete: result.complete, closedRoots: result.closedRoots,
          visits: result.visits, frameCount: result.frames.length, candidates };
      }
      if (message.type === 'CANCEL_OPERATION') {
        cancelled.add(message.operationId);
        if (cancelled.size > 64) cancelled.delete(cancelled.values().next().value!);
        if (bindings?.operationId === message.operationId) { bindings.dispose(); bindings = undefined; }
        disposeActive(message.operationId);
        if (discovery?.operationId === message.operationId) {
          discovery.session.dispose(); discovery = undefined;
        }
        if (candidateOperation === message.operationId) { targets.clear(); candidateOperation = undefined; }
        return { protocolVersion: PROTOCOL_VERSION, type: 'CANCELLED', requestId: message.requestId,
          operationId: message.operationId, documentNonce };
      }
      if (message.type === 'PREPARE_APPLY') {
        if (active?.operationId === message.operationId && active.targetId === message.targetId) {
          return applied('APPLIED', message.requestId, active, documentNonce);
        }
        if (active || candidateOperation !== message.operationId) return error(message.requestId, 'STALE_OPERATION');
        const target = targets.get(message.targetId);
        if (!target || target.mediaToken !== message.mediaToken || !isEligibleVideo(target.video)) {
          targets.clear();
          return error(message.requestId, 'STALE_TARGET');
        }
        targets.clear();
        const before = getComputedStyle(target.video).transform;
        const handle = createMirrorEffect(target.video);
        if (!hasExpectedFlip(before, getComputedStyle(target.video).transform)) {
          handle.dispose();
          return error(message.requestId, 'TRANSFORM_CONFLICT');
        }
        active = { operationId: message.operationId, targetId: message.targetId,
          mediaToken: message.mediaToken, video: target.video, handle };
        active.lease = setTimeout(() => disposeActive(message.operationId), APPLY_LEASE_MS);
        active.connection = watchTargetConnection(target.video, () => {
          disposeActive(message.operationId);
          void browser.runtime.sendMessage({ protocolVersion: PROTOCOL_VERSION, type: 'TARGET_LOST',
            operationId: message.operationId, frameId: message.frameId, documentNonce,
            targetId: message.targetId, mediaToken: message.mediaToken }).catch(() => undefined);
        });
        return applied('APPLIED', message.requestId, active, documentNonce);
      }
      if (message.type === 'COMMIT') {
        if (!active || !matches(active, message)) return error(message.requestId, 'STALE_TARGET');
        if (active.lease) clearTimeout(active.lease);
        active.lease = undefined;
        return applied('COMMITTED', message.requestId, active, documentNonce);
      }
      if (message.type !== 'DISABLE' || !active || !matches(active, message)) return error(message.requestId, 'STALE_TARGET');
      const response = applied('DISABLED', message.requestId, active, documentNonce);
      disposeActive(message.operationId);
      targets.clear();
      return response;
    };

    const dispose = () => {
      disposeActive();
      discovery?.session.dispose(); discovery = undefined;
      bindings?.dispose(); bindings = undefined;
      candidateOperation = undefined;
      targets.clear();
      browser.runtime.onMessage.removeListener(listener);
      delete root[AGENT_KEY];
    };
    root[AGENT_KEY] = { dispose };
    browser.runtime.onMessage.addListener(listener);
    addEventListener('pagehide', dispose, { once: true });
    ctx.onInvalidated(dispose);
  },
});

function hasExpectedFlip(before: string, after: string): boolean {
  try {
    const expected = new DOMMatrix(before === 'none' ? undefined : before).scale(-1, 1);
    const actual = new DOMMatrix(after);
    return Array.from(actual.toFloat64Array()).every((value, index) =>
      Math.abs(value - expected.toFloat64Array()[index]!) < 0.00001);
  } catch { return false; }
}

function matches(active: ActiveTarget, message: { operationId: string; targetId: string; mediaToken: string }): boolean {
  return active.operationId === message.operationId && active.targetId === message.targetId && active.mediaToken === message.mediaToken;
}

function applied(type: 'APPLIED' | 'COMMITTED' | 'DISABLED', requestId: string, active: ActiveTarget, documentNonce: string): ContentResponse {
  return { protocolVersion: PROTOCOL_VERSION, type, requestId, operationId: active.operationId,
    documentNonce, targetId: active.targetId, mediaToken: active.mediaToken };
}
