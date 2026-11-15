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
        ? { sourceId: id, sourceName: id, docsUrl: '', status: 'needs_token', values: [], message: 'Needs an Earthdata token.' }
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

test('add fields by ZIP + pin and by polygon, enter crops, import GeoJSON, reload', async ({ page, isMobile }) => {
  await mockSources(page);
  await page.goto('/fields');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // ZIP + pin
  await page.getByRole('button', { name: 'Add field' }).click();
  await page.getByRole('button', { name: /Start from a ZIP code/ }).click();
  await page.getByLabel('ZIP code').fill('50010');
  await page.getByRole('button', { name: 'Find on map' }).click();
  await expect(page.getByText(/The map shows ZIP 50010/)).toBeVisible();
  const c = await mapPoint(page);
  await page.mouse.click(c.x, c.y);
  await expect(page.getByTestId('draft-acres')).toHaveText('40.0 ac');
  await page.getByLabel('Field name').fill('Pin field');
  await page.getByRole('button', { name: 'Save field' }).click();
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

  // Polygon
  await page.getByRole('button', { name: 'All fields' }).click();
  await page.getByRole('button', { name: 'Add field' }).click();
  await page.getByRole('button', { name: /Draw the boundary/ }).click();
  const m = await mapPoint(page);
  const d = isMobile ? 45 : 90;
  for (const [dx, dy] of [[-d, -d], [d, -d], [d, d], [-d, d]]) await page.mouse.click(m.x + dx, m.y + dy);
  await page.getByRole('button', { name: 'Finish shape' }).click();
  await expect(page.getByTestId('draft-acres')).toHaveText(/\d+\.\d ac/);
  await page.getByLabel('Field name').fill('Drawn field');
  await page.getByRole('button', { name: 'Save field' }).click();
  await expect(page.getByTestId('field-acres')).toHaveText(/\d+\.\d ac/);

  // Import GeoJSON
  await page.goto('/imports');
  await page.getByTestId('boundary-file').setInputFiles(path.join(__dirname, '..', '..', 'samples', 'sample-farm.geojson'));
  await expect(page.getByText('4 shapes found.', { exact: false })).toBeVisible();
  await expect(page.getByText(/1 feature skipped/)).toBeVisible();
  await page.getByRole('button', { name: 'Add 4 fields' }).click();
  await expect(page).toHaveURL(/\/fields$/);
  const list = page.getByRole('list', { name: 'Fields' });
  await expect(list.getByRole('button')).toHaveCount(6);
  await expect(list).toContainText('North 80');
  await expect(list).toContainText('Well site');

  // Reload: everything persists
  await page.reload();
  await expect(list.getByRole('button')).toHaveCount(6);
  await list.getByRole('button', { name: /Pin field/ }).click();
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
  for (const [href, heading] of [
    ['/overview', 'Overview'],
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
