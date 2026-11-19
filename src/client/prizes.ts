import type { PublicPlayer } from '../shared/contracts.js';

export type PrizeKind = 'winner' | 'runner-up' | 'tie';
export interface PrizeMessage {
  kind: PrizeKind;
  title: string;
  description: string;
}

/** Rewards are computed from the server's final scores, not local browser state. */
function placeFor(
  players: readonly PublicPlayer[],
  selfId: string,
  points: (player: PublicPlayer) => number,
): PrizeKind | null {
  if (players.length !== 2) return null;
  const self = players.find((player) => player.id === selfId);
  const opponent = players.find((player) => player.id !== selfId);
  if (!self || !opponent) return null;
  if (points(self) === points(opponent)) return 'tie';
  return points(self) > points(opponent) ? 'winner' : 'runner-up';
}

const quizPrizes: Record<PrizeKind, PrizeMessage> = {
  winner: {
    kind: 'winner',
    title: '🏆 Ты победила в квизе!',
    description:
      'Твой приз — любое угощение или безалкогольный напиток на арене за счёт ведущего. Выбирай!',
  },
  'runner-up': {
    kind: 'runner-up',
    title: '😈 Твоя хоккейная миссия',
    description:
      'Тебе выпало первой прокричать на динамовской трибуне: «Красно-синий — самый сильный!» По желанию и без конфликтов с соседями. 😁',
  },
  tie: {
    kind: 'tie',
    title: '🤝 Ничья! Две чемпионки!',
    description:
      'Вам обеим полагается угощение или безалкогольный напиток за счёт ведущего. А «Красно-синий — самый сильный!» кричите хором! 😁',
  },
};

const bingoPrizes: Record<PrizeKind, PrizeMessage> = {
  winner: {
    kind: 'winner',
    title: '🎁 СЕКРЕТНЫЙ ПРИЗ РАЗБЛОКИРОВАН!',
    description:
      'За выдающуюся хоккейную зоркость тебе присуждается главный трофей вечера! Главный арбитр, немедленно предъявите награду! 😈',
  },
  'runner-up': {
    kind: 'runner-up',
    title: '🏒 Бинго завершено!',
    description:
      'На этот раз секретный трофей достался сопернице. Но твоя хоккейная зоркость заслуживает уважения!',
  },
  tie: {
    kind: 'tie',
    title: '🎁 ДВА СЕКРЕТНЫХ ПРИЗА РАЗБЛОКИРОВАНЫ!',
    description:
      'Ничья! Вы обе заслужили главный трофей вечера. Главный арбитр, предъявите награды обеим чемпионкам! 😈',
  },
};

export function quizPrizeFor(
  players: readonly PublicPlayer[],
  selfId: string,
): PrizeMessage | null {
  const place = placeFor(players, selfId, (player) => player.score);
  return place ? quizPrizes[place] : null;
}

export function bingoPrizeFor(
  players: readonly PublicPlayer[],
  selfId: string,
): PrizeMessage | null {
  const place = placeFor(players, selfId, (player) => player.bingo.length);
  return place ? bingoPrizes[place] : null;
}
