import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isSession,
  isSnapshot,
  isVisualChoice,
  parseCommand,
  parseStreamBlock,
} from '../src/shared/validation.js';
import { createRoomStore } from '../src/server/rooms.js';
import { snapshot } from '../src/server/sse.js';
const auth = { code: 'ABC234', token: 'private-token', matchId: 'match', version: 1, index: 0 };
void test('Контракты запросов отклоняют неправильные типы и обязательные поля', () => {
  for (const body of [null, [], 7, 'bad']) assert.throws(() => parseCommand('create', body));
  for (const name of [null, {}, [], 2])
    assert.throws(() => parseCommand('join', { code: auth.code, name }));
  assert.equal(parseCommand('join', { code: ' abc234 ', name: ' \u0000Лена <b> ' }).kind, 'join');
  for (const answer of [-1, 4, 1.5, '1', null])
    assert.throws(() => parseCommand('answer', { ...auth, answer }));
  for (const field of ['matchId', 'index']) {
    const b: Record<string, unknown> = { ...auth, answer: 1 };
    delete b[field];
    assert.throws(() => parseCommand('answer', b));
  }
  for (const version of [undefined, '1', -1])
    assert.throws(() => parseCommand('next', { ...auth, version }));
  assert.throws(() => parseCommand('bingo', { ...auth, mission: 8 }));
  assert.equal(isSession({ code: auth.code, token: auth.token, role: 'host' }), true);
  assert.equal(isSession({ ...auth, role: 'other' }), false);
  assert.equal(isVisualChoice(null), false);
});
void test('Фазовые снимки и события проверяются без утечек и fallback в финал', () => {
  const store = createRoomStore({
    now: () => 1,
    maxRooms: 1,
    onPublish: () => {},
    onClose: () => {},
    onKick: () => {},
  });
  const h = store.handle({ kind: 'create' });
  assert.ok(isSession(h));
  const room = store.find(h.code),
    s = snapshot(room, h.token);
  assert.equal(isSnapshot(s), true);
  for (const bad of [
    { ...s, phase: 'other' },
    { ...s, question: { text: 'bad' } },
    { ...s, hostToken: h.token },
    { ...s, version: null },
    { ...s, selfId: 'missing' },
  ])
    assert.equal(isSnapshot(bad), false);
  assert.equal(parseStreamBlock(': ping'), null);
  assert.deepEqual(parseStreamBlock('event: room-closed\ndata: {"message":"closed"}'), {
    kind: 'ended',
    message: 'closed',
  });
  assert.throws(() => parseStreamBlock('event: session-ended\ndata: {}'));
  assert.deepEqual(parseStreamBlock('data: ' + JSON.stringify(s)), { kind: 'state', state: s });
});
