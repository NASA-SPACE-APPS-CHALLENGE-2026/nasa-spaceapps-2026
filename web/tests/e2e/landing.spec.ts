import { expect, test } from '@playwright/test';
import { mockSources } from './helpers';

/** Scroll the pinned hero to a share (0–1) of its track. */
async function scrollHero(page: import('@playwright/test').Page, share: number) {
  await page.evaluate((p) => {
    const s = document.querySelector<HTMLElement>('section[aria-labelledby="hero-title"]')!;
    window.scrollTo(0, p * (s.offsetHeight - window.innerHeight));
  }, share);
}

test('landing page: hero sequence, sections and both calls to action', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'PlotTwist' })).toBeVisible();

  // Only the name is on screen at first; the CTA appears once the hero reaches the soil, and stays.
  const heroCta = page.locator('section[aria-labelledby="hero-title"]').getByRole('link', { name: 'Map your field' });
  await expect(heroCta).toBeHidden();
  await scrollHero(page, 0.9);
  await expect(heroCta).toBeVisible();
  await scrollHero(page, 1);
  await expect(heroCta).toBeVisible();

  for (const name of ['Everything a rotation decision needs, on the fields you farm', 'From a field outline to a plan in four steps', 'Your next rotation starts with one outline']) {
    await expect(page.getByRole('heading', { level: 2, name })).toBeAttached();
  }
  // No sideways scrolling at any width this project runs.
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

  // Secondary CTA goes to the saved fields.
  await page.getByRole('region', { name: 'Your next rotation starts with one outline' }).getByRole('link', { name: 'Go to my fields' }).click();
  await expect(page).toHaveURL(/\/fields$/);
});

test('menu opens as a dialog and closes with Escape', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Menu' }).click();
  const menu = page.getByRole('dialog', { name: 'Menu' });
  await expect(menu.getByRole('link', { name: 'How it works' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(page.getByRole('button', { name: 'Menu' })).toBeFocused();
});

test('reduced motion: the hero becomes stacked static sections', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.locator('section[aria-labelledby="hero-title"]')).toBeHidden();
  const stat = page.locator('section[aria-labelledby="hero-title-static"]');
  await expect(stat.getByRole('heading', { level: 1, name: 'PlotTwist' })).toBeVisible();
  await expect(stat.getByText('Rotate smarter. Farm longer.')).toBeVisible();
  await expect(stat.getByRole('link', { name: 'Map your field' })).toBeVisible();
  await ctx.close();
});

test('plot: draw a boundary, see acres, save it into the app', async ({ page }) => {
  await mockSources(page);
  await page.goto('/fields');
  await page.evaluate(() => localStorage.clear());

  await page.goto('/');
  await scrollHero(page, 0.95);
  await page.locator('section[aria-labelledby="hero-title"]').getByRole('link', { name: 'Map your field' }).click();
  await expect(page).toHaveURL(/\/plot$/);

  const save = page.getByRole('button', { name: 'Save field' });
  await expect(save).toBeDisabled();
  const acres = page.getByTestId('plot-acres');
  await expect(acres).toHaveText('0.0');

  // Wait for the map (and the draw tool) to be ready, then click four corners and the first again.
  const map = page.locator('.maplibregl-canvas');
  await expect(map).toBeVisible();
  await page.waitForTimeout(1500);
  const box = (await map.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height * 0.4;
  const d = Math.min(box.width, box.height) * 0.12;
  const corners: [number, number][] = [
    [cx - d, cy - d],
    [cx + d, cy - d],
    [cx + d, cy + d],
    [cx - d, cy + d],
  ];
  for (const [x, y] of corners) {
    await page.mouse.move(x, y);
    await page.mouse.click(x, y);
    await page.waitForTimeout(150);
  }
  await page.mouse.move(corners[0][0], corners[0][1]);
  await page.mouse.click(corners[0][0], corners[0][1]);

  await expect(acres).not.toHaveText('0.0');
  const shown = Number((await acres.textContent())!.replace(/,/g, ''));
  expect(shown).toBeGreaterThan(1);
  await expect(save).toBeEnabled();

  await page.getByLabel('Field name').fill('Back forty');
  await save.click();
  await expect(page).toHaveURL(/\/fields$/);
  await expect(page.getByText('Back forty').first()).toBeVisible();
});
