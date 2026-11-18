import type { Ack, Endpoint, Session } from '../shared/contracts.js';
import { isAck, isApiError, isSession, ValidationError } from '../shared/validation.js';
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function post(
  endpoint: Endpoint,
  data: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<Session | Ack> {
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  if (signal?.aborted) cancel();
  else signal?.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 15000);
  try {
    const response = await fetch('/api/' + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: controller.signal,
    });
    const body: unknown = await response.json();
    if (!response.ok)
      throw new HttpError(
        response.status,
        isApiError(body) ? body.error : `Ошибка ${response.status}`,
      );
    if (endpoint === 'create' || endpoint === 'join') {
      if (!isSession(body)) throw new ValidationError('Некорректное участие в ответе сервера.');
      return body;
    }
    if (!isAck(body)) throw new ValidationError('Некорректный ответ сервера.');
    return body;
  } catch (error) {
    if (timedOut) throw new HttpError(0, 'Связь прервалась. Дождись обновления перед повтором.');
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', cancel);
  }
}
