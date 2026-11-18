import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  startMatch,
  answerQuestion,
  revealQuestion,
  advanceQuestion,
  restartMatch,
  questionAt,
} from '../src/server/game.js';
import { createRoomStore } from '../src/server/rooms.js';
import { isSession } from '../src/shared/validation.js';
import { missions, rules } from '../src/shared/content.js';
import { questions } from '../src/server/questions.js';
function game() {
  const store = createRoomStore({
    now: () => 100,
    maxRooms: 1,
    onPublish: () => {},
    onClose: () => {},
    onKick: () => {},
  });
  const h = store.handle({ kind: 'create' });
  assert.ok(isSession(h));
  store.handle({ kind: 'join', code: h.code, name: 'Player A' });
  store.handle({ kind: 'join', code: h.code, name: 'Player B' });
  return store.find(h.code);
}
void test('Полный доменный матч: переходы, два перерыва, счёт и реванш', () => {
  const r = game();
  const [a, b] = r.players;
  assert.ok(a && b);
  startMatch(r);
  for (let index = 0; index < 18; index++) {
    assert.equal(r.phase, 'question');
    const q = questionAt(index);
    answerQuestion(r, a, index, q.right);
    assert.equal(r.phase, 'question');
    assert.throws(() => answerQuestion(r, a, index, q.right));
    answerQuestion(r, b, index, (q.right + 1) % 4);
    assert.equal(r.phase, 'reveal');
    assert.equal(a.score, index + 1);
    assert.equal(b.score, 0);
    advanceQuestion(r);
    if (index === 5 || index === 11) {
      assert.equal(r.phase, 'break');
      advanceQuestion(r);
    }
  }
  assert.equal(r.phase, 'finished');
  assert.equal(r.index, 18);
  assert.throws(() => advanceQuestion(r));
  a.bingo = [0];
  restartMatch(r, 'next-match');
  assert.equal(r.phase, 'lobby');
  assert.equal(a.score, 0);
  assert.deepEqual(a.bingo, []);
  assert.equal(r.matchId, 'next-match');
});
void test('Принудительное раскрытие, ничья и недопустимые переходы', () => {
  const r = game();
  assert.throws(() => revealQuestion(r));
  assert.throws(() => advanceQuestion(r));
  r.players.pop();
  assert.throws(() => startMatch(r));
  r.players.push({ id: 'B', token: 'B', name: 'Player B', score: 0, bingo: [] });
  startMatch(r);
  assert.throws(() => startMatch(r));
  const p = r.players[0];
  assert.ok(p);
  assert.throws(() => answerQuestion(r, p, 1, 0));
  revealQuestion(r);
  assert.deepEqual(
    r.players.map((p) => p.score),
    [0, 0],
  );
  assert.ok(r.players.every((p) => r.answers[p.id] === -1));
  assert.throws(() => revealQuestion(r));
  assert.throws(() => answerQuestion(r, p, 0, 0));
  for (let index = 0; index < 18; index++) {
    if (index > 0) revealQuestion(r);
    advanceQuestion(r);
    if (r.phase === 'break') advanceQuestion(r);
  }
  assert.equal(r.phase, 'finished');
  assert.deepEqual(
    r.players.map((player) => player.score),
    [0, 0],
  );
});
void test('Контент: 18 вопросов, 17 правил и 8 миссий без изменения механики', () => {
  assert.equal(questions.length, 18);
  assert.equal(rules.length, 17);
  assert.equal(missions.length, 8);
  assert.deepEqual(
    [1, 2, 3].map((p) => questions.filter((q) => q.p === p).length),
    [6, 6, 6],
  );
  for (const q of questions) {
    assert.ok(rules.some((r) => r.id === q.ruleId));
    assert.equal(q.a.length, 4);
    assert.equal(new Set(q.a).size, 4);
    assert.ok(Number.isInteger(q.right) && q.right >= 0 && q.right < 4);
    assert.ok(q.ex.length > 20);
  }
});
