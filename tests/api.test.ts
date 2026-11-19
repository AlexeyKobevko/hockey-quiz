import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { fixture, until } from './helpers.js';
import { questions } from '../src/server/questions.js';
import { isApiError } from '../src/shared/validation.js';

void test('HTTP: полный матч, роли, 18 вопросов, два перерыва, бинго и реванш', async (t) => {
  const f = await fixture(t);
  const { h, a, b } = await f.room();
  assert.equal((await f.raw('join', { code: h.code, name: 'Третья' })).status, 409);
  assert.equal((await f.post('start', a)).status, 403);
  assert.equal((await f.post('start', h)).status, 200);
  assert.equal((await f.post('bingo', a, { mission: 0 })).status, 409);
  assert.equal((await f.raw('join', { code: h.code, name: 'Поздняя' })).status, 409);
  for (let i = 0; i < 18; i++) {
    const q = questions[i];
    assert.ok(q);
    const s = await f.state(a);
    assert.equal(s.index, i);
    assert.equal(s.phase, 'question');
    assert.ok(s.question);
    assert.ok(!('correct' in s.question));
    assert.equal((await f.post('answer', a, { answer: q.right })).status, 200);
    assert.equal((await f.post('answer', a, { answer: q.right })).status, 409);
    assert.equal((await f.post('answer', b, { answer: (q.right + 1) % 4 })).status, 200);
    const reveal = await f.state(h);
    assert.ok(reveal.phase === 'reveal');
    assert.equal(reveal.question.correct, q.right);
    assert.deepEqual(
      reveal.players.map((p) => p.score),
      [i + 1, 0],
    );
    assert.equal((await f.post('next', h)).status, 200);
    if (i === 5 || i === 11) {
      assert.equal((await f.state(h)).phase, 'break');
      await f.post('next', h);
    }
  }
  assert.equal((await f.state(h)).phase, 'finished');
  await f.post('bingo', a, { mission: 3 });
  assert.deepEqual((await f.state(a)).bingo, [3]);
  assert.deepEqual((await f.state(b)).bingo, []);
  await f.post('bingo', a, { mission: 3 });
  assert.deepEqual((await f.state(a)).bingo, []);
  assert.equal((await f.post('bingo', a, { mission: 3 })).status, 200);
  const before = await f.state(h);
  assert.deepEqual(before.players[0]?.bingo, [3]);
  assert.equal(before.bingoClosed, false);
  assert.equal((await f.post('finish-bingo', a)).status, 403);
  assert.equal((await f.post('finish-bingo', h)).status, 200);
  assert.equal((await f.state(a)).bingoClosed, true);
  assert.equal((await f.post('bingo', a, { mission: 0 })).status, 409);
  assert.equal((await f.post('finish-bingo', h)).status, 409);
  await f.post('restart', h);
  const after = await f.state(h);
  assert.equal(after.phase, 'lobby');
  assert.equal(after.bingoClosed, false);
  assert.notEqual(after.matchId, before.matchId);
  assert.ok(after.version > before.version);
  assert.deepEqual(
    after.players.map((p) => p.score),
    [0, 0],
  );
});
void test('HTTP: старые answer/bingo/host-команды и обязательные поля', async (t) => {
  const f = await fixture(t);
  const { h, a } = await f.room();
  await f.post('start', h);
  const stale = await f.scope(a),
    oldHost = await f.scope(h);
  await f.post('restart', h);
  await f.post('start', h);
  const before = await f.state(h);
  assert.equal((await f.raw('answer', { ...stale, answer: 1 })).status, 409);
  assert.equal((await f.raw('bingo', { ...stale, mission: 0 })).status, 409);
  assert.equal((await f.raw('restart', oldHost)).status, 409);
  assert.equal((await f.state(h)).version, before.version);
  const current = await f.scope(a);
  const noIndex: Record<string, unknown> = { ...current };
  delete noIndex.index;
  assert.equal((await f.raw('answer', { ...noIndex, answer: 0 })).status, 400);
  const noMatch: Record<string, unknown> = { ...current };
  delete noMatch.matchId;
  assert.equal((await f.raw('bingo', { ...noMatch, mission: 0 })).status, 400);
  const noVersion: Record<string, unknown> = { ...(await f.scope(h)) };
  delete noVersion.version;
  assert.equal((await f.raw('next', noVersion)).status, 400);
});
void test('HTTP: параллельные ответы, повторный next и forced reveal не удваивают очки', async (t) => {
  const f = await fixture(t);
  const { h, a, b } = await f.room();
  await f.post('start', h);
  const q = questions[0];
  assert.ok(q);
  const scope = await f.scope(a);
  const duplicate = await Promise.all([
    f.raw('answer', { ...scope, answer: q.right }),
    f.raw('answer', { ...scope, answer: q.right }),
  ]);
  assert.deepEqual(duplicate.map((r) => r.status).sort(), [200, 409]);
  assert.equal((await f.post('reveal', b)).status, 403);
  assert.equal((await f.post('reveal', h)).status, 200);
  assert.equal((await f.post('reveal', h)).status, 409);
  const s = await f.state(h);
  assert.ok(s.phase === 'reveal');
  assert.deepEqual(
    s.players.map((p) => p.score),
    [1, 0],
  );
  assert.equal(s.players[1]?.answer, -1);
  const next = await f.scope(h);
  const responses = await Promise.all([f.raw('next', next), f.raw('next', next)]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
  assert.equal((await f.raw('answer', { ...scope, answer: 0 })).status, 409);
  const q1 = questions[1];
  assert.ok(q1);
  const both = await Promise.all([
    f.post('answer', a, { answer: q1.right }),
    f.post('answer', b, { answer: q1.right }),
  ]);
  assert.ok(both.every((r) => r.status === 200));
  assert.deepEqual(
    (await f.state(h)).players.map((p) => p.score),
    [2, 1],
  );
});
void test('SSE: сохранённый ключ, скрытые ответы/токены и восстановление снимка', async (t) => {
  const f = await fixture(t);
  const { h, a, b } = await f.room();
  const saved = { ...a },
    before = await f.state(a);
  const stream = await f.sse(a);
  const initial = await stream.next();
  assert.ok(initial?.kind === 'state');
  assert.equal(initial.state.selfId, before.selfId);
  stream.close();
  await until(() => f.hub.clientsCount === 0);
  await f.post('start', h);
  await f.post('answer', a, { answer: 1 });
  const restored = await f.state(saved);
  assert.equal(restored.selfId, before.selfId);
  assert.equal(restored.players[0]?.answered, true);
  const replay = await f.sse(saved);
  const latest = await replay.next();
  assert.ok(latest?.kind === 'state');
  assert.equal(latest.state.players[0]?.answered, true);
  replay.close();
  for (const who of [h, a, b]) {
    const s = await f.state(who),
      raw = JSON.stringify(s);
    for (const key of [h.token, a.token, b.token]) assert.ok(!raw.includes(key));
    assert.ok(s.question && !('correct' in s.question) && !('explanation' in s.question));
    assert.ok(s.players.every((p) => !('answer' in p)));
  }
  assert.equal((await f.read({ ...a, token: 'wrong' })).status, 403);
  for (const endpoint of ['state', 'events']) {
    const response = await fetch(`${f.base}/api/${endpoint}?code=${a.code}&token=${a.token}`);
    assert.equal(response.status, 403);
    assert.ok(!JSON.stringify(await response.json()).includes(a.token));
  }
});
void test('SSE: исключение в лобби, отзыв токена, новый телефон и запрет kick в игре', async (t) => {
  const f = await fixture(t);
  const { h, a, b } = await f.room();
  const player = (await f.state(a)).selfId;
  assert.ok(player);
  const stream = await f.sse(a);
  await stream.next();
  assert.equal((await f.post('kick', b, { playerId: player })).status, 403);
  assert.equal((await f.post('kick', h, { playerId: player })).status, 200);
  const ended = await stream.next();
  assert.ok(ended?.kind === 'ended');
  assert.match(ended.message, /освободил/);
  assert.equal(await stream.next(), null);
  assert.equal((await f.read(a)).status, 403);
  assert.equal(f.hub.clientsCount, 0);
  const replacement = await f.session('join', { code: h.code, name: 'Новый телефон' });
  assert.equal((await f.state(replacement)).players.length, 2);
  await f.post('start', h);
  assert.equal((await f.post('kick', h, { playerId: (await f.state(b)).selfId })).status, 409);
});
void test('SSE: только ведущий закрывает комнату и завершает все потоки', async (t) => {
  const f = await fixture(t);
  const { h, a, b } = await f.room();
  const s1 = await f.sse(a),
    s2 = await f.sse(b);
  await s1.next();
  await s2.next();
  assert.equal((await f.post('close', a)).status, 403);
  const other = await f.session('create');
  assert.equal((await f.raw('close', { ...(await f.scope(h)), token: other.token })).status, 403);
  assert.equal((await f.post('close', h)).status, 200);
  for (const stream of [s1, s2]) {
    assert.ok((await stream.next())?.kind === 'ended');
    assert.equal(await stream.next(), null);
  }
  assert.equal((await f.read(h)).status, 404);
  assert.equal(f.hub.clientsCount, 0);
  assert.equal(f.rooms.size, 1);
});
void test('TTL: лобби 30 минут, отключённая игра 2 часа, бинго 8 часов, итоги 2 часа', async (t) => {
  let time = 1000;
  const f = await fixture(t, { now: () => time, limits: { creates: 100, requests: 1000 } });
  const empty = await f.session('create');
  time += 29 * 60000;
  f.cleanupRooms();
  assert.ok(f.rooms.has(empty.code));
  const stream = await f.sse(empty);
  await stream.next();
  time += 60000;
  f.cleanupRooms();
  assert.ok(!f.rooms.has(empty.code));
  assert.ok((await stream.next())?.kind === 'ended');
  assert.equal(await stream.next(), null);
  const { h, a } = await f.room();
  await f.post('start', h);
  time += 119 * 60000;
  f.cleanupRooms();
  assert.ok(f.rooms.has(h.code));
  const live = await f.sse(a);
  await live.next();
  time += 3 * 60 * 60000;
  f.cleanupRooms();
  assert.ok(f.rooms.has(h.code));
  live.close();
  await until(() => f.rooms.get(h.code)?.clients.size === 0);
  time += 119 * 60000;
  f.cleanupRooms();
  assert.ok(f.rooms.has(h.code));
  time += 60000;
  f.cleanupRooms();
  assert.ok(!f.rooms.has(h.code));
  const end = await f.room();
  const room = f.rooms.get(end.h.code);
  assert.ok(room);
  room.phase = 'finished';
  room.touchedAt = time;
  room.disconnectedAt = time;
  time += 3 * 60 * 60000;
  f.cleanupRooms();
  assert.ok(f.rooms.has(room.code), 'Room must survive the live hockey match with every phone asleep');
  time += 5 * 60 * 60000;
  f.cleanupRooms();
  assert.ok(!f.rooms.has(room.code));
  const final = await f.room();
  const closed = f.rooms.get(final.h.code);
  assert.ok(closed);
  closed.phase = 'finished';
  closed.bingoClosed = true;
  closed.touchedAt = time;
  closed.disconnectedAt = time;
  time += 119 * 60000;
  f.cleanupRooms();
  assert.ok(f.rooms.has(closed.code));
  time += 60000;
  f.cleanupRooms();
  assert.ok(!f.rooms.has(closed.code));
});
void test('Лимиты: комнаты, запросы, bucket cleanup, SSE и освобождение слота', async (t) => {
  let time = 1;
  const f = await fixture(t, { now: () => time, limits: { creates: 2, requests: 1000 } });
  await f.session('create');
  await f.session('create');
  assert.equal((await f.raw('create', {}, { 'X-Forwarded-For': '8.8.8.8' })).status, 429);
  time += 600001;
  f.cleanupRooms();
  assert.equal(f.buckets.size, 0);
  await f.session('create');
  const limited = await fixture(t, { limits: { requests: 2 } });
  await limited.raw('create');
  await limited.raw('create');
  const denied = await limited.raw('create');
  assert.equal(denied.status, 429);
  assert.ok(denied.headers.get('retry-after'));
  assert.equal((await fetch(limited.base + '/api/health')).status, 200);
  const cap = await fixture(t, { limits: { rooms: 1 } });
  await cap.session('create');
  assert.equal((await cap.raw('create')).status, 429);
  const s = await fixture(t, { limits: { ssePerToken: 1, ssePerRoom: 2, sseTotal: 2 } });
  const { h, a, b } = await s.room();
  const one = await s.sse(a);
  await one.next();
  const rejected = await fetch(s.base + '/api/events?code=' + a.code, {
    headers: { Authorization: 'Bearer ' + a.token },
  });
  assert.equal(rejected.status, 429);
  await rejected.text();
  const two = await s.sse(b);
  await two.next();
  const host = await fetch(s.base + '/api/events?code=' + h.code, {
    headers: { Authorization: 'Bearer ' + h.token },
  });
  assert.equal(host.status, 429);
  await host.text();
  one.close();
  await until(() => s.hub.clientsCount === 1);
  const reopened = await s.sse(a);
  await reopened.next();
  reopened.close();
  two.close();
  await until(() => s.hub.clientsCount === 0);
});
void test('API: валидация, Origin, Unicode, 500 и отсутствие раскрытия серверных файлов', async (t) => {
  const f = await fixture(t, { limits: { creates: 100, requests: 1000 } });
  for (const body of [null, [], 7, 'bad']) assert.equal((await f.raw('create', body)).status, 400);
  assert.equal((await f.raw('create', {}, { Origin: 'https://other.example' })).status, 403);
  const h = await f.session('create');
  for (const name of [{}, [], null, 1])
    assert.equal((await f.raw('join', { code: h.code, name })).status, 400);
  const a = await f.session('join', { code: h.code, name: ' <b>Лена</b> ' }),
    b = await f.session('join', { code: h.code, name: 'Вторая' });
  assert.equal((await f.state(a)).players[0]?.name, '<b>Лена</b>');
  await f.post('start', h);
  for (const answer of [-1, 4, 1.5, '1', null])
    assert.equal((await f.post('answer', a, { answer })).status, 400);
  assert.equal((await fetch(f.base + '/api/create', { method: 'POST', body: '{' })).status, 400);
  assert.equal((await f.raw('create', { data: 'x'.repeat(5000) })).status, 400);
  assert.equal((await fetch(f.base + '/api/health')).status, 200);
  for (const p of [
    '/server.js',
    '/game-data.js',
    '/rules.js',
    '/server/app.js',
    '/shared/content.js',
    '/.env',
    '/../game-data.js',
    '/%2e%2e%2fserver.js',
  ])
    assert.notEqual((await fetch(f.base + p)).status, 200);
  const unicode = await f.session('create');
  const bytes = Buffer.from(JSON.stringify({ code: unicode.code, name: 'Привет' }));
  const split = bytes.indexOf(Buffer.from('П')) + 1;
  const result = await new Promise<number>((resolve, reject) => {
    const r = http.request(
      f.base + '/api/join',
      { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode ?? 0));
      },
    );
    r.on('error', reject);
    r.write(bytes.subarray(0, split));
    setImmediate(() => r.end(bytes.subarray(split)));
  });
  assert.equal(result, 201);
  assert.equal((await f.state(unicode)).players[0]?.name, 'Привет');
  const errors: unknown[] = [];
  const broken = await fixture(t, {
    now: () => {
      throw new Error('internal secret');
    },
    onError: (e) => errors.push(e),
  });
  const failure = await broken.raw('create');
  assert.equal(failure.status, 500);
  assert.ok(isApiError(failure.body));
  assert.ok(!JSON.stringify(failure.body).includes('internal secret'));
  assert.equal(errors.length, 1);
  assert.equal((await f.post('close', b)).status, 403);
});
