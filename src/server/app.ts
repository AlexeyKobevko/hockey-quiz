import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isCode, isEndpoint, parseCommand, ValidationError } from '../shared/validation.js';
import { GameError } from './game.js';
import { authenticate, createRoomStore } from './rooms.js';
import { createSseHub, snapshot } from './sse.js';
export interface Policy {
  requests: number;
  windowMs: number;
  creates: number;
  createWindowMs: number;
  ssePerToken: number;
  ssePerRoom: number;
  sseTotal: number;
  rooms: number;
}
interface Options {
  now?: () => number;
  limits?: Partial<Policy>;
  trustProxy?: boolean;
  clientDir?: string;
  heartbeatMs?: number;
  onError?: (error: unknown) => void;
}
const defaults: Policy = {
  requests: 240,
  windowMs: 60000,
  creates: 8,
  createWindowMs: 600000,
  ssePerToken: 3,
  ssePerRoom: 12,
  sseTotal: 1000,
  rooms: 3000,
};
export function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0,
      failed = false;
    req.on('data', (chunk: Buffer) => {
      if (failed) return;
      bytes += chunk.length;
      if (bytes > 4096) {
        failed = true;
        chunks.length = 0;
        reject(new ValidationError('Слишком большой запрос: предел 4096 байт.'));
      } else chunks.push(chunk);
    });
    req.on('end', () => {
      if (failed) return;
      try {
        const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        resolve(value);
      } catch {
        reject(new ValidationError('Некорректный JSON.'));
      }
    });
    req.on('error', reject);
    req.on('aborted', () => reject(new ValidationError('Запрос прерван.')));
  });
}
export function createGameServer(options: Options = {}) {
  const now = options.now ?? Date.now,
    policy = { ...defaults, ...options.limits },
    trustProxy = options.trustProxy ?? false;
  const clientDir = path.resolve(
    options.clientDir ?? fileURLToPath(new URL('../client/', import.meta.url)),
  );
  const hub = createSseHub(policy, now, options.heartbeatMs);
  const store = createRoomStore({
    now,
    maxRooms: policy.rooms,
    onPublish: hub.publish,
    onClose: hub.closeRoom,
    onKick: hub.closeToken,
  });
  const buckets = new Map<string, { count: number; until: number }>();
  function take(key: string, max: number, duration: number) {
    let b = buckets.get(key);
    if (!b || now() >= b.until) {
      if (!b && buckets.size >= 10000) return false;
      b = { count: 0, until: now() + duration };
      buckets.set(key, b);
    }
    return ++b.count <= max;
  }
  function send(res: ServerResponse, status: number, value: unknown) {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify(value));
  }
  function fail(res: ServerResponse, status: number, message: string, code: string) {
    send(res, status, { error: message, code });
  }
  function cleanupRooms() {
    store.cleanupRooms();
    for (const [key, b] of buckets) if (now() >= b.until) buckets.delete(key);
  }
  async function serve(res: ServerResponse, pathname: string) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      throw new ValidationError('Некорректный путь.');
    }
    if (decoded.includes('\0') || decoded.split('/').some((s) => s.startsWith('.')))
      throw new GameError('not_found', 'Страница не найдена.');
    const requested = path.resolve(clientDir, '.' + (decoded === '/' ? '/index.html' : decoded));
    if (!requested.startsWith(clientDir + path.sep))
      throw new GameError('not_found', 'Страница не найдена.');
    try {
      const [root, filename] = await Promise.all([realpath(clientDir), realpath(requested)]);
      if (!filename.startsWith(root + path.sep))
        throw new GameError('not_found', 'Страница не найдена.');
      const file = await open(filename, 'r');
      const stat = await file.stat();
      if (!stat.isFile()) {
        await file.close();
        throw new GameError('not_found', 'Страница не найдена.');
      }
      const types: Record<string, string> = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.ico': 'image/x-icon',
        '.woff2': 'font/woff2',
        '.mp3': 'audio/mpeg',
      };
      const type = types[path.extname(filename)];
      if (!type) {
        await file.close();
        throw new GameError('not_found', 'Страница не найдена.');
      }
      res.writeHead(200, {
        'Content-Type': type,
        'Content-Length': stat.size,
        'Cache-Control': 'no-store',
      });
      const stream = file.createReadStream();
      stream.on('error', () => res.destroy());
      res.on('close', () => stream.destroy());
      stream.pipe(res);
    } catch (e) {
      if (e instanceof GameError) throw e;
      throw new GameError('not_found', 'Страница не найдена.');
    }
  }
  async function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://localhost'),
      pathname = url.pathname;
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    );
    const peer = req.socket.remoteAddress ?? 'unknown',
      local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer);
    const forwarded = req.headers['x-forwarded-for'];
    const ip =
      trustProxy && local && typeof forwarded === 'string'
        ? (forwarded.split(',').at(-1)?.trim() ?? peer)
        : peer;
    if (pathname.startsWith('/api/') && pathname !== '/api/health') {
      if (!take('req:' + ip, policy.requests, policy.windowMs)) {
        res.setHeader('Retry-After', '60');
        return fail(res, 429, 'Слишком много запросов. Подожди минуту.', 'rate_limited');
      }
      if (
        req.method === 'POST' &&
        pathname === '/api/create' &&
        !take('create:' + ip, policy.creates, policy.createWindowMs)
      ) {
        res.setHeader('Retry-After', '600');
        return fail(
          res,
          429,
          'Слишком много новых комнат. Попробуй через 10 минут.',
          'rate_limited',
        );
      }
    }
    const proto =
      trustProxy && local && req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    if (
      req.method === 'POST' &&
      req.headers.origin &&
      req.headers.origin !== `${proto}://${req.headers.host ?? ''}`
    )
      return fail(res, 403, 'Запрос с другого сайта запрещён.', 'forbidden');
    if (req.method === 'GET' && pathname === '/api/health')
      return send(res, 200, { ok: true, rooms: store.rooms.size });
    if (req.method === 'GET' && (pathname === '/api/state' || pathname === '/api/events')) {
      const code = url.searchParams.get('code');
      if (!isCode(code)) throw new ValidationError('Неверный код комнаты.');
      const token = req.headers.authorization?.replace(/^Bearer /, '') ?? '';
      const room = store.find(code);
      authenticate(room, token);
      if (pathname === '/api/state') return send(res, 200, snapshot(room, token));
      hub.connect(req, res, room, token);
      return;
    }
    if (req.method === 'POST' && pathname.startsWith('/api/')) {
      const endpoint = pathname.slice(5);
      if (!isEndpoint(endpoint)) throw new GameError('not_found', 'Страница не найдена.');
      const command = parseCommand(endpoint, await parseBody(req));
      const result = store.handle(command);
      return send(res, command.kind === 'create' || command.kind === 'join' ? 201 : 200, result);
    }
    if (req.method === 'GET' && !pathname.startsWith('/api/')) return serve(res, pathname);
    throw new GameError('not_found', 'Страница не найдена.');
  }
  const server = http.createServer((req, res) => {
    void handle(req, res).catch((error: unknown) => {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      if (error instanceof ValidationError) return fail(res, 400, error.message, 'invalid_request');
      if (error instanceof GameError) {
        const status = { forbidden: 403, not_found: 404, conflict: 409, rate_limited: 429 }[
          error.kind
        ];
        if (status === 429) res.setHeader('Retry-After', '60');
        return fail(res, status, error.message, error.kind);
      }
      if (options.onError) options.onError(error);
      else
        console.error('Unhandled request error', error instanceof Error ? error.name : 'Unknown');
      fail(res, 500, 'Внутренняя ошибка сервера. Попробуй позже.', 'internal_error');
    });
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  server.maxHeadersCount = 32;
  server.maxConnections = 256;
  const cleanup = setInterval(cleanupRooms, 60000);
  cleanup.unref();
  const dispose = () => {
    clearInterval(cleanup);
    store.dispose();
  };
  server.on('close', dispose);
  return { server, rooms: store.rooms, cleanupRooms, dispose, buckets, hub };
}
