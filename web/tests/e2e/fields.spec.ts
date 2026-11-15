import path from 'node:path';
import { expect, test } from '@playwright/test';
import { drawSquare, mockSources } from './helpers';

/**
 * Smoke test for the Milestone 1 "done when" list. Third-party data is mocked at our own API
 * boundary (/api/profile/*, /api/cdl) so the test is deterministic; /api/zip is the real bundled lookup.
 */

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
  await expect(page.getByTestId('source-smap')).toHaveAttribute('data-status', 'ok');
  await expect(page.getByTestId('source-smap')).toContainText(/29 ?%/);
  await expect(page.getByTestId('source-imerg')).toContainText('Not available yet');
  // The profile is plain: values only, no provider names, fetch dates or honesty badges.
  await expect(page.getByTestId('source-elevation')).toContainText('Mock elevation value');
  await expect(page.getByTestId('source-elevation')).not.toContainText('Measured');
  await expect(page.getByTestId('source-power')).not.toContainText('NASA POWER');

  // Crops: current season by search, then confirm the detections
  await page.getByRole('button', { name: /Crop in 2026/ }).click();
  await page.getByRole('combobox', { expanded: true }).fill('oats');
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

test('record imports are read, reviewed, applied to Finance and removable', async ({ page }) => {
  await page.goto('/fields');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: /demo farm/i }).click();
  await expect(page.getByRole('list', { name: 'Fields' }).getByRole('button')).toHaveCount(6);

  await page.goto('/imports');
  const card = page.getByRole('region', { name: 'Finance and payments' });
  await card.locator('input[type=file]').setInputFiles(path.join(__dirname, '..', '..', 'samples', 'quickbooks-2025.csv'));
  const review = card.getByTestId('import-review');
  await expect(review).toContainText('19 transactions');
  await expect(review.getByText('Corn price received')).toBeVisible();
  await review.getByTestId('apply-import').click();
  await expect(card.getByTestId('imported-file')).toContainText('Using');
  await expect(page.getByTestId('imports-summary')).toContainText('Corn price');

  // Finance shows the imported books under anything typed.
  await page.goto('/finance?tab=inputs');
  await expect(page.getByTestId('imports-note')).toBeVisible();
  await expect(page.getByTestId('input-lastYear.totalRevenue')).toHaveAttribute('placeholder', '510309');

  // Removing the file undoes it; a wrong file type is refused.
  await page.goto('/imports');
  await card.getByRole('button', { name: 'Remove quickbooks-2025.csv' }).click();
  await expect(page.getByTestId('imports-summary')).toHaveCount(0);
  await card.locator('input[type=file]').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('x') });
  await expect(card.getByRole('alert')).toContainText('not an accepted file type');
});

test('every tab is routed', async ({ page }) => {
  await page.goto('/fields');
  await expect(page.getByRole('navigation', { name: 'Main' }).first()).toBeVisible();
  for (const [href, heading] of [
    ['/overview', 'Overview'],
    ['/simulator', 'Scenario Simulator'],
    ['/finance', 'Finance'],
  ]) {
    await page.goto(href);
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Add a field first' })).toBeVisible();
  }
  for (const [href, heading] of [
    ['/rotation', 'Rotation Explorer'],
    ['/planner', 'Planner'],
  ]) {
    await page.goto(href);
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
  }
});

test('address suggestions appear as you type, and picking one finds the farm', async ({ page }) => {
  await mockSources(page);
  await page.route('**/api/geocode/suggest', (route) => route.fulfill({ json: { matches: [{ label: '2229 Lincoln Way, Ames, IA 50014', lat: 42.0238, lon: -93.6458 }] } }));
  await page.goto('/fields');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: 'Add field' }).click();
  await page.getByRole('button', { name: /^Enter an address/ }).click();
  await page.getByRole('combobox', { name: 'Address' }).pressSequentially('2229 linc', { delay: 30 });
  const option = page.getByRole('option', { name: '2229 Lincoln Way, Ames, IA 50014' });
  await expect(option).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await expect(option).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Enter');
  await expect(option).toBeHidden();
  await expect(page.getByText('2229 Lincoln Way, Ames, IA 50014').first()).toBeVisible();
});
