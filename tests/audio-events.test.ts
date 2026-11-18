import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { GameSnapshot, PublicPlayer, SnapshotBase } from '../src/shared/contracts.js';
import { cueForTransition } from '../src/client/audio-events.js';

type Phase = GameSnapshot['phase'];
function scene(
  phase: Phase,
  index: number,
  version: number,
  options: { role?: 'host' | 'player'; matchId?: string; correct?: boolean } = {},
): GameSnapshot {
  const role = options.role ?? 'player';
  const base: SnapshotBase = {
    code: 'ABC123',
    matchId: options.matchId ?? 'match-1',
    version,
    role,
    selfId: role === 'player' ? 'p1' : null,
    index,
    total: 18,
    bingo: [],
    missions: [],
    rules: [],
    roundComplete: phase === 'break' ? index : null,
  };
  const player: PublicPlayer = {
    id: 'p1',
    name: 'Участница',
    score: options.correct ? 1 : 0,
    answered: phase === 'reveal',
    bingo: [],
  };
  if (phase === 'question') {
    return {
      ...base,
      phase,
      players: [player],
      question: { text: 'Вопрос', options: ['А', 'Б', 'В', 'Г'], period: 1 },
    };
  }
  if (phase === 'reveal') {
    return {
      ...base,
      phase,
      players: [{ ...player, answer: options.correct ? 0 : 1, correct: !!options.correct }],
      question: {
        text: 'Вопрос',
        options: ['А', 'Б', 'В', 'Г'],
        period: 1,
        correct: 0,
        explanation: 'Ответ',
      },
    };
  }
  return { ...base, phase, players: [player], question: null };
}

void test('Звуки живых переходов: старт периода, правильный ответ, перерыв и финал', () => {
  assert.equal(cueForTransition(scene('lobby', 0, 1), scene('question', 0, 2)), 'period-start');
  assert.equal(
    cueForTransition(scene('question', 0, 3), scene('reveal', 0, 4, { correct: true })),
    'puck-hit',
  );
  assert.equal(
    cueForTransition(scene('question', 0, 3), scene('reveal', 0, 4, { correct: false })),
    null,
  );
  assert.equal(cueForTransition(scene('reveal', 5, 10), scene('break', 6, 11)), 'period-end');
  assert.equal(cueForTransition(scene('break', 6, 11), scene('question', 6, 12)), 'period-start');
  assert.equal(cueForTransition(scene('reveal', 17, 50), scene('finished', 18, 51)), 'final-horn');
});

void test('Ведущий, первая загрузка, дубли, переподключения и новая партия не звучат', () => {
  const reveal = scene('reveal', 0, 4, { correct: true });
  assert.equal(cueForTransition(null, reveal), null);
  assert.equal(cueForTransition(reveal, reveal), null);
  assert.equal(cueForTransition(scene('question', 0, 5), scene('reveal', 0, 4)), null);
  assert.equal(
    cueForTransition(
      scene('question', 0, 3, { role: 'host' }),
      scene('reveal', 0, 4, { role: 'host', correct: true }),
    ),
    null,
  );
  assert.equal(
    cueForTransition(scene('reveal', 17, 10), scene('lobby', 0, 11, { matchId: 'match-2' })),
    null,
  );
  assert.equal(cueForTransition(scene('question', 1, 3), scene('question', 1, 4)), null);
});
