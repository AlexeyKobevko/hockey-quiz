import type { GameSnapshot, Session, VisualChoice } from '../shared/contracts.js';
import { isSession, isVisualChoice } from '../shared/validation.js';
interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}
const warning = 'Браузер запретил хранение: не закрывай вкладку, чтобы сохранить участие.';
export function createSessionStore(
  dev: boolean,
  search: string,
  local: StorageLike,
  legacy: StorageLike,
) {
  const param = new URLSearchParams(search).get('devSession');
  const namespace = dev && param && /^[\w-]{1,48}$/.test(param) ? param : null;
  const suffix = namespace ? ':dev:' + namespace : '';
  const key = 'hockey-multiplayer-v2' + suffix,
    choiceKey = 'hockey-visual-choice-v1' + suffix;
  function load() {
    let session: Session | null = null,
      error = '';
    try {
      const raw = local.getItem(key) ?? legacy.getItem(key);
      const value: unknown = raw ? JSON.parse(raw) : null;
      if (isSession(value)) {
        session = value;
        local.setItem(key, JSON.stringify(value));
      } else {
        local.removeItem(key);
      }
      legacy.removeItem(key);
    } catch {
      error = warning;
      try {
        local.removeItem(key);
        legacy.removeItem(key);
      } catch {
        /* Storage may be unavailable. */
      }
    }
    return { session, error };
  }
  function save(session: Session | null) {
    try {
      if (session) local.setItem(key, JSON.stringify(session));
      else local.removeItem(key);
      legacy.removeItem(key);
      return '';
    } catch {
      return warning;
    }
  }
  function loadChoice(): VisualChoice | null {
    try {
      const raw = local.getItem(choiceKey);
      const value: unknown = raw ? JSON.parse(raw) : null;
      if (isVisualChoice(value)) return value;
      local.removeItem(choiceKey);
    } catch {
      /* Invalid or blocked storage is presentation-only. */
    }
    return null;
  }
  function saveChoice(choice: VisualChoice | null) {
    try {
      if (choice) local.setItem(choiceKey, JSON.stringify(choice));
      else local.removeItem(choiceKey);
    } catch {
      /* Accepted answers live on the server. */
    }
  }
  function choiceFor(choice: VisualChoice | null, state: GameSnapshot | null) {
    return choice &&
      state &&
      choice.code === state.code &&
      choice.matchId === state.matchId &&
      choice.selfId === state.selfId &&
      choice.index === state.index
      ? choice
      : null;
  }
  function clearedUrl(pathname: string) {
    return (
      pathname + (namespace ? '?' + new URLSearchParams({ devSession: namespace }).toString() : '')
    );
  }
  return { key, choiceKey, namespace, load, save, loadChoice, saveChoice, choiceFor, clearedUrl };
}
