import { expect, test } from '@playwright/test';
import { drawSquare, mockSources } from './helpers';

/**
 * Milestone 2: Fields → Explore rotation → questionnaire (with soil test) → three scored strategies →
 * strategy page with cover-crop suggestions → plan → edit a month → reload. Sources are mocked.
 */
test('explore rotation, make a plan, edit it, and come back to the same field', async ({ page, isMobile }) => {
  await mockSources(page);
  await page.goto('/fields');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // A field with soybeans this season; CDL (mocked) fills corn / soybeans / corn before it.
  await page.getByRole('button', { name: 'Add field' }).click();
  await page.getByRole('button', { name: 'Find by ZIP code' }).click();
  await page.getByLabel('ZIP code').fill('50010');
  await page.getByRole('button', { name: 'Find on map' }).click();
  await expect(page.getByText('Near ZIP 50010')).toBeVisible();
  await expect(page.getByText('Tap the map at each corner of your field.')).toBeVisible();
  await drawSquare(page, isMobile);
  await page.getByLabel('Field name').fill('Back forty');
  await page.getByRole('button', { name: 'Save field' }).click();
  await expect(page.getByTestId('season-2025')).toContainText('Check this info');
  await page.getByRole('button', { name: /Crop in 2026/ }).click();
  await page.getByRole('combobox', { expanded: true }).fill('soybeans');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: /These look right/ }).click();

  await page.getByRole('link', { name: 'Explore rotation' }).click();
  await expect(page).toHaveURL(/\/rotation\?field=/);
  await expect(page.getByRole('heading', { name: 'Rotation Explorer', level: 1 })).toBeVisible();

  // Questionnaire
  const q = page.getByTestId('questionnaire');
  await expect(q.getByRole('heading', { name: 'How you farm it' })).toBeVisible();
  await q.getByLabel('No-till').check();
  await q.getByLabel('No irrigation (rain-fed)').check();
  await q.getByRole('button', { name: 'Next' }).click();
  await q.getByRole('group', { name: 'Have you grown cover crops before?' }).getByLabel('Never', { exact: true }).check();
  await q.getByRole('group', { name: 'Do you keep livestock or need forage?' }).getByLabel('No', { exact: true }).check();
  await q.getByRole('button', { name: 'Next' }).click();
  await q.getByRole('group', { name: /grain drill/ }).getByLabel('Yes', { exact: true }).check();
  await q.getByRole('group', { name: /local buyer/ }).getByLabel('Not sure').check();
  await q.getByRole('button', { name: 'Next' }).click();
  await q.getByLabel('Corn rootworm').check();
  await q.getByLabel('Soybean cyst nematode (SCN)').check();
  await q.getByRole('button', { name: 'Next' }).click();
  await q.getByLabel(/When do you usually harvest soybeans/).selectOption('10');
  await q.getByRole('button', { name: 'Next' }).click();
  await q.getByText('Add results from a lab soil test').click();
  await q.getByLabel('Organic matter (%)').fill('4.2');
  await q.getByLabel('pH', { exact: true }).fill('6.4');
  await q.getByRole('button', { name: 'See strategies' }).click();

  // Three strategies, four labelled bars each, exactly one best fit.
  for (const id of ['keep', 'cover', 'small-grains']) {
    const card = page.getByTestId(`strategy-${id}`);
    await expect(card).toBeVisible();
    for (const bar of ['soilCover', 'diversity', 'pests', 'climate']) {
      await expect(card.getByTestId(`bar-${bar}`)).not.toHaveAttribute('data-score', 'none');
    }
  }
  await expect(page.getByTestId('best-fit')).toHaveCount(1);
  // Cards stay simple: the only link is "See the details", no citation or data links.
  await expect(page.getByTestId('strategy-cover').getByRole('link')).toHaveCount(1);
  await expect(page.getByTestId('best-fit-summary')).toContainText('Best fit:');
  await expect(page.getByText('8 of 8 questions answered, soil test added.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // Strategy page with cover-crop suggestions and sources.
  await page.getByRole('link', { name: 'See the details for Add a cover crop' }).click();
  await expect(page).toHaveURL(/\/rotation\/cover\?field=/);
  await expect(page.getByRole('heading', { name: 'Add a cover crop', level: 1 })).toBeVisible();
  const covers = page.getByTestId('cover-suggestions');
  await expect(covers.getByText('Cereal rye').first()).toBeVisible();
  await expect(covers.getByText('In this strategy').first()).toBeVisible();
  await expect(page.getByText('Organic matter (your soil test)').or(page.getByText('4.2 %')).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /Managing Cover Crops Profitably/ }).first()).toHaveAttribute('href', /sare\.org/);
  // Scores are collapsed; opening one shows why.
  const soil = page.getByTestId('score-soilCover');
  const why = soil.getByRole('button', { name: /Why this score/ });
  await expect(why).toHaveAttribute('aria-expanded', 'false');
  await why.click();
  await expect(soil.getByRole('button', { name: /Hide why/ })).toHaveAttribute('aria-expanded', 'true');
  await expect(soil.getByRole('listitem').first()).toBeVisible();

  // Make it a plan, then move a task to another month.
  await page.getByRole('button', { name: 'Make this my plan' }).click();
  await expect(page).toHaveURL(/\/planner\?field=.*&plan=/);
  await expect(page.locator('input[value="Cover crop plan for Back forty"]')).toBeVisible();
  const plant = page.getByTestId('plan-task').filter({ visible: true }).filter({ hasText: 'Plant corn' }).first();
  await expect(plant).toHaveAttribute('data-month', '5');
  await plant.click();
  const dialog = page.getByRole('dialog', { name: 'Edit task' });
  await dialog.getByLabel('Month').selectOption('6');
  await dialog.getByRole('button', { name: 'Save task' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('plan-task').filter({ visible: true }).filter({ hasText: 'Plant corn' }).first()).toHaveAttribute('data-month', '6');

  // Desktop: drag "Plant corn" from June to April of the same year, then back with the dialog.
  if (!isMobile) {
    const chip = page.getByTestId('plan-task').filter({ visible: true }).filter({ hasText: 'Plant corn' }).first();
    const year = await chip.getAttribute('data-year');
    const target = page.locator(`[data-testid="plan-cell"][data-year="${year}"][data-month="4"]`);
    const from = (await chip.boundingBox())!;
    const to = (await target.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2, { steps: 3 });
    await page.mouse.move(to.x + to.width / 2, to.y + 20, { steps: 12 });
    await page.mouse.up();
    const moved = page.getByTestId('plan-task').filter({ visible: true }).filter({ hasText: 'Plant corn' }).first();
    await expect(moved).toHaveAttribute('data-month', '4');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await moved.click();
    await page.getByRole('dialog', { name: 'Edit task' }).getByLabel('Month').selectOption('6');
    await page.getByRole('button', { name: 'Save task' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }

  // Reload: the plan and the edit persist.
  await page.reload();
  await expect(page.getByTestId('plan-task').filter({ visible: true }).filter({ hasText: 'Plant corn' }).first()).toHaveAttribute('data-month', '6');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // Logo goes to Overview; Rotation Explorer reopens the last field with its answers.
  await page.getByRole('link', { name: /PlotTwist home/ }).click();
  await expect(page).toHaveURL(/\/overview$/);
  await expect(page.getByTestId('overview-metrics')).toContainText('29%');
  await expect(page.getByTestId('overview-rotation')).toContainText('Back forty');
  await expect(page.getByTestId('overview-rotation')).toContainText('plan');

  // Simulator: the plan from the Planner is filled in automatically and compared with the current rotation.
  await page.goto('/simulator');
  await expect(page.getByTestId('sim-plan-proposed')).toContainText('Proposed Planner rotation');
  await expect(page.getByTestId('eco-results')).toBeVisible();
  await expect(page.getByTestId('sim-pros').getByRole('listitem').first()).toBeVisible();
  await page.getByLabel('Use a temporary scenario acreage override').check();
  await page.getByTestId('sim-acres').fill('120');
  await page.getByTestId('sim-acres').press('Enter');
  await expect(page.getByTestId('sim-acres')).toHaveValue('120');

  // Finance: results for the whole farm, and the farmer's own number changes them.
  await page.goto('/finance');
  const headline = page.getByTestId('finance-headline');
  await expect(headline).toContainText('Whole farm over 5 years');
  const before = await headline.textContent();
  for (const id of ['partial', 'cash', 'risk', 'savings', 'sensitivity', 'transparency']) await expect(page.getByTestId(`section-${id}`)).toBeVisible();
  await page.getByRole('radio', { name: 'Your numbers' }).click();
  await page.getByText('Market: yields, prices and contracts').click();
  await page.getByTestId('input-corn.price').fill('6');
  await page.getByTestId('input-corn.price').press('Enter');
  await page.getByRole('radio', { name: 'Results' }).click();
  await expect(headline).not.toHaveText(before!);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.goto('/rotation');
  await expect(page.getByLabel('Field', { exact: true })).toHaveValue(/.+/);
  await expect(page.getByLabel('Field', { exact: true }).locator('option:checked')).toContainText('Back forty');
  await expect(page.getByTestId('strategy-cover')).toBeVisible();
});

test('Rotation Explorer and Planner explain what to do with no fields', async ({ page }) => {
  await page.goto('/rotation');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Add a field first' })).toBeVisible();
  await page.goto('/planner');
  await expect(page.getByRole('heading', { name: 'Add a field first' })).toBeVisible();
});
