import type {
  Ack,
  ApiError,
  Command,
  Endpoint,
  GameSnapshot,
  HostFields,
  Mission,
  PublicPlayer,
  PublicQuestion,
  RevealedPlayer,
  Rule,
  Session,
  StreamMessage,
  VisualChoice,
} from './contracts.js';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function isInteger(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}
export function isCode(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Z2-9]{6}$/.test(value);
}
function isId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}
export function isSession(value: unknown): value is Session {
  return (
    isRecord(value) &&
    isCode(value.code) &&
    isId(value.token) &&
    (value.role === 'host' || value.role === 'player')
  );
}
export function isApiError(value: unknown): value is ApiError {
  return isRecord(value) && typeof value.error === 'string' && typeof value.code === 'string';
}
export function isAck(value: unknown): value is Ack {
  return isRecord(value) && value.ok === true;
}
export class ValidationError extends Error {
  constructor(message = 'Некорректные данные запроса. Обнови страницу.') {
    super(message);
  }
}
function stringField(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== 'string')
    throw new ValidationError(`Нужно строковое поле ${key}. Обнови страницу.`);
  return value;
}
function integerField(
  body: Record<string, unknown>,
  key: string,
  max = Number.MAX_SAFE_INTEGER,
): number {
  const value = body[key];
  if (!isInteger(value, 0, max))
    throw new ValidationError(`Нужно целое поле ${key} допустимого диапазона. Обнови страницу.`);
  return value;
}
export function isEndpoint(value: string): value is Endpoint {
  return [
    'create',
    'join',
    'start',
    'reveal',
    'next',
    'restart',
    'kick',
    'close',
    'finish-bingo',
    'answer',
    'bingo',
  ].includes(value);
}
export function parseCommand(endpoint: Endpoint, value: unknown): Command {
  if (!isRecord(value)) throw new ValidationError('Нужен объект JSON.');
  if (endpoint === 'create') return { kind: 'create' };
  const code = stringField(value, 'code').trim().toUpperCase();
  if (!isCode(code)) throw new ValidationError('Некорректный код комнаты.');
  if (endpoint === 'join') {
    const name = stringField(value, 'name')
      .trim()
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .slice(0, 24);
    if (name.length < 2) throw new ValidationError('Введи ник минимум из двух символов.');
    return { kind: endpoint, code, name };
  }
  const token = stringField(value, 'token'),
    matchId = stringField(value, 'matchId');
  if (!isId(token) || !isId(matchId))
    throw new ValidationError('Неверный ключ участия или matchId. Обнови страницу.');
  const match = { code, token, matchId };
  if (endpoint === 'answer')
    return {
      kind: endpoint,
      ...match,
      index: integerField(value, 'index', 17),
      answer: integerField(value, 'answer', 3),
    };
  if (endpoint === 'bingo')
    return { kind: endpoint, ...match, mission: integerField(value, 'mission', 7) };
  const host: HostFields = { ...match, version: integerField(value, 'version') };
  if (endpoint === 'kick')
    return { kind: endpoint, ...host, playerId: stringField(value, 'playerId') };
  return { kind: endpoint, ...host };
}
function isRule(value: unknown): value is Rule {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.text === 'string'
  );
}
function isMission(value: unknown): value is Mission {
  return (
    isRecord(value) &&
    typeof value.icon === 'string' &&
    typeof value.title === 'string' &&
    typeof value.desc === 'string'
  );
}
function isBingo(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.every((n: unknown) => isInteger(n, 0, 7)) &&
    new Set(value).size === value.length
  );
}
function isPublicPlayer(value: unknown): value is PublicPlayer {
  return (
    isRecord(value) &&
    isId(value.id) &&
    typeof value.name === 'string' &&
    value.name.length >= 2 &&
    value.name.length <= 24 &&
    isInteger(value.score, 0, 18) &&
    typeof value.answered === 'boolean' &&
    isBingo(value.bingo) &&
    !('token' in value)
  );
}
function isQuestion(value: unknown): value is PublicQuestion {
  return (
    isRecord(value) &&
    typeof value.text === 'string' &&
    Array.isArray(value.options) &&
    value.options.length === 4 &&
    value.options.every((x: unknown) => typeof x === 'string') &&
    isInteger(value.period, 1, 3)
  );
}
function isRevealedPlayer(value: unknown): value is RevealedPlayer {
  return (
    isPublicPlayer(value) &&
    isRecord(value) &&
    value.answered &&
    isInteger(value.answer, -1, 3) &&
    typeof value.correct === 'boolean'
  );
}
export function isSnapshot(value: unknown): value is GameSnapshot {
  if (
    !isRecord(value) ||
    !isCode(value.code) ||
    !isId(value.matchId) ||
    !isInteger(value.version) ||
    !isInteger(value.index, 0, 18) ||
    value.total !== 18 ||
    typeof value.bingoClosed !== 'boolean' ||
    !isBingo(value.bingo)
  )
    return false;
  if (value.role !== 'host' && value.role !== 'player') return false;
  if (
    !Array.isArray(value.players) ||
    value.players.length > 2 ||
    !value.players.every(isPublicPlayer)
  )
    return false;
  if (new Set(value.players.map((p) => p.id)).size !== value.players.length) return false;
  if (
    value.role === 'host'
      ? value.selfId !== null
      : !value.players.some((p) => p.id === value.selfId)
  )
    return false;
  if (
    !Array.isArray(value.rules) ||
    value.rules.length !== 17 ||
    !value.rules.every(isRule) ||
    !Array.isArray(value.missions) ||
    value.missions.length !== 8 ||
    !value.missions.every(isMission)
  )
    return false;
  if ('token' in value || 'hostToken' in value) return false;
  if (value.bingoClosed && value.phase !== 'finished') return false;
  const players = value.players;
  const hiddenPlayers = () =>
    players.every((p: unknown) => isRecord(p) && !('answer' in p) && !('correct' in p));
  switch (value.phase) {
    case 'lobby':
      return (
        value.question === null &&
        value.index === 0 &&
        value.roundComplete === null &&
        hiddenPlayers()
      );
    case 'break':
      return (
        value.question === null &&
        [6, 12].includes(value.index) &&
        value.roundComplete === value.index &&
        value.players.length === 2 &&
        hiddenPlayers()
      );
    case 'finished':
      return (
        value.question === null &&
        value.index === 18 &&
        value.roundComplete === null &&
        value.players.length === 2 &&
        hiddenPlayers()
      );
    case 'question':
    case 'reveal': {
      if (
        value.index >= 18 ||
        value.players.length !== 2 ||
        value.roundComplete !== null ||
        !isQuestion(value.question) ||
        value.question.period !== Math.floor(value.index / 6) + 1
      )
        return false;
      if (value.phase === 'question')
        return (
          !('correct' in value.question) && !('explanation' in value.question) && hiddenPlayers()
        );
      if (
        !isRecord(value.question) ||
        !isInteger(value.question.correct, 0, 3) ||
        typeof value.question.explanation !== 'string'
      )
        return false;
      const correct = value.question.correct;
      return (
        players.every(isRevealedPlayer) &&
        players.every((p) => p.correct === (p.answer === correct))
      );
    }
    default:
      return false;
  }
}
export function parseSnapshot(value: unknown): GameSnapshot {
  if (!isSnapshot(value))
    throw new ValidationError('Ошибка синхронизации: некорректное состояние игры.');
  return value;
}
export function isVisualChoice(value: unknown): value is VisualChoice {
  return (
    isRecord(value) &&
    isCode(value.code) &&
    isId(value.matchId) &&
    isId(value.selfId) &&
    isInteger(value.index, 0, 17) &&
    isInteger(value.answer, 0, 3)
  );
}
export function parseStreamBlock(block: string): StreamMessage | null {
  const lines = block.split('\n'),
    event = lines
      .find((l) => l.startsWith('event:'))
      ?.slice(6)
      .trim();
  const data = lines
    .filter((l) => l.startsWith('data:'))
    .map((l) => l.slice(5).trimStart())
    .join('\n');
  if (!data) return null;
  const value: unknown = JSON.parse(data);
  if (event === 'room-closed' || event === 'session-ended') {
    if (!isRecord(value) || typeof value.message !== 'string')
      throw new ValidationError('Некорректное событие завершения.');
    return { kind: 'ended', message: value.message };
  }
  if (event && event !== 'message') return null;
  return { kind: 'state', state: parseSnapshot(value) };
}
