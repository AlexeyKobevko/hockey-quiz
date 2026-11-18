import type { IncomingMessage, ServerResponse } from 'node:http';
import type {
  GameSnapshot,
  PublicPlayer,
  RevealedPlayer,
  SnapshotBase,
} from '../shared/contracts.js';
import { missions, rules } from '../shared/content.js';
import { GameError, questionAt } from './game.js';
import { authenticate } from './rooms.js';
import type { Room } from './rooms.js';
export interface SseClient {
  res: ServerResponse;
  token: string;
  ping: ReturnType<typeof setInterval> | null;
}
export function snapshot(room: Room, token: string): GameSnapshot {
  const auth = authenticate(room, token),
    player = auth.player;
  const players: PublicPlayer[] = room.players.map((p) => ({
    id: p.id,
    name: p.name,
    score: p.score,
    answered: Object.hasOwn(room.answers, p.id),
    bingo: [...p.bingo],
  }));
  const base: SnapshotBase = {
    code: room.code,
    matchId: room.matchId,
    version: room.version,
    role: auth.role,
    selfId: player?.id ?? null,
    index: room.index,
    total: 18,
    bingo: [...(player?.bingo ?? [])],
    missions,
    rules,
    roundComplete: room.phase === 'break' ? room.index : null,
  };
  if (room.phase === 'question' || room.phase === 'reveal') {
    const q = questionAt(room.index),
      question = { text: q.q, options: [...q.a], period: q.p };
    if (room.phase === 'question') return { ...base, phase: 'question', question, players };
    const revealed: RevealedPlayer[] = players.map((p) => {
      const answer = room.answers[p.id];
      if (answer === undefined) throw new Error('Missing revealed answer');
      return { ...p, answer, correct: answer === q.right };
    });
    return {
      ...base,
      phase: 'reveal',
      question: { ...question, correct: q.right, explanation: q.ex },
      players: revealed,
    };
  }
  return { ...base, phase: room.phase, question: null, players };
}
export interface SsePolicy {
  ssePerToken: number;
  ssePerRoom: number;
  sseTotal: number;
}
export function createSseHub(policy: SsePolicy, now: () => number, heartbeatMs = 20000) {
  let clientsCount = 0;
  function remove(room: Room, client: SseClient) {
    if (!room.clients.delete(client)) return;
    if (client.ping) clearInterval(client.ping);
    clientsCount--;
    if (!room.clients.size) room.disconnectedAt = now();
  }
  function end(room: Room, client: SseClient, event: string, message: string) {
    remove(room, client);
    try {
      client.res.end(`event: ${event}\ndata: ${JSON.stringify({ message })}\n\n`);
    } catch {
      client.res.destroy();
    }
  }
  function publish(room: Room) {
    for (const client of [...room.clients]) {
      if (client.res.writableLength > 65536) {
        remove(room, client);
        client.res.destroy();
        continue;
      }
      try {
        client.res.write(`data: ${JSON.stringify(snapshot(room, client.token))}\n\n`);
      } catch {
        remove(room, client);
        client.res.destroy();
      }
    }
  }
  function connect(_req: IncomingMessage, res: ServerResponse, room: Room, token: string) {
    if (
      room.clients.size >= policy.ssePerRoom ||
      clientsCount >= policy.sseTotal ||
      [...room.clients].filter((c) => c.token === token).length >= policy.ssePerToken
    )
      throw new GameError('rate_limited', 'Слишком много подключений. Закрой лишние вкладки.');
    const initial = snapshot(room, token);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const client: SseClient = { res, token, ping: null };
    room.clients.add(client);
    clientsCount++;
    res.on('close', () => remove(room, client));
    res.on('error', () => remove(room, client));
    res.write(`retry: 2500\ndata: ${JSON.stringify(initial)}\n\n`);
    client.ping = setInterval(() => {
      try {
        if (res.writableLength > 65536) {
          remove(room, client);
          res.destroy();
          return;
        }
        res.write(': ping\n\n');
      } catch {
        remove(room, client);
        res.destroy();
      }
    }, heartbeatMs);
  }
  return {
    connect,
    publish,
    get clientsCount() {
      return clientsCount;
    },
    closeRoom: (r: Room, m: string) => {
      for (const c of [...r.clients]) end(r, c, 'room-closed', m);
    },
    closeToken: (r: Room, t: string, m: string) => {
      for (const c of [...r.clients]) if (c.token === t) end(r, c, 'session-ended', m);
    },
  };
}
