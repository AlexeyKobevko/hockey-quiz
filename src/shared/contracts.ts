export type Role = 'host' | 'player';
export type Phase = 'lobby' | 'question' | 'reveal' | 'break' | 'finished';
export interface Session {
  code: string;
  token: string;
  role: Role;
}
export interface Rule {
  id: string;
  title: string;
  text: string;
}
export interface Mission {
  icon: string;
  title: string;
  desc: string;
}
export interface PublicQuestion {
  text: string;
  options: string[];
  period: number;
}
export interface RevealedQuestion extends PublicQuestion {
  correct: number;
  explanation: string;
}
export interface PublicPlayer {
  id: string;
  name: string;
  score: number;
  answered: boolean;
  bingo: number[];
}
export interface RevealedPlayer extends PublicPlayer {
  answer: number;
  correct: boolean;
}
export interface SnapshotBase {
  code: string;
  matchId: string;
  version: number;
  role: Role;
  selfId: string | null;
  index: number;
  total: number;
  bingo: number[];
  missions: Mission[];
  rules: Rule[];
  roundComplete: number | null;
  /** Quiz is finished; host may independently close bingo after the real match. */
  bingoClosed: boolean;
}
export type GameSnapshot = SnapshotBase &
  (
    | { phase: 'lobby' | 'break' | 'finished'; question: null; players: PublicPlayer[] }
    | { phase: 'question'; question: PublicQuestion; players: PublicPlayer[] }
    | { phase: 'reveal'; question: RevealedQuestion; players: RevealedPlayer[] }
  );
export type QuestionSnapshot = Extract<GameSnapshot, { phase: 'question' | 'reveal' }>;
export interface AuthFields {
  code: string;
  token: string;
}
export interface MatchFields extends AuthFields {
  matchId: string;
}
export interface HostFields extends MatchFields {
  version: number;
}
export type HostAction = 'start' | 'reveal' | 'next' | 'restart' | 'kick' | 'close' | 'finish-bingo';
export type Endpoint = 'create' | 'join' | HostAction | 'answer' | 'bingo';
export type Command =
  | { kind: 'create' }
  | { kind: 'join'; code: string; name: string }
  | ({ kind: Exclude<HostAction, 'kick'> } & HostFields)
  | ({ kind: 'kick'; playerId: string } & HostFields)
  | ({ kind: 'answer'; index: number; answer: number } & MatchFields)
  | ({ kind: 'bingo'; mission: number } & MatchFields);
export interface ApiError {
  error: string;
  code: string;
}
export interface Ack {
  ok: true;
}
export type StreamMessage =
  { kind: 'state'; state: GameSnapshot } | { kind: 'ended'; message: string };
export interface VisualChoice {
  code: string;
  matchId: string;
  selfId: string;
  index: number;
  answer: number;
}
