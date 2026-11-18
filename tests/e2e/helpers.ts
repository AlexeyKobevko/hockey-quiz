import { expect } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import type { Session } from '../../src/shared/contracts.js';
import { isSession, parseSnapshot } from '../../src/shared/validation.js';
export async function ready(page: Page) {
  await expect(page.locator('#status')).toHaveText('На связи', { timeout: 15000 });
}
export async function host(browser: Browser, base: string, width = 390, mobile = false) {
  const context = await browser.newContext({
      viewport: { width, height: 844 },
      reducedMotion: 'reduce',
      isMobile: mobile,
      hasTouch: mobile,
    }),
    page = await context.newPage();
  page.on('dialog', (d) => {
    void d.accept();
  });
  const diagnostics: string[] = [];
  page.on('pageerror', (error) => diagnostics.push(error.name + ': ' + error.message));
  page.on('requestfailed', (request) => {
    diagnostics.push(new URL(request.url()).pathname + ': ' + request.failure()?.errorText);
  });
  page.on('response', (response) => {
    if (response.status() >= 400)
      diagnostics.push(new URL(response.url()).pathname + ': ' + response.status());
  });
  try {
    await page.goto(base);
    if (mobile) await page.locator('[data-action=create]').tap();
    else await page.locator('[data-action=create]').click();
    await expect(page.locator('.hugecode')).toBeVisible();
    await ready(page);
    const code = (await page.locator('.hugecode').innerText()).trim();
    return { context, page, code };
  } catch (error) {
    throw new Error('Host startup failed: ' + (diagnostics.join('; ') || 'no browser errors'), {
      cause: error,
    });
  }
}
export async function join(
  context: BrowserContext,
  base: string,
  code: string,
  name: string,
  mobile = false,
) {
  const page = await context.newPage();
  page.on('dialog', (d) => {
    void d.accept();
  });
  await page.goto(base + '/?room=' + code);
  await page.locator('#nickname').fill(name);
  if (mobile) await page.locator('#joinForm button').tap();
  else await page.locator('#joinForm button').click();
  await ready(page);
  return page;
}
export async function session(page: Page, key = 'hockey-multiplayer-v2'): Promise<Session> {
  const value: unknown = await page.evaluate((k) => {
    const value: unknown = JSON.parse(localStorage.getItem(k) ?? 'null');
    return value;
  }, key);
  if (!isSession(value)) throw new Error('Missing test session');
  return value;
}
export async function snapshot(page: Page, auth: Session) {
  const response = await page.request.get('/api/state?code=' + auth.code, {
    headers: { Authorization: 'Bearer ' + auth.token },
  });
  expect(response.status()).toBe(200);
  const value: unknown = await response.json();
  return parseSnapshot(value);
}
export function assertNoScroll(page: Page) {
  return expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
}
