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

test('imported records drive Finance, corrections and reloads', async ({ page }) => {
  await page.goto('/imports');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const card = page.getByRole('region', { name: 'Finance and payments' });
  await card.locator('input[type=file]').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('x') });
  await expect(card.getByRole('alert')).toContainText('not an accepted file type');
  const files = {
    land: 'id,name,acres,plantedAcres,harvestedAcres,currentRotation,proposedRotation\nf1,East,10,9,8,corn,soybeans',
    harvests: 'id,fieldId,season,crop,harvestedAcres,plantedAcres,quantity,unit\nh1,f1,2024,corn,8,9,960,bu\nh2,f1,2025,soybeans,8,9,320,bu',
    payments: 'id,kind,crop,season,amount,quantity,unit,status\ns1,sale,corn,2024,800,200,bu,paid\ns2,sale,corn,2024,2200,400,bu,paid\ns3,sale,soybeans,2025,3200,320,bu,paid',
    equipment: 'id,operation,supportedCrops,dailyCapacityAcres,availableDays\nm1,harvest,*,20,5',
    purchases: 'id,kind,product,category,quantity,unit,totalPrice\nlot-1,purchase,Urea,fertilizer,200,lb,90',
  };
  for (const [name, csv] of Object.entries(files)) {
    await page.getByTestId(`${name}-file`).setInputFiles({ name: `${name}.csv`, mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await expect(page.getByRole('status').filter({ hasText: `from ${name}.csv` })).toBeVisible();
  }
  await page.goto('/finance?start=2027');
  await page.getByRole('radio', { name: '3 years' }).click();
  const headline = page.getByTestId('finance-headline');
  await expect(headline).toContainText('$14,400.00');
  await expect(headline).toContainText('$9,600.00');
  await page.getByRole('radio', { name: 'Your numbers' }).click();
  await page.getByTestId('markets-file').setInputFiles({
    name: 'bid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([{ id: 'quote', kind: 'farmer-price', crop: 'soybeans', value: 12, unit: 'bu', source: 'Farmer bid' }])),
  });
  await page.getByText('Review and correct records (1)').click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Value', { exact: true }).fill('11');
  await page.getByRole('button', { name: 'Save record' }).click();
  await expect(page.getByText('Saved quote.')).toBeVisible();
  await page.getByRole('radio', { name: 'Results' }).click();
  await expect(headline).toContainText('$10,560.00');
  await page.reload();
  await expect(headline).toContainText('$10,560.00');
  await expect(page.getByTestId('section-ledger')).toContainText('lot-1');
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
