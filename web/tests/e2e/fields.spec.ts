import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';

/**
 * Smoke test for the Milestone 1 "done when" list. Third-party data is mocked at our own API
 * boundary (/api/profile/*, /api/cdl) so the test is deterministic; /api/zip is the real bundled lookup.
 */
async function mockSources(page: Page) {
  await page.route('**/api/profile/*', async (route) => {
    const id = route.request().url().split('/').pop()!;
    const earthdata = ['smap', 'imerg', 'ndvi'].includes(id);
    await route.fulfill({
      json: earthdata
        ? { sourceId: id, sourceName: id, docsUrl: '', status: 'needs_token', values: [], message: 'Not available yet.' }
        : {
            sourceId: id,
            sourceName: id,
            docsUrl: '',
            status: 'ok',
            fetchedAt: '2026-11-14T12:00:00Z',
            values: [{ key: 'k', label: `Mock ${id} value`, value: 1, honesty: id === 'elevation' ? 'Measured' : 'Estimated' }],
          },
    });
  });
  await page.route('**/api/cdl', async (route) => {
    const { years } = route.request().postDataJSON() as { years: number[] };
    await route.fulfill({
      json: {
        status: 'ok',
        years: years.map((year) => ({
          year,
          detection: { cdlCode: year % 2 ? 1 : 5, cdlName: year % 2 ? 'Corn' : 'Soybeans', sharePct: 100, method: 'sampled', sampleCount: 5, nonCrop: false, fetchedAt: '2026-11-14T12:00:00Z' },
        })),
      },
    });
  });
  // Keep map tiles off the network; the map falls back gracefully.
  await page.route(/basemap\.nationalmap\.gov|tile\.openstreetmap\.org/, (route) => route.abort());
}

async function mapPoint(page: Page) {
  const box = (await page.getByTestId('field-map').boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + Math.min(box.height / 2, 200) };
}

/** Trace a square of corners around the visible map centre (draw mode must already be on). */
async function drawSquare(page: Page, isMobile: boolean) {
  const m = await mapPoint(page);
  const d = isMobile ? 45 : 90;
  for (const [dx, dy] of [[-d, -d], [d, -d], [d, d]]) await page.mouse.click(m.x + dx, m.y + dy);
  await expect(page.getByTestId('live-acres')).toBeVisible(); // live acreage from the third corner
  await page.mouse.click(m.x - d, m.y + d);
  await page.getByRole('button', { name: 'Finish shape' }).click();
}

test('add fields by ZIP then drawing, enter crops, import GeoJSON, reload', async ({ page, isMobile }) => {
  await mockSources(page);
  await page.goto('/fields');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // ZIP → the map zooms in and goes straight into draw mode; no square is placed for you.
  await page.getByRole('button', { name: 'Add field' }).click();
  await page.getByRole('button', { name: 'Find by ZIP code' }).click();
  await page.getByLabel('ZIP code').fill('50010');
  await page.getByRole('button', { name: 'Find on map' }).click();
  await expect(page.getByText('Near ZIP 50010')).toBeVisible();
  await expect(page.getByText('Tap the map at each corner of your field.')).toBeVisible();
  await expect(page.getByTestId('draft-acres')).toHaveCount(0);
  await drawSquare(page, isMobile);
  await expect(page.getByTestId('draft-acres')).toHaveText(/\d+\.\d ac/);
  await page.getByLabel('Field name').fill('ZIP field');
  await page.getByRole('button', { name: 'Save field' }).click();
  await expect(page.getByTestId('field-acres')).toHaveText(/\d+\.\d ac/);
  await expect(page.getByTestId('season-2025')).toContainText('Check this info');
  await expect(page.getByTestId('source-power')).toHaveAttribute('data-status', 'ok');
  await expect(page.getByTestId('source-smap')).toHaveAttribute('data-status', 'needs_token');
  await expect(page.getByTestId('source-elevation')).toContainText('Measured');

  // Crops: current season by search, then confirm the detections
  await page.getByRole('button', { name: /Crop in 2026/ }).click();
  await page.getByRole('combobox').fill('oats');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('season-2026')).toContainText('You entered this');
  await page.getByRole('button', { name: /These look right/ }).click();
  await expect(page.getByTestId('season-2025')).toContainText('You confirmed');

  // Draw directly where the map is
  await page.getByRole('button', { name: 'All fields' }).click();
  await page.getByRole('button', { name: 'Add field' }).click();
  await page.getByRole('button', { name: /^Draw the boundary/ }).click();
  await drawSquare(page, isMobile);
  await page.getByLabel('Field name').fill('Drawn field');
  await page.getByRole('button', { name: 'Save field' }).click();
  await expect(page.getByTestId('field-acres')).toHaveText(/\d+\.\d ac/);

  // Import GeoJSON (points and lines are skipped with reasons)
  await page.goto('/imports');
  await page.getByTestId('boundary-file').setInputFiles(path.join(__dirname, '..', '..', 'samples', 'sample-farm.geojson'));
  await expect(page.getByText(/\d+ shapes? found\./)).toBeVisible();
  await expect(page.getByText(/\d+ features? skipped/)).toBeVisible();
  const addButton = page.getByRole('button', { name: /^Add \d+ fields?$/ });
  const added = Number((await addButton.textContent())!.match(/\d+/)![0]);
  await addButton.click();
  await expect(page).toHaveURL(/\/fields$/);
  const list = page.getByRole('list', { name: 'Fields' });
  await expect(list.getByRole('button')).toHaveCount(2 + added);

  // Reload: everything persists
  await page.reload();
  await expect(list.getByRole('button')).toHaveCount(2 + added);
  await list.getByRole('button', { name: /ZIP field/ }).click();
  await expect(page.getByTestId('season-2026')).toContainText('Oats');
  await expect(page.getByTestId('season-2025')).toContainText('You confirmed');
});

test('stub import cards accept files without claiming to process them', async ({ page }) => {
  await page.goto('/imports');
  const card = page.getByRole('region', { name: 'Finance and payments' });
  await card.locator('input[type=file]').setInputFiles({ name: 'stripe-payments.csv', mimeType: 'text/csv', buffer: Buffer.from('id,amount\n1,10\n') });
  await expect(card).toContainText('Received, not yet processed.');
  await expect(card.getByRole('button', { name: /Processing comes in a later milestone/ })).toBeDisabled();
  await card.locator('input[type=file]').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('x') });
  await expect(card.getByRole('alert')).toContainText('not an accepted file type');
});

test('every tab is routed and the app opens on Fields', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/fields$/);
  await page.goto('/overview');
  await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible();
  for (const [href, heading] of [
    ['/rotation', 'Rotation Explorer'],
    ['/planner', 'Planner'],
    ['/simulator', 'Scenario Simulator'],
    ['/finance', 'Finance'],
  ]) {
    await page.goto(href);
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
    await expect(page.getByText('Coming in a later milestone.')).toBeVisible();
  }
});
