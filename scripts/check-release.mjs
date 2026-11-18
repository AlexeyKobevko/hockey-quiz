import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, cp, rm, readdir, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const temporary = await mkdtemp(path.join(tmpdir(), 'hockey-release-'));
await cp(new URL('../dist/', import.meta.url), temporary, { recursive: true });
const child = spawn(process.execPath, ['server/main.js'], {
  cwd: temporary,
  env: { ...process.env, HOST: '127.0.0.1', PORT: '0', TRUST_PROXY: '0' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '',
  diagnostic = '';
child.stdout.on('data', (chunk) => {
  output += String(chunk);
});
child.stderr.on('data', (chunk) => {
  diagnostic += String(chunk);
});
const exited = new Promise((resolve) =>
  child.once('exit', (code, signal) => resolve({ code, signal })),
);
const deadline = Date.now() + 15000;
try {
  while (!/Hockey quiz API: 127\.0\.0\.1:\d+/.test(output)) {
    if (child.exitCode !== null || Date.now() > deadline)
      throw new Error('Release did not start: ' + diagnostic);
    await new Promise((r) => setTimeout(r, 20));
  }
  const match = output.match(/127\.0\.0\.1:(\d+)/);
  assert.ok(match);
  const base = 'http://127.0.0.1:' + match[1];
  for (const dir of ['node_modules', 'src'])
    await assert.rejects(() => access(path.join(temporary, dir)));
  const html = await (await fetch(base)).text();
  assert.ok(html.includes('Судья, ты чего?!'));
  for (const [, resource] of html.matchAll(/(?:src|href)="([^"]+)"/g))
    if (resource?.startsWith('/'))
      assert.equal((await fetch(base + resource)).status, 200, resource);
  for (const resource of [
    '/assets/cska.svg',
    '/assets/dynamo.png',
    '/assets/rink-bg.webp',
    '/assets/hero-hockey-rivals.webp',
  ])
    assert.equal((await fetch(base + resource)).status, 200);
  for (const resource of [
    '/server/main.js',
    '/shared/content.js',
    '/.env',
    '/server.js',
    '/rules.js',
    '/%2e%2e%2fserver/main.js',
    '/assets/missing.js',
  ])
    assert.equal((await fetch(base + resource)).status, 404, resource);
  assert.equal((await fetch(base + '/api/health')).status, 200);
  const files = await readdir(path.join(temporary, 'client/assets'));
  let bundle = '';
  for (const file of files)
    if (file.endsWith('.js'))
      bundle += await readFile(path.join(temporary, 'client/assets', file), 'utf8');
  const { questions } = await import(
    pathToFileURL(path.join(temporary, 'server/questions.js')).href
  );
  assert.ok(!bundle.includes(questions[0].q));
  const created = await fetch(base + '/api/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.equal(created.status, 201);
  const host = await created.json();
  const controller = new AbortController();
  const events = await fetch(base + '/api/events?code=' + host.code, {
    headers: { Authorization: 'Bearer ' + host.token },
    signal: controller.signal,
  });
  assert.equal(events.status, 200);
  assert.ok(events.body);
  const reader = events.body.getReader();
  await reader.read();
  child.kill(process.argv.includes('--sigint') ? 'SIGINT' : 'SIGTERM');
  let end = '';
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    end += new TextDecoder().decode(next.value);
  }
  assert.ok(end.includes('room-closed'));
  const result = await Promise.race([
    exited,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Shutdown timeout')), 6000).unref(),
    ),
  ]);
  assert.equal(result.code, 0);
  controller.abort();
  await assert.rejects(() => fetch(base + '/api/health'));
  console.log('Release: standalone start, HTML/assets, private paths, SSE and signal cleanup PASS');
} finally {
  if (child.exitCode === null) {
    child.kill('SIGTERM');
    await Promise.race([exited, new Promise((r) => setTimeout(r, 4000))]);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
  await rm(temporary, { recursive: true, force: true });
}
