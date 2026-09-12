import { defineContentScript } from 'wxt/utils/define-content-script';
import { browser } from 'wxt/browser';
import { createMirrorEffect } from '../../src/content/mirror-effect';
import { PROTOCOL_VERSION, isContentRequest, type CandidateRef, type ContentResponse } from '../../src/shared/protocol';

const AGENT_KEY = '__antiMirrorAgentV1';
const APPLY_LEASE_MS = 5_000;

interface ActiveTarget extends CandidateRef {
  operationId: string;
  video: HTMLVideoElement;
  handle: { dispose(): void };
  lease?: ReturnType<typeof setTimeout>;
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

    const disposeActive = (operationId?: string) => {
      if (!active || (operationId && active.operationId !== operationId)) return;
      if (active.lease) clearTimeout(active.lease);
      active.handle.dispose();
      active = undefined;
    };

    const error = (requestId: string, code: 'STALE_OPERATION' | 'STALE_DOCUMENT' | 'STALE_TARGET' | 'TRANSFORM_CONFLICT'): ContentResponse =>
      ({ protocolVersion: PROTOCOL_VERSION, type: 'ERROR', requestId, code });

    const listener = async (message: unknown, sender: { id?: string }): Promise<ContentResponse | undefined> => {
      if (sender.id !== browser.runtime.id || !isContentRequest(message)) return undefined;
      if (message.type === 'PROBE') return { protocolVersion: PROTOCOL_VERSION, type: 'PROBED', requestId: message.requestId, documentNonce };
      if (message.type !== 'CANCEL_OPERATION' && message.documentNonce !== documentNonce) return error(message.requestId, 'STALE_DOCUMENT');
      if (message.type === 'DISCOVER') {
        targets.clear();
        const videos = [...document.querySelectorAll('video')].filter(isEligibleVideo).slice(0, 2);
        const candidates = videos.map(video => {
          const candidate = { targetId: crypto.randomUUID(), mediaToken: crypto.randomUUID() };
          targets.set(candidate.targetId, { video, mediaToken: candidate.mediaToken });
          return candidate;
        });
        return { protocolVersion: PROTOCOL_VERSION, type: 'CANDIDATES', requestId: message.requestId,
          operationId: message.operationId, documentNonce, candidates };
      }
      if (message.type === 'CANCEL_OPERATION') {
        disposeActive(message.operationId);
        targets.clear();
        return { protocolVersion: PROTOCOL_VERSION, type: 'CANCELLED', requestId: message.requestId,
          operationId: message.operationId, documentNonce };
      }
      if (message.type === 'PREPARE_APPLY') {
        if (active?.operationId === message.operationId && active.targetId === message.targetId) {
          return applied('APPLIED', message.requestId, active, documentNonce);
        }
        if (active) return error(message.requestId, 'STALE_OPERATION');
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
        return applied('APPLIED', message.requestId, active, documentNonce);
      }
      if (message.type === 'COMMIT') {
        if (!active || !matches(active, message)) return error(message.requestId, 'STALE_TARGET');
        if (active.lease) clearTimeout(active.lease);
        active.lease = undefined;
        return applied('COMMITTED', message.requestId, active, documentNonce);
      }
      if (!active || !matches(active, message)) return error(message.requestId, 'STALE_TARGET');
      const response = applied('DISABLED', message.requestId, active, documentNonce);
      disposeActive(message.operationId);
      targets.clear();
      return response;
    };

    const dispose = () => {
      disposeActive();
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

function isEligibleVideo(video: HTMLVideoElement): boolean {
  const style = getComputedStyle(video);
  const bounds = video.getBoundingClientRect();
  return video.isConnected && bounds.width >= 64 && bounds.height >= 36 &&
    style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0;
}

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
