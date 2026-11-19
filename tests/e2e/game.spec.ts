import { test, expect } from '@playwright/test';
import { questions } from '../../src/server/questions.js';
import { assertNoScroll, host, join, ready, session, snapshot } from './helpers.js';

test('Три телефона: полный матч, замена, reconnect, бинго, реванш и close', async ({
  browser,
  baseURL,
}) => {
  expect(baseURL).toBeTruthy();
  const base = baseURL ?? '';
  const h = await host(browser, base, 320),
    ac = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: 'reduce',
    }),
    bc = await browser.newContext({
      viewport: { width: 430, height: 932 },
      reducedMotion: 'reduce',
    });
  try {
    let a = await join(ac, base, h.code, 'Лена <b>');
    const b = await join(bc, base, h.code, 'Оля');
    await expect(h.page.locator('.mname b')).toHaveCount(0);
    await expect(h.page.locator('[data-action=start]')).toBeEnabled();
    await h.page.locator('[data-kick]').first().click();
    await expect(a.locator('#status')).toHaveText('Готовы к игре');
    a = await join(ac, base, h.code, 'Лена <b>');
    await expect(h.page.locator('[data-action=start]')).toBeEnabled();
    await h.page.reload();
    await ready(h.page);
    await expect(h.page.locator('.hugecode')).toHaveText(h.code);
    await h.page.locator('[data-action=start]').click();
    for (let i = 0; i < 18; i++) {
      const q = questions[i];
      expect(q).toBeTruthy();
      if (!q) throw new Error('Missing question');
      for (const p of [a, b, h.page]) await expect(p.locator('.qtext')).toHaveText(q.q);
      await expect(a.locator('.feedback')).toHaveCount(0);
      await assertNoScroll(h.page);
      await assertNoScroll(a);
      await assertNoScroll(b);
      await a.locator(`[data-answer="${q.right}"]`).click();
      await expect(a.locator('[data-answer]:enabled')).toHaveCount(0);
      await expect(b.locator('.feedback')).toHaveCount(0);
      if (i === 0) {
        await a.reload();
        await ready(a);
        await expect(a.locator('.option.chosen')).toHaveCount(1);
        await expect(a.locator('[data-answer]:enabled')).toHaveCount(0);
        await bc.setOffline(true);
        await expect(b.locator('#status')).toHaveText('Переподключаемся…');
        await bc.setOffline(false);
        await ready(b);
      }
      await b.locator(`[data-answer="${(q.right + 1) % 4}"]`).click();
      for (const p of [a, b, h.page]) await expect(p.locator('.feedback')).toBeVisible();
      await expect(a.locator('.score strong')).toHaveText(['0', String(i + 1)]);
      await h.page.locator('[data-action=next]').click();
      if (i === 5 || i === 11) {
        await expect(h.page.getByText('Перерыв между периодами', { exact: true })).toBeVisible();
        await h.page.locator('[data-action=next]').click();
      }
    }
    await expect(a.locator('.podium')).toHaveText('0 : 18');
    await expect(b.locator('.podium')).toHaveText('0 : 18');
    await expect(a.locator('.victory .prize-card')).toContainText('Твоя хоккейная миссия');
    await expect(a.locator('.victory .prize-card')).toContainText('Красно-синий — самый сильный!');
    await expect(b.locator('.victory .prize-card')).toContainText('Ты победила в квизе');
    await expect(b.locator('.victory .prize-card')).toContainText('угощение');
    await expect(h.page.locator('.victory .prize-host-row')).toHaveCount(2);
    await a.locator('[data-tab=bingo]').click();
    await b.locator('[data-tab=bingo]').click();
    await expect(a.locator('.prize-teaser')).toContainText('СЕКРЕТНЫЙ ПРИЗ');
    await expect(a.locator('.prize-teaser')).not.toContainText('банкнота');
    await a.locator('[data-mission="0"]').click();
    await expect(a.locator('.mission.done')).toHaveCount(1);
    await expect(b.locator('.mission.done')).toHaveCount(0);
    await h.page.locator('[data-tab=bingo]').click();
    await expect(h.page.locator('.bingo-host-row').nth(1).locator('.bingo-host-mark')).toHaveText(['✓', '—']);
    await expect(h.page.locator('.bingo-total span')).toHaveText(['1 / 8', '0 / 8']);
    await h.page.locator('[data-action=finish-bingo]').click();
    await expect(a.locator('.mission:disabled')).toHaveCount(8);
    await expect(b.locator('.mission:disabled')).toHaveCount(8);
    await expect(h.page.locator('.feedback')).toContainText('победительница бинго');
    await expect(a.locator('.prize-card')).toContainText('СЕКРЕТНЫЙ ПРИЗ РАЗБЛОКИРОВАН');
    await expect(b.locator('.prize-card')).toContainText('трофей достался сопернице');
    await expect(h.page.locator('.prize-results .note')).toContainText('коллекционную банкноту ЦСКА');
    await a.reload();
    await ready(a);
    await a.locator('[data-tab=bingo]').click();
    await expect(a.locator('.mission.done')).toHaveCount(1);
    await h.page.locator('[data-tab=game]').click();
    await h.page.locator('[data-action=restart]').click();
    await expect(h.page.locator('.hugecode')).toHaveText(h.code);
    await h.page.locator('[data-action=start]').click();
    await expect(h.page.locator('.qtext')).toBeVisible();
    await h.page.locator('[data-action=reveal]').click();
    await expect(h.page.locator('.feedback')).toBeVisible();
    await h.page.locator('[data-action=close]').click();
    for (const p of [h.page, a, b]) await expect(p.locator('#status')).toHaveText('Готовы к игре');
    await h.page.locator('[data-action=create]').click();
    await ready(h.page);
    await h.page.locator('[data-action=leave]').click();
    await expect(h.page.locator('#status')).toHaveText('Готовы к игре');
    await h.page.reload();
    await expect(h.page.locator('.hugecode')).toHaveCount(0);
  } finally {
    await h.context.close();
    await ac.close();
    await bc.close();
  }
});

test('Потерянный HTTP-ответ и поздний ответ не портят следующий вопрос', async ({
  browser,
  baseURL,
}) => {
  const h = await host(browser, baseURL ?? ''),
    ac = await browser.newContext(),
    bc = await browser.newContext();
  try {
    const a = await join(ac, baseURL ?? '', h.code, 'Первая'),
      b = await join(bc, baseURL ?? '', h.code, 'Вторая');
    await expect(h.page.locator('[data-action=start]')).toBeEnabled();
    await h.page.locator('[data-action=start]').click();
    await expect(a.locator('.qtext')).toBeVisible();
    let release: () => void = () => {};
    let accepted: () => void = () => {};
    const held = new Promise<void>((r) => {
        release = r;
      }),
      arrived = new Promise<void>((r) => {
        accepted = r;
      });
    await a.route('**/api/answer', async (route) => {
      const response = await route.fetch();
      accepted();
      await held;
      await route.fulfill({ response });
    });
    await a.locator('[data-answer="1"]').click();
    await arrived;
    await b.locator('[data-answer="1"]').click();
    await expect(h.page.locator('.feedback')).toBeVisible();
    await h.page.locator('[data-action=next]').click();
    await expect(a.locator('.qtext')).toHaveText(questions[1]?.q ?? '');
    release();
    await expect(a.locator('.option.chosen')).toHaveCount(0);
    await a.unroute('**/api/answer');
    await a.route('**/api/answer', async (route) => {
      await route.fetch();
      await route.abort();
    });
    await a.locator('[data-answer="1"]').click();
    await a.reload();
    await ready(a);
    await expect(a.locator('[data-answer]:enabled')).toHaveCount(0);
    await expect(a.getByText('Твой ответ принят', { exact: true })).toBeVisible();
    await h.page.locator('[data-action=close]').click();
  } finally {
    await h.context.close();
    await ac.close();
    await bc.close();
  }
});

test('Невалидный снимок, повреждённый storage и production devSession', async ({
  browser,
  baseURL,
}) => {
  const h = await host(browser, baseURL ?? '');
  try {
    const auth = await session(h.page),
      valid = await snapshot(h.page, auth);
    await h.page.route('**/api/state?*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...valid, phase: 'unknown' }),
      }),
    );
    await h.page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(h.page.locator('.msg')).toContainText('Ошибка синхронизации');
    await expect(h.page.locator('.hugecode')).toHaveText(h.code);
    await expect(h.page.locator('.victory')).toHaveCount(0);
    await h.page.unroute('**/api/state?*');
    await h.page.evaluate(() => window.dispatchEvent(new Event('online')));
    await ready(h.page);
    await h.page.goto((baseURL ?? '') + '/?devSession=ignored');
    await ready(h.page);
    await expect(h.page.locator('.hugecode')).toHaveText(h.code);
    await h.page.locator('[data-action=close]').click();
    await h.page.evaluate(() => localStorage.setItem('hockey-multiplayer-v2', '{bad'));
    await h.page.reload();
    await expect(h.page.locator('[data-action=create]')).toBeVisible();
    await expect(h.page.locator('.hugecode')).toHaveCount(0);
  } finally {
    await h.context.close();
  }
});

for (const width of [320, 375, 390, 430])
  test('Мобильная композиция ' + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const errors: string[] = [],
      failed: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('response', (r) => {
      if (r.status() >= 400) failed.push(r.url());
    });
    page.on('request', (r) => expect(r.url()).not.toMatch(/[?&]token=/));
    await page.goto('/');
    await expect(page.locator('.hero-header')).toBeVisible();
    await expect(page.locator('.game-intro #status')).toHaveText('Готовы к игре');
    await assertNoScroll(page);
    const art = page.locator('.hero-art img');
    await art.evaluate(async (img) => {
      if (img instanceof HTMLImageElement) await img.decode();
    });
    const metrics = await page.evaluate(() => {
      const hero = document.querySelector('.hero-header'),
        title = document.querySelector('.hero-title'),
        art = document.querySelector('.hero-art img');
      if (!hero || !title || !art) throw new Error('Missing hero');
      const h = hero.getBoundingClientRect(),
        t = title.getBoundingClientRect(),
        a = art.getBoundingClientRect();
      return {
        mask: getComputedStyle(art).maskImage,
        width: h.width,
        height: h.height,
        inside: t.left >= h.left && t.right <= h.right,
        right: a.right > h.right,
      };
    });
    expect(metrics.mask).toBe('none');
    expect(metrics.inside).toBe(true);
    expect(metrics.right).toBe(true);
    await page.locator('[data-tab=rules]').click();
    await expect(page.locator('.rule')).toHaveCount(17);
    await assertNoScroll(page);
    expect(errors).toEqual([]);
    expect(failed).toEqual([]);
  });
