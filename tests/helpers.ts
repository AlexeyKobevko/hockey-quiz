import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createGameServer } from '../src/server/app.js';
import type { AuthFields, Endpoint, Session } from '../src/shared/contracts.js';
import { isSession, parseSnapshot, parseStreamBlock } from '../src/shared/validation.js';
export async function until(predicate: () => boolean, timeout = 3000) {
  const end = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() > end) throw new Error('Timed out waiting for condition');
    await new Promise((r) => setTimeout(r, 10));
  }
}
export async function fixture(
  t: TestContext,
  options: Parameters<typeof createGameServer>[0] = {},
) {
  const app = createGameServer({
    clientDir: fileURLToPath(new URL('../src/client/public/', import.meta.url)),
    ...options,
  });
  await new Promise<void>((r) => app.server.listen(0, '127.0.0.1', r));
  const address = app.server.address();
  assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  t.after(async () => {
    app.dispose();
    app.server.closeAllConnections();
    await new Promise<void>((r) => app.server.close(() => r()));
  });
  async function raw(endpoint: string, body: unknown = {}, headers: Record<string, string> = {}) {
    const r = await fetch(base + '/api/' + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
    const value: unknown = await r.json();
    return { status: r.status, body: value, headers: r.headers };
  }
  async function read(a: AuthFields) {
    return fetch(base + '/api/state?code=' + a.code, {
      headers: { Authorization: 'Bearer ' + a.token },
    });
  }
  async function state(a: AuthFields) {
    const r = await read(a);
    assert.equal(r.status, 200);
    const value: unknown = await r.json();
    return parseSnapshot(value);
  }
  async function scope(a: Session) {
    const s = await state(a);
    return { code: a.code, token: a.token, matchId: s.matchId, version: s.version, index: s.index };
  }
  async function post(endpoint: Endpoint, a: Session, extra: Record<string, unknown> = {}) {
    return raw(endpoint, { ...(await scope(a)), ...extra });
  }
  async function session(endpoint: 'create' | 'join', body: unknown = {}) {
    const r = await raw(endpoint, body);
    assert.equal(r.status, 201);
    assert.ok(isSession(r.body));
    return r.body;
  }
  async function room() {
    const h = await session('create');
    const a = await session('join', { code: h.code, name: 'Первая' }),
      b = await session('join', { code: h.code, name: 'Вторая' });
    return { h, a, b };
  }
  async function sse(a: Session) {
    const controller = new AbortController();
    t.after(() => controller.abort());
    const response = await fetch(base + '/api/events?code=' + a.code, {
      headers: { Authorization: 'Bearer ' + a.token },
      signal: controller.signal,
    });
    assert.equal(response.status, 200);
    assert.ok(response.body);
    const reader = response.body.getReader(),
      decoder = new TextDecoder();
    let buffer = '';
    return {
      close: () => controller.abort(),
      async next() {
        const timer = setTimeout(() => controller.abort(), 3000);
        try {
          for (;;) {
            let end: number;
            while ((end = buffer.indexOf('\n\n')) >= 0) {
              const block = buffer.slice(0, end);
              buffer = buffer.slice(end + 2);
              const message = parseStreamBlock(block);
              if (message) return message;
            }
            const next = await reader.read();
            if (next.done) return null;
            buffer += decoder.decode(next.value, { stream: true });
          }
        } finally {
          clearTimeout(timer);
        }
      },
    };
  }
  return { ...app, base, raw, read, state, scope, post, session, room, sse };
}
