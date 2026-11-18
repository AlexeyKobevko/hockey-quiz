import type { GameSnapshot } from '../shared/contracts.js';

export type SoundCue = 'period-start' | 'puck-hit' | 'period-end' | 'final-horn';

/** A cue is generated only for a live transition within the same match. */
export function cueForTransition(
  previous: GameSnapshot | null,
  next: GameSnapshot,
): SoundCue | null {
  if (
    !previous ||
    previous.role !== 'player' ||
    next.role !== 'player' ||
    previous.code !== next.code ||
    previous.matchId !== next.matchId ||
    previous.version >= next.version
  )
    return null;

  if (previous.phase === 'reveal' && next.phase === 'finished' && next.index === next.total)
    return 'final-horn';

  if (
    previous.phase === 'reveal' &&
    next.phase === 'break' &&
    next.index === previous.index + 1
  )
    return 'period-end';

  if (
    next.phase === 'reveal' &&
    previous.phase === 'question' &&
    previous.index === next.index
  ) {
    const self = next.players.find((player) => player.id === next.selfId);
    return self?.correct ? 'puck-hit' : null;
  }

  if (
    next.phase === 'question' &&
    ((previous.phase === 'lobby' && next.index === 0) ||
      (previous.phase === 'break' && next.index === previous.index))
  )
    return 'period-start';

  return null;
}
