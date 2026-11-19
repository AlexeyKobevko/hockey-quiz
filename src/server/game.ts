import type { Phase } from '../shared/contracts.js';
import { questions } from './questions.js';
import { missions } from '../shared/content.js';
export interface Player {
  id: string;
  token: string;
  name: string;
  score: number;
  bingo: number[];
}
export interface GameRoom {
  code: string;
  hostToken: string;
  matchId: string;
  version: number;
  players: Player[];
  phase: Phase;
  index: number;
  answers: Record<string, number>;
  bingoClosed: boolean;
  touchedAt: number;
  disconnectedAt: number;
}
export class GameError extends Error {
  constructor(
    public readonly kind: 'forbidden' | 'not_found' | 'conflict' | 'rate_limited',
    message: string,
  ) {
    super(message);
  }
}
export function questionAt(index: number) {
  const q = questions[index];
  if (!q) throw new Error('Invalid question index');
  return q;
}
export function assertMatch(room: GameRoom, matchId: string) {
  if (room.matchId !== matchId)
    throw new GameError('conflict', 'Партия уже сменилась. Дождись обновления.');
}
export function assertVersion(room: GameRoom, version: number) {
  if (room.version !== version)
    throw new GameError(
      'conflict',
      'Состояние изменилось. Дождитесь обновления и повторите действие.',
    );
}
export function startMatch(room: GameRoom) {
  if (room.phase !== 'lobby') throw new GameError('conflict', 'Игра уже идёт.');
  if (room.players.length !== 2) throw new GameError('conflict', 'Нужны две участницы.');
  room.phase = 'question';
  room.index = 0;
  room.answers = {};
}
function revealIfReady(room: GameRoom) {
  if (
    room.phase !== 'question' ||
    room.players.length !== 2 ||
    !room.players.every((p) => Object.hasOwn(room.answers, p.id))
  )
    return;
  const q = questionAt(room.index);
  for (const player of room.players) if (room.answers[player.id] === q.right) player.score++;
  room.phase = 'reveal';
}
export function answerQuestion(room: GameRoom, player: Player, index: number, answer: number) {
  if (index !== room.index) throw new GameError('conflict', 'Вопрос уже сменился.');
  if (room.phase !== 'question') throw new GameError('conflict', 'Сейчас ответы не принимаются.');
  if (Object.hasOwn(room.answers, player.id)) throw new GameError('conflict', 'Ответ уже принят.');
  room.answers[player.id] = answer;
  revealIfReady(room);
}
export function revealQuestion(room: GameRoom) {
  if (room.phase !== 'question') throw new GameError('conflict', 'Сейчас нечего открывать.');
  for (const player of room.players)
    if (!Object.hasOwn(room.answers, player.id)) room.answers[player.id] = -1;
  revealIfReady(room);
}
export function advanceQuestion(room: GameRoom) {
  if (room.phase === 'reveal') {
    room.index++;
    room.answers = {};
    room.phase =
      room.index >= questions.length ? 'finished' : room.index % 6 === 0 ? 'break' : 'question';
  } else if (room.phase === 'break') room.phase = 'question';
  else throw new GameError('conflict', 'Сейчас нельзя перейти к следующему вопросу.');
}
export function finishBingo(room: GameRoom) {
  if (room.phase !== 'finished') throw new GameError('conflict', 'Сначала завершите викторину.');
  if (room.bingoClosed) throw new GameError('conflict', 'Бинго уже завершено.');
  room.bingoClosed = true;
}
export function restartMatch(room: GameRoom, matchId: string) {
  room.bingoClosed = false;
  room.matchId = matchId;
  room.phase = 'lobby';
  room.index = 0;
  room.answers = {};
  for (const p of room.players) {
    p.score = 0;
    p.bingo = [];
  }
}
export function toggleMission(player: Player, mission: number) {
  if (!Number.isInteger(mission) || !missions[mission]) throw new Error('Invalid mission');
  player.bingo = player.bingo.includes(mission)
    ? player.bingo.filter((i) => i !== mission)
    : [...player.bingo, mission];
}
