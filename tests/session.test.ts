import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSessionStore } from '../src/client/session.js';
function memory() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
  };
}
void test('Сессии: legacy, повреждённые данные, dev isolation и production игнорирование', () => {
  const local = memory(),
    legacy = memory(),
    session = { code: 'ABC234', token: 'private', role: 'host' as const };
  legacy.setItem('hockey-multiplayer-v2', JSON.stringify(session));
  const production = createSessionStore(false, '?devSession=ignored', local, legacy);
  assert.deepEqual(production.load().session, session);
  assert.equal(legacy.getItem(production.key), null);
  assert.equal(production.namespace, null);
  local.setItem(production.key, '{bad');
  assert.equal(production.load().session, null);
  assert.equal(local.getItem(production.key), null);
  const a = createSessionStore(true, '?devSession=a', local, legacy),
    b = createSessionStore(true, '?devSession=b', local, legacy);
  a.save(session);
  assert.deepEqual(a.load().session, session);
  assert.equal(b.load().session, null);
  assert.equal(a.clearedUrl('/'), '/?devSession=a');
  local.setItem(
    a.choiceKey,
    JSON.stringify({ code: 'ABC234', matchId: 'old', selfId: 'id', index: 0, answer: 1 }),
  );
  assert.equal(a.loadChoice()?.matchId, 'old');
});
void test('Запрещённый storage не роняет загрузку и сохранение', () => {
  const blocked = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
    removeItem: () => {
      throw new Error('blocked');
    },
  };
  const store = createSessionStore(false, '', blocked, blocked);
  assert.equal(store.load().session, null);
  assert.ok(store.load().error.includes('Браузер'));
  assert.ok(store.save(null).includes('Браузер'));
  assert.equal(store.loadChoice(), null);
  assert.doesNotThrow(() => store.saveChoice(null));
});
