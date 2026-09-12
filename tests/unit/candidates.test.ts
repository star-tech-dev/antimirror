import { expect, it } from 'vitest';
import { rankCandidates } from '../../src/content/candidates';

const candidate = (visibleArea: number, playing = false, fullscreen = false) => ({ visibleArea, playing, fullscreen });
it('prefers fullscreen, then area with a bounded playback bonus', () => {
  const main = candidate(1000);
  expect(rankCandidates([candidate(100), main])).toBe(main);
  const fullscreen = candidate(100, false, true);
  expect(rankCandidates([main, fullscreen])).toBe(fullscreen);
  const playing = candidate(1000, true);
  expect(rankCandidates([main, playing])).toBe(playing);
});
it('reports near ties regardless of DOM order and accepts the exact ratio threshold', () => {
  expect(rankCandidates([candidate(1000), candidate(1100)])).toBe('AMBIGUOUS_TARGET');
  expect(rankCandidates([candidate(1100), candidate(1000)])).toBe('AMBIGUOUS_TARGET');
  const winner = candidate(1150);
  expect(rankCandidates([candidate(1000), winner])).toBe(winner);
  expect(rankCandidates([])).toBeUndefined();
  expect(rankCandidates([candidate(NaN), candidate(0)])).toBeUndefined();
});
