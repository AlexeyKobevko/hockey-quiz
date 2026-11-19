import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PublicPlayer } from '../src/shared/contracts.js';
import { quizPrizeFor, bingoPrizeFor } from '../src/client/prizes.js';

const players: PublicPlayer[] = [
  { id: 'a', name: 'Первая', score: 12, answered: false, bingo: [0, 1, 2] },
  { id: 'b', name: 'Вторая', score: 9, answered: false, bingo: [1] },
];

void test('Призы квиза: победительница и проигравшая получают разные задания', () => {
  const winner = quizPrizeFor(players, 'a');
  const loser = quizPrizeFor(players, 'b');
  assert.equal(winner?.kind, 'winner');
  assert.match(winner?.description ?? '', /угощение|напиток/);
  assert.equal(loser?.kind, 'runner-up');
  assert.match(loser?.description ?? '', /Красно-синий — самый сильный!/);
});

void test('Ничья в квизе: обе участницы получают угощение и общую кричалку', () => {
  const tied = players.map((p) => ({ ...p, score: 12 }));
  const a = quizPrizeFor(tied, 'a');
  const b = quizPrizeFor(tied, 'b');
  assert.equal(a?.kind, 'tie');
  assert.deepEqual(a, b);
  assert.match(a?.description ?? '', /обеим/);
  assert.match(a?.description ?? '', /хором/);
});

void test('Секретный приз бинго достаётся победительнице, при ничьей — обеим', () => {
  const winner = bingoPrizeFor(players, 'a');
  const loser = bingoPrizeFor(players, 'b');
  assert.equal(winner?.kind, 'winner');
  assert.match(winner?.title ?? '', /СЕКРЕТНЫЙ ПРИЗ РАЗБЛОКИРОВАН/);
  assert.equal(loser?.kind, 'runner-up');
  assert.doesNotMatch(loser?.description ?? '', /присуждается главный трофей/);
  const tied = players.map((p) => ({ ...p, bingo: [0, 1] }));
  assert.equal(bingoPrizeFor(tied, 'a')?.kind, 'tie');
  assert.equal(bingoPrizeFor(tied, 'b')?.kind, 'tie');
  assert.match(bingoPrizeFor(tied, 'a')?.title ?? '', /ДВА СЕКРЕТНЫХ ПРИЗА/);
});

void test('Игроку с чужим ID не показывается персональный приз', () => {
  assert.equal(quizPrizeFor(players, 'unknown'), null);
  assert.equal(bingoPrizeFor(players, 'unknown'), null);
  assert.equal(quizPrizeFor(players.slice(0, 1), 'a'), null);
});
