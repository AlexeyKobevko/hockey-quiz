import { randomBytes } from 'node:crypto';
import type { Ack, Command, Session } from '../shared/contracts.js';
import {
  advanceQuestion,
  answerQuestion,
  assertMatch,
  assertVersion,
  GameError,
  finishBingo,
  restartMatch,
  revealQuestion,
  startMatch,
  toggleMission,
} from './game.js';
import type { GameRoom, Player } from './game.js';
import type { SseClient } from './sse.js';
export interface Room extends GameRoom {
  clients: Set<SseClient>;
}
export const randomId = (bytes = 24) => randomBytes(bytes).toString('base64url');
export function authenticate(
  room: GameRoom,
  token: string,
): { role: 'host'; player: null } | { role: 'player'; player: Player } {
  if (room.hostToken === token) return { role: 'host', player: null };
  const player = room.players.find((p) => p.token === token);
  if (!player) throw new GameError('forbidden', 'Нет доступа к этой комнате.');
  return { role: 'player', player };
}
interface StoreOptions {
  now: () => number;
  maxRooms: number;
  onPublish: (room: Room) => void;
  onClose: (room: Room, message: string) => void;
  onKick: (room: Room, token: string, message: string) => void;
}
export function createRoomStore(options: StoreOptions) {
  const { now } = options;
  const rooms = new Map<string, Room>();
  function find(code: string) {
    const room = rooms.get(code);
    if (!room)
      throw new GameError('not_found', 'Комната не найдена. Возможно, сервер перезапустился.');
    return room;
  }
  function publish(room: Room) {
    room.version++;
    room.touchedAt = now();
    options.onPublish(room);
  }
  function deleteRoom(room: Room, message = 'Комната закрыта ведущим.') {
    options.onClose(room, message);
    rooms.delete(room.code);
  }
  function handle(command: Command): Session | Ack {
    if (command.kind === 'create') {
      if (rooms.size >= options.maxRooms)
        throw new GameError('rate_limited', 'Слишком много активных игр.');
      const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
      let code: string;
      do {
        code = Array.from(randomBytes(6), (byte) => alphabet[byte % alphabet.length]).join('');
      } while (rooms.has(code));
      const token = randomId();
      const room: Room = {
        code,
        hostToken: token,
        matchId: randomId(12),
        version: 0,
        players: [],
        phase: 'lobby',
        index: 0,
        answers: {},
        bingoClosed: false,
        touchedAt: now(),
        disconnectedAt: now(),
        clients: new Set(),
      };
      rooms.set(code, room);
      return { code, token, role: 'host' };
    }
    const room = find(command.code);
    if (command.kind === 'join') {
      if (room.phase !== 'lobby')
        throw new GameError(
          'conflict',
          'Игра уже началась. Для возвращения открой прежнюю вкладку.',
        );
      if (room.players.length >= 2) throw new GameError('conflict', 'В комнате уже две участницы.');
      const token = randomId();
      room.players.push({ id: randomId(8), token, name: command.name, score: 0, bingo: [] });
      publish(room);
      return { code: room.code, token, role: 'player' };
    }
    const auth = authenticate(room, command.token);
    if (command.kind === 'answer' || command.kind === 'bingo') {
      if (auth.role !== 'player')
        throw new GameError('forbidden', 'Это действие доступно только участницам.');
      assertMatch(room, command.matchId);
      if (command.kind === 'answer')
        answerQuestion(room, auth.player, command.index, command.answer);
      else {
        if (room.phase !== 'finished')
          throw new GameError('conflict', 'Бинго откроется после трёх периодов викторины.');
        if (room.bingoClosed) throw new GameError('conflict', 'Бинго завершено ведущим.');
        toggleMission(auth.player, command.mission);
      }
    } else {
      if (auth.role !== 'host') throw new GameError('forbidden', 'Это действие доступно ведущему.');
      assertMatch(room, command.matchId);
      assertVersion(room, command.version);
      switch (command.kind) {
        case 'start':
          startMatch(room);
          break;
        case 'reveal':
          revealQuestion(room);
          break;
        case 'next':
          advanceQuestion(room);
          break;
        case 'restart':
          restartMatch(room, randomId(12));
          break;
        case 'finish-bingo':
          finishBingo(room);
          break;
        case 'kick': {
          if (room.phase !== 'lobby')
            throw new GameError(
              'conflict',
              'Заменить участницу можно только в лобби. Для замены начните реванш с обнулением очков.',
            );
          const player = room.players.find((p) => p.id === command.playerId);
          if (!player) throw new GameError('not_found', 'Участница не найдена.');
          room.players = room.players.filter((p) => p !== player);
          options.onKick(
            room,
            player.token,
            'Ведущий освободил твой слот. Можно войти снова, если есть место.',
          );
          break;
        }
        case 'close':
          room.version++;
          deleteRoom(room);
          return { ok: true };
      }
    }
    publish(room);
    return { ok: true };
  }
  function cleanupRooms() {
    for (const room of rooms.values()) {
      const idle = now() - room.touchedAt,
        disconnected = now() - Math.max(room.disconnectedAt, room.touchedAt);
      if (
        (room.phase === 'lobby' && idle >= 30 * 60 * 1000) ||
        (!room.clients.size &&
          disconnected >=
            (room.phase === 'finished' && !room.bingoClosed
              ? 8 * 60 * 60 * 1000
              : 2 * 60 * 60 * 1000))
      )
        deleteRoom(room, 'Комната закрыта после долгого бездействия. Создайте новую игру.');
    }
  }
  return {
    rooms,
    find,
    handle,
    cleanupRooms,
    dispose: () => {
      for (const room of rooms.values())
        deleteRoom(room, 'Сервер перезапускается. Создайте новую комнату.');
    },
  };
}
