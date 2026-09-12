/** S00 mechanism only. Conflict validation and target ownership belong to later slices. */
export function createMirrorEffect(video: HTMLVideoElement): { dispose(): void; healthy(): boolean } {
  const effect = new KeyframeEffect(video, [
    { offset: 0, transform: 'scaleX(-1)' },
    { offset: 1, transform: 'scaleX(-1)' },
  ], { duration: 1, fill: 'both', composite: 'add' });
  const animation = new Animation(effect, video.ownerDocument.timeline);
  animation.currentTime = 0;
  animation.pause();
  return { dispose: () => animation.cancel(), healthy: () => animation.playState === 'paused' &&
    animation.effect === effect && effect.target === video && animation.currentTime === 0 };
}
