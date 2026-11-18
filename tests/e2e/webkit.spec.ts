import { test, expect } from '@playwright/test';
import { host, join, ready, assertNoScroll } from './helpers.js';
test('WebKit: SSE, reload, offline/online и закрытие на мобильном экране', async ({
  browser,
  baseURL,
}) => {
  const h = await host(browser, baseURL ?? '', 390, true),
    aContext = await browser.newContext({
      viewport: { width: 375, height: 667 },
      reducedMotion: 'reduce',
      isMobile: true,
      hasTouch: true,
    }),
    bContext = await browser.newContext({
      viewport: { width: 430, height: 932 },
      reducedMotion: 'reduce',
      isMobile: true,
      hasTouch: true,
    });
  try {
    const a = await join(aContext, baseURL ?? '', h.code, 'Первая', true),
      b = await join(bContext, baseURL ?? '', h.code, 'Вторая', true);
    const errors: string[] = [];
    for (const page of [h.page, a, b]) page.on('pageerror', (error) => errors.push(error.message));
    await expect(h.page.locator('[data-action=start]')).toBeEnabled();
    await h.page.locator('[data-action=start]').tap();
    await expect(a.locator('.qtext')).toBeVisible();
    await expect(b.locator('.qtext')).toBeVisible();
    await assertNoScroll(a);
    await a.locator('[data-answer="1"]').tap();
    await expect(a.locator('[data-answer]:enabled')).toHaveCount(0);
    await a.reload();
    await ready(a);
    await expect(a.locator('.option.chosen')).toHaveCount(1);
    await aContext.setOffline(true);
    await expect(a.locator('#status')).toHaveText('Переподключаемся…');
    await aContext.setOffline(false);
    await ready(a);
    await b.locator('[data-answer="1"]').tap();
    await expect(a.locator('.feedback')).toBeVisible();
    await expect(h.page.locator('.score strong')).toHaveText(['1', '1']);
    await h.page.locator('[data-action=close]').tap();
    await expect(a.locator('#status')).toHaveText('Готовы к игре');
    expect(errors).toEqual([]);
  } finally {
    await h.context.close();
    await aContext.close();
    await bContext.close();
  }
});
