import { createGameServer } from './app.js';
const dev = process.argv.includes('--dev');
const host = dev ? '127.0.0.1' : (process.env.HOST ?? '127.0.0.1');
if (!host || host.trim() !== host) throw new Error('Invalid HOST');
const rawPort = dev ? (process.env.DEV_API_PORT ?? '3708') : (process.env.PORT ?? '3707');
const port = Number(rawPort);
if (!/^\d+$/.test(rawPort) || !Number.isInteger(port) || port < 0 || port > 65535)
  throw new Error('Invalid PORT');
if (process.env.TRUST_PROXY !== undefined && !['0', '1'].includes(process.env.TRUST_PROXY))
  throw new Error('Invalid TRUST_PROXY');
const app = createGameServer({ trustProxy: !dev && process.env.TRUST_PROXY === '1' });
app.server.on('error', (error: NodeJS.ErrnoException) => {
  console.error('Hockey quiz could not listen:', error.code ?? 'error');
  app.dispose();
  process.exitCode = 1;
});
app.server.listen(port, host, () => {
  const address = app.server.address();
  console.log(
    'Hockey quiz API:',
    typeof address === 'object' && address ? `${host}:${address.port}` : host,
  );
});
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  app.dispose();
  const force = setTimeout(() => app.server.closeAllConnections(), 3000);
  force.unref();
  app.server.close(() => clearTimeout(force));
  app.server.closeIdleConnections();
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
