import { browser } from 'wxt/browser';
import { composedParent, isVisibleElement } from './candidates';
import { watchTargetConnection } from './target-connection';
import type { BindingRequest, ContentResponse } from '../shared/protocol';

interface Binding {
  frame?: HTMLIFrameElement;
  result: Promise<{ visible: boolean; fullscreen: boolean } | undefined>;
  resolve(value?: { visible: boolean; fullscreen: boolean }): void;
  timer?: ReturnType<typeof setTimeout>;
  io?: IntersectionObserver;
  watch?: { dispose(): void };
}

/** This page channel can only bind an already-authorized operation to an embedding node. */
export class FrameBindings {
  private readonly bindings = new Map<string, Binding>();
  private frames: HTMLIFrameElement[] = [];
  constructor(readonly operationId: string, private readonly nonce: string) {}

  setFrames(frames: HTMLIFrameElement[]): void { this.frames = frames; }

  async handle(message: BindingRequest): Promise<ContentResponse> {
    const common = { protocolVersion: 1 as const, requestId: message.requestId,
      operationId: this.operationId, documentNonce: this.nonce, token: message.token };
    const error = (): ContentResponse => ({ ...common, type: 'ERROR', code: 'FRAMES_UNAVAILABLE' });
    if (message.operationId !== this.operationId) return error();
    if (message.type === 'BIND_CHILD') {
      if (this.bindings.size >= 64 || this.bindings.has(message.token)) return error();
      let resolve!: Binding['resolve'];
      const result = new Promise<{ visible: boolean; fullscreen: boolean } | undefined>(done => { resolve = done; });
      const binding: Binding = { result, resolve };
      binding.timer = setTimeout(() => this.drop(message.token), 900);
      this.bindings.set(message.token, binding);
      addEventListener('message', this.onMessage);
      return { ...common, type: 'BIND_READY' };
    }
    const binding = this.bindings.get(message.token);
    if (!binding) return error();
    if (message.type === 'READ_BIND') {
      const geometry = await binding.result;
      return geometry ? { ...common, type: 'BOUND', ...geometry } : error();
    }
    if (!binding.frame?.isConnected) return error();
    if (message.type === 'WATCH_CHILD') {
      if (!binding.watch) {
        clearTimeout(binding.timer);
        binding.watch = watchTargetConnection(binding.frame, () => {
          this.drop(message.token);
          void browser.runtime.sendMessage({ protocolVersion: 1, type: 'FRAME_LOST',
            operationId: this.operationId, documentNonce: this.nonce, token: message.token }).catch(() => undefined);
        });
        binding.timer = setTimeout(() => this.drop(message.token), 5000);
      }
      return { ...common, type: 'WATCHING' };
    }
    if (message.type === 'COMMIT_WATCH' && binding.watch) {
      clearTimeout(binding.timer); binding.timer = undefined;
      return { ...common, type: 'WATCH_COMMITTED' };
    }
    return error();
  }

  release(): void {
    this.frames = [];
    for (const [token, binding] of this.bindings) if (!binding.watch) this.drop(token);
    removeEventListener('message', this.onMessage);
  }

  dispose(): void {
    for (const token of this.bindings.keys()) this.drop(token);
    this.frames = [];
    removeEventListener('message', this.onMessage);
  }

  private drop(token: string): void {
    const binding = this.bindings.get(token);
    if (!binding) return;
    clearTimeout(binding.timer); binding.io?.disconnect(); binding.watch?.dispose();
    binding.resolve(); this.bindings.delete(token);
    if (![...this.bindings.values()].some(item => !item.frame)) removeEventListener('message', this.onMessage);
  }

  private onMessage = (event: MessageEvent): void => {
    const message = event.data;
    if (!message || message.namespace !== 'AntiMirror' || message.type !== 'FRAME_BIND' ||
        message.operationId !== this.operationId || typeof message.token !== 'string' || message.token.length > 128) return;
    const binding = this.bindings.get(message.token);
    if (!binding || binding.frame || !event.source) return;
    const frame = this.frames.find(frame => frame.isConnected && frame.contentWindow === event.source);
    if (!frame) return;
    binding.frame = frame;
    try {
      binding.io = new IntersectionObserver(entries => {
        const entry = entries[0]; if (!entry) return;
        binding.io?.disconnect(); binding.io = undefined; clearTimeout(binding.timer);
        binding.timer = setTimeout(() => this.drop(message.token), 5000);
        let fullscreen = false;
        for (let node: Node | null = frame; node; node = composedParent(node)) {
          if (node instanceof Element && (node.getRootNode() as Document | ShadowRoot).fullscreenElement === node) fullscreen = true;
        }
        binding.resolve({ visible: entry.isIntersecting && entry.intersectionRect.width > 0 &&
          entry.intersectionRect.height > 0 && isVisibleElement(frame), fullscreen });
        if (![...this.bindings.values()].some(item => !item.frame)) removeEventListener('message', this.onMessage);
      });
      binding.io.observe(frame);
    } catch { this.drop(message.token); }
  };
}
