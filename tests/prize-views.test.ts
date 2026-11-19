import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { GameSnapshot, PublicPlayer, Role } from '../src/shared/contracts.js';
import { missions, rules } from '../src/shared/content.js';
import { renderView } from '../src/client/views.js';
import type { Tab } from '../src/client/views.js';

function output(
  role: Role,
  tab: Tab,
  scores: [number, number],
  bingo: [number[], number[]],
  bingoClosed = false,
  selfId = 'a',
) {
  const players: PublicPlayer[] = [
    { id: 'a', name: 'Первая', score: scores[0], bingo: bingo[0], answered: false },
    { id: 'b', name: 'Вторая', score: scores[1], bingo: bingo[1], answered: false },
  ];
  const state: GameSnapshot = {
    code: 'ABC234',
    matchId: 'match1',
    version: 42,
    role,
    selfId: role === 'host' ? null : selfId,
    phase: 'finished',
    index: 18,
    total: 18,
    players,
    question: null,
    bingo: role === 'host' ? [] : (players.find((p) => p.id === selfId)?.bingo ?? []),
    missions,
    rules,
    bingoClosed,
    roundComplete: null,
  };
  return renderView({
    auth: { role, code: state.code, token: 'private' },
    state,
    tab,
    err: '',
    choice: null,
    scoreGains: new Set(),
  });
}

void test('Экран квиза: персональные награды и панель ведущего', () => {
  const winner = output('player', 'game', [12, 9], [[], []]);
  const loser = output('player', 'game', [12, 9], [[], []], false, 'b');
  const host = output('host', 'game', [12, 9], [[], []]);
  assert.match(winner, /Ты победила в квизе!/);
  assert.doesNotMatch(winner, /Твоя хоккейная миссия/);
  assert.match(loser, /Твоя хоккейная миссия/);
  assert.doesNotMatch(loser, /Ты победила в квизе!/);
  assert.match(host, /Награды участниц/);
  assert.match(host, /Первая/);
  assert.match(host, /Вторая/);
});

void test('Экран квиза: при ничьей обе получают одинаковый приз', () => {
  for (const id of ['a', 'b']) {
    const html = output('player', 'game', [10, 10], [[], []], false, id);
    assert.match(html, /Две чемпионки!/);
    assert.match(html, /Вам обеим полагается угощение/);
    assert.match(html, /кричите хором/);
  }
});

void test('Экран бинго: тайна сохраняется для участниц и после выдачи приза', () => {
  const before = output('player', 'bingo', [11, 8], [[0, 1], [1]]);
  assert.match(before, /СЕКРЕТНЫЙ ПРИЗ/);
  assert.doesNotMatch(before, /банкноту/);
  const winner = output('player', 'bingo', [11, 8], [[0, 1], [1]], true);
  const loser = output('player', 'bingo', [11, 8], [[0, 1], [1]], true, 'b');
  assert.match(winner, /СЕКРЕТНЫЙ ПРИЗ РАЗБЛОКИРОВАН/);
  assert.match(loser, /трофей достался сопернице/);
  assert.doesNotMatch(winner + loser, /банкноту/);
  const host = output('host', 'bingo', [11, 8], [[0, 1], [1]], true);
  assert.match(host, /коллекционную банкноту ЦСКА/);
});

void test('Экран бинго: при ничьей оба игрока получают секретную награду', () => {
  for (const id of ['a', 'b']) {
    const html = output('player', 'bingo', [5, 5], [[0], [2]], true, id);
    assert.match(html, /ДВА СЕКРЕТНЫХ ПРИЗА РАЗБЛОКИРОВАНЫ/);
    assert.match(html, /предъявите награды обеим чемпионкам/);
  }
});
