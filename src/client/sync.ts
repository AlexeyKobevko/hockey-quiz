import type { GameSnapshot, Session } from '../shared/contracts.js';
import {
  isApiError,
  parseSnapshot,
  parseStreamBlock,
  ValidationError,
} from '../shared/validation.js';
interface Callbacks {
  session: () => Session | null;
  state: (s: GameSnapshot) => void;
  status: (online: boolean) => void;
  ended: (message: string) => void;
  error: (message: string) => void;
}
export function createSync(callbacks: Callbacks) {
  let generation = 0,
    stream: AbortController | null = null,
    retry: ReturnType<typeof setTimeout> | null = null,
    heartbeat: ReturnType<typeof setTimeout> | null = null,
    delay = 1500;
  function stop() {
    generation++;
    if (retry) clearTimeout(retry);
    if (heartbeat) clearTimeout(heartbeat);
    retry = null;
    heartbeat = null;
    stream?.abort();
    stream = null;
  }
  async function connect() {
    const session = callbacks.session();
    if (!session || document.hidden || !navigator.onLine) return;
    stop();
    const current = generation,
      controller = new AbortController();
    stream = controller;
    callbacks.status(false);
    const alive = () => generation === current && callbacks.session() === session;
    const pulse = () => {
      if (heartbeat) clearTimeout(heartbeat);
      heartbeat = setTimeout(() => controller.abort(), 45000);
    };
    const accept = (value: unknown) => {
      const state = parseSnapshot(value);
      if (state.code !== session.code || state.role !== session.role)
        throw new ValidationError('Несовместимое участие. Обнови страницу.');
      callbacks.state(state);
    };
    let wait = delay;
    try {
      pulse();
      const headers = { Authorization: 'Bearer ' + session.token },
        query = new URLSearchParams({ code: session.code });
      const response = await fetch('/api/state?' + query.toString(), {
        headers,
        signal: controller.signal,
        cache: 'no-store',
      });
      const value: unknown = await response.json();
      if (!alive()) return;
      if (response.status === 403 || response.status === 404) {
        callbacks.ended(isApiError(value) ? value.error : 'Комната больше недоступна.');
        return;
      }
      if (!response.ok) throw new Error(isApiError(value) ? value.error : 'Нет соединения');
      accept(value);
      const events = await fetch('/api/events?' + query.toString(), {
        headers,
        signal: controller.signal,
        cache: 'no-store',
      });
      if (!alive()) return;
      if (events.status === 403 || events.status === 404) {
        callbacks.ended('Комната закрыта или участие завершено.');
        return;
      }
      if (events.status === 429) {
        const seconds = Number(events.headers.get('Retry-After'));
        if (Number.isFinite(seconds) && seconds > 0) wait = Math.max(wait, seconds * 1000);
      }
      if (!events.ok || !events.body)
        throw new Error(
          events.status === 429
            ? 'Лишние подключения: закрой другие вкладки игры.'
            : 'Нет соединения',
        );
      callbacks.status(true);
      delay = 1500;
      wait = 1500;
      pulse();
      const reader = events.body.getReader(),
        decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const part = await reader.read();
        if (!alive()) return;
        if (part.done) throw new Error('Соединение прервалось');
        pulse();
        buffer += decoder.decode(part.value, { stream: true }).replace(/\r\n/g, '\n');
        let end: number;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const message = parseStreamBlock(block);
          if (!message) continue;
          if (message.kind === 'ended') {
            callbacks.ended(message.message);
            return;
          }
          accept(message.state);
          callbacks.status(true);
        }
      }
    } catch (error) {
      if (!alive()) return;
      callbacks.status(false);
      callbacks.error(
        error instanceof ValidationError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Нет соединения',
      );
      if (heartbeat) clearTimeout(heartbeat);
      controller.abort();
      stream = null;
      retry = setTimeout(() => {
        if (alive()) void connect();
      }, wait);
      delay = Math.min(15000, delay * 2);
    }
  }
  return {
    connect,
    stop,
    get active() {
      return stream !== null;
    },
  };
}
