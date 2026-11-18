import { spawnSync } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
function run(file, args) {
  const result = spawnSync(process.execPath, [file, ...args], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const tsc = fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url));
for (const config of ['tsconfig.server.json', 'tsconfig.client.json', 'tsconfig.tools.json'])
  run(tsc, ['-p', config, '--noEmit']);
await rm(new URL('../dist/', import.meta.url), { recursive: true, force: true });
run(tsc, ['-p', 'tsconfig.server.json']);
run(fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)), ['build']);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
await writeFile(
  new URL('../dist/package.json', import.meta.url),
  JSON.stringify(
    {
      name: pkg.name,
      version: pkg.version,
      type: 'module',
      private: true,
      license: pkg.license,
      engines: pkg.engines,
      scripts: { start: 'node server/main.js' },
    },
    null,
    2,
  ) + '\n',
);
console.log('Release ready: dist/ (npm start inside this directory requires only Node).');
