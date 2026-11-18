import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSync } from '../src/client/sync.js';
import { createRoomStore } from '../src/server/rooms.js';
import { snapshot } from '../src/server/sse.js';
import type { GameSnapshot, Session } from '../src/shared/contracts.js';
import { isSession } from '../src/shared/validation.js';
import { until } from './helpers.js';
void test('SSE generation: поздние кадры старой сессии не заменяют новую', async (t) => {
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document'),
    navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
    originalFetch = globalThis.fetch;
  Object.defineProperty(globalThis, 'document', { value: { hidden: false }, configurable: true });
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (documentDescriptor) Object.defineProperty(globalThis, 'document', documentDescriptor);
    else Reflect.deleteProperty(globalThis, 'document');
    if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
    else Reflect.deleteProperty(globalThis, 'navigator');
  });
  const store = createRoomStore({
    now: () => 1,
    maxRooms: 2,
    onPublish: () => {},
    onClose: () => {},
    onKick: () => {},
  });
  const first = store.handle({ kind: 'create' }),
    second = store.handle({ kind: 'create' });
  assert.ok(isSession(first) && isSession(second));
  const snapshots = new Map([
    [first.token, snapshot(store.find(first.code), first.token)],
    [second.token, snapshot(store.find(second.code), second.token)],
  ]);
  const streams = new Map<string, ReadableStreamDefaultController<Uint8Array>>();
  globalThis.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const token = new Headers(init?.headers).get('Authorization')?.slice(7) ?? '';
    const state = snapshots.get(token);
    assert.ok(state);
    if (url.startsWith('/api/state'))
      return Promise.resolve(
        new Response(JSON.stringify(state), {
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    return Promise.resolve(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            streams.set(token, controller);
            controller.enqueue(new TextEncoder().encode('data: ' + JSON.stringify(state) + '\n\n'));
          },
        }),
        { headers: { 'Content-Type': 'text/event-stream' } },
      ),
    );
  };
  let session: Session = first;
  const received: GameSnapshot[] = [],
    ended: string[] = [];
  const sync = createSync({
    session: () => session,
    state: (s) => received.push(s),
    status: () => {},
    ended: (m) => ended.push(m),
    error: () => {},
  });
  t.after(() => sync.stop());
  const a = sync.connect();
  await until(() => streams.has(first.token) && received.length >= 2);
  session = second;
  const b = sync.connect();
  await until(() => streams.has(second.token) && received.at(-1)?.code === second.code);
  streams
    .get(first.token)
    ?.enqueue(new TextEncoder().encode('event: room-closed\ndata: {"message":"old close"}\n\n'));
  await a;
  assert.equal(received.at(-1)?.code, second.code);
  assert.deepEqual(ended, []);
  sync.stop();
  for (const stream of streams.values()) stream.close();
  await b;
  store.dispose();
});
