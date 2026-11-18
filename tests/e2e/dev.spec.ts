import { test, expect } from '@playwright/test';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { ready, assertNoScroll } from './helpers.js';
import { questions } from '../../src/server/questions.js';
test('Dev: обычные вкладки, CSS HMR, reload, диагностика и backend watch', async ({
  context,
  baseURL,
}) => {
  test.setTimeout(240000);
  const base = baseURL ?? '';
  const h = await context.newPage(),
    a = await context.newPage(),
    b = await context.newPage();
  for (const p of [h, a, b])
    p.on('dialog', (d) => {
      void d.accept();
    });
  const cssPath = 'src/client/styles.css',
    mainPath = 'src/client/main.ts',
    backendPath = 'src/server/questions.ts',
    probePath = 'src/client/e2e-diagnostic-probe.ts';
  const probe = 'export const probe = true;\nif (import.meta.hot) import.meta.hot.accept();\n';
  let createdProbe = false;
  const [css, main, backend] = await Promise.all([
    readFile(cssPath, 'utf8'),
    readFile(mainPath, 'utf8'),
    readFile(backendPath, 'utf8'),
  ]);
  try {
    await h.goto(base + '/?devSession=host');
    await h.locator('[data-action=create]').click();
    await ready(h);
    const code = (await h.locator('.hugecode').innerText()).trim();
    await h.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    });
    const fallback = h.waitForEvent('dialog');
    await h.locator('[data-action=share]').click();
    const invitation = new URL((await fallback).defaultValue());
    expect(invitation.origin).toBe(new URL(base).origin);
    expect(invitation.searchParams.get('room')).toBe(code);
    expect(invitation.searchParams.has('devSession')).toBe(false);
    const logLength = (await readFile('test-results/dev-server.log', 'utf8')).length;
    const typeReload = h.waitForEvent('domcontentloaded');
    await writeFile(mainPath, main + '\nexport const developmentTypeProbe: string = 7;\n');
    await typeReload;
    await ready(h);
    await expect(h.locator('.hugecode')).toHaveText(code);
    await expect
      .poll(
        async () => {
          const log = await readFile('test-results/dev-server.log', 'utf8');
          return log.slice(logLength).includes('TS2322');
        },
        { timeout: 45000 },
      )
      .toBe(true);
    await writeFile(probePath, probe, { flag: 'wx' });
    createdProbe = true;
    const probeReload = h.waitForEvent('domcontentloaded');
    const connected = h.waitForEvent('console', {
      predicate: (message) => message.text() === '[vite] connected.',
    });
    await writeFile(mainPath, main + "\nimport './e2e-diagnostic-probe.js';\n");
    await probeReload;
    await connected;
    await ready(h);
    await writeFile(probePath, 'export const =\n');
    await expect(h.locator('vite-error-overlay')).toBeVisible({ timeout: 30000 });
    await writeFile(probePath, probe);
    await expect(h.locator('vite-error-overlay')).toHaveCount(0, { timeout: 30000 });
    const restoredReload = h.waitForEvent('domcontentloaded');
    await writeFile(mainPath, main);
    await restoredReload;
    await ready(h);
    for (const [p, name, ns] of [
      [a, 'Первая', 'player-a'],
      [b, 'Вторая', 'player-b'],
    ] as const) {
      await p.goto(base + '/?devSession=' + ns + '&room=' + code);
      await p.locator('#nickname').fill(name);
      await p.locator('#joinForm button').click();
      await ready(p);
    }
    await expect(h.locator('.hugecode')).toHaveText(code);
    await expect(h.locator('[data-action=start]')).toBeEnabled();
    await h.locator('[data-action=start]').click();
    await expect(a.locator('.qtext')).toBeVisible();
    await expect(b.locator('.qtext')).toBeVisible();
    await a.locator('[data-answer="1"]').click();
    await expect(a.locator('.option.chosen')).toHaveCount(1);
    const origin = await a.evaluate(() => performance.timeOrigin);
    await writeFile(cssPath, css + '\n.hero-header { --hmr-probe: 1; }\n');
    await expect
      .poll(() =>
        a
          .locator('.hero-header')
          .evaluate((el) => getComputedStyle(el).getPropertyValue('--hmr-probe').trim()),
      )
      .toBe('1');
    expect(await a.evaluate(() => performance.timeOrigin)).toBe(origin);
    const reload = a.waitForEvent('domcontentloaded');
    await writeFile(mainPath, main + '\n// Client reload probe\n');
    await reload;
    await ready(a);
    await expect(a.locator('.option.chosen')).toHaveCount(1);
    await expect(b.locator('.qtext')).toBeVisible();
    for (let index = 0; index < questions.length; index++) {
      const question = questions[index];
      if (!question) throw new Error('Missing test question');
      for (const page of [h, a, b]) await expect(page.locator('.qtext')).toHaveText(question.q);
      if (index > 0) await a.locator(`[data-answer="${question.right}"]`).click();
      await b.locator(`[data-answer="${(question.right + 1) % 4}"]`).click();
      await expect(h.locator('.feedback')).toBeVisible();
      await expect(a.locator('.score strong')).toHaveText([String(index + 1), '0']);
      await h.locator('[data-action=next]').click();
      if (index === 5 || index === 11) {
        await expect(h.getByText('Перерыв между периодами', { exact: true })).toBeVisible();
        await h.locator('[data-action=next]').click();
      }
    }
    await expect(a.locator('.podium')).toHaveText('18 : 0');
    await a.locator('[data-tab=bingo]').click();
    await b.locator('[data-tab=bingo]').click();
    await a.locator('[data-mission="0"]').click();
    await expect(a.locator('.mission.done')).toHaveCount(1);
    await expect(b.locator('.mission.done')).toHaveCount(0);
    await a.locator('[data-action=leave]').click();
    await expect(a.locator('#status')).toHaveText('Готовы к игре');
    await a.reload();
    await expect(a.locator('#status')).toHaveText('Готовы к игре');
    await ready(h);
    await ready(b);
    await writeFile(backendPath, backend + '\n// Backend restart probe\n');
    await expect(h.locator('#status')).toHaveText('Готовы к игре', { timeout: 30000 });
    await expect
      .poll(
        async () => {
          try {
            return (await h.request.get('/api/health')).status();
          } catch {
            return 0;
          }
        },
        { timeout: 30000 },
      )
      .toBe(200);
    await h.locator('[data-action=create]').click();
    await ready(h);
    await h.locator('[data-action=close]').click();
    await expect(a.locator('#status')).toHaveText('Готовы к игре');
    expect(new URL(a.url()).searchParams.get('devSession')).toBe('player-a');
    await assertNoScroll(a);
  } finally {
    await writeFile(cssPath, css);
    await writeFile(mainPath, main);
    await writeFile(backendPath, backend);
    if (createdProbe) await rm(probePath);
  }
});
