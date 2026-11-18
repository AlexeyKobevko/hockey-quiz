import concurrently from 'concurrently';
import net from 'node:net';
import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const envFile = new URL('../.env.local', import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);
function port(name, fallback) {
  const raw = process.env[name] ?? fallback;
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isInteger(value) || value < 1 || value > 65535)
    throw new Error('Invalid ' + name);
  return value;
}
async function available(host, port) {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host, port, exclusive: true }, () => server.close(resolve));
  });
}
try {
  const lan = process.argv.includes('--lan'),
    host = lan ? (process.env.DEV_HOST ?? '0.0.0.0') : '127.0.0.1';
  const clientPort = port('DEV_PORT', '5173'),
    apiPort = port('DEV_API_PORT', '3708');
  if (clientPort === apiPort) throw new Error('DEV_PORT and DEV_API_PORT must differ');
  await available(host, clientPort);
  await available('127.0.0.1', apiPort);
  console.log(`Local: http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${clientPort}`);
  if (lan)
    for (const addresses of Object.values(networkInterfaces()))
      for (const address of addresses ?? [])
        if (
          address.family === 'IPv4' &&
          !address.internal &&
          (host === '0.0.0.0' || address.address === host)
        )
          console.log(`LAN: http://${address.address}:${clientPort}`);
  console.log('Independent dev tabs: ?devSession=host, ?devSession=player-a, ?devSession=player-b');
  const env = {
    ...process.env,
    DEV_LAN: lan ? '1' : '0',
    DEV_HOST: host,
    DEV_PORT: String(clientPort),
    DEV_API_PORT: String(apiPort),
  };
  const commands = [
    ['client', 'npm run dev:client'],
    ['api', 'npm run dev:api'],
    ['types:server', 'npm run dev:types:server'],
    ['types:client', 'npm run dev:types:client'],
  ].map(([name, command]) => ({ name, command, env }));
  const group = concurrently(commands, {
    cwd: root,
    killOthersOn: ['failure', 'success'],
    prefix: 'name',
    successCondition: 'all',
  });
  try {
    await group.result;
  } catch {
    process.exitCode = 1;
  }
} catch (error) {
  console.error('Dev startup failed:', error instanceof Error ? error.message : 'Unknown error');
  process.exitCode = 1;
}
