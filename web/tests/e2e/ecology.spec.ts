import { expect, test } from '@playwright/test';
import { createField } from '../../lib/domain/field';
import { setSeasonCrop } from '../../lib/domain/cropHistory';
import { DEFAULT_FINANCE } from '../../lib/domain/finance/inputs';
import type { Plan } from '../../lib/domain/types';
import { mockSources } from './helpers';

const field = (id: string, acres: number) => {
  const f = createField({ id, name: id === 'a' ? 'North meadow' : 'South field', definedBy: 'polygon', geometry: { type: 'Polygon', coordinates: [[[-93.742, 42.006], [-93.74, 42.006], [-93.74, 42.008], [-93.742, 42.008], [-93.742, 42.006]]] } });
  const crops = { ...f.crops, current: { ...f.crops.current, year: 2026 }, history: [{ year: 2025, crop: { kind: 'catalog' as const, id: 'soybeans' }, status: 'confirmed' as const, origin: 'farmer' as const }] };
  return { ...f, areaM2: acres * 4046.8564224, crops: setSeasonCrop(crops, 2026, { kind: 'catalog', id: 'corn' }), cdl: { status: 'done' as const } };
};
const fields = [field('a', 8.6), field('b', 22)];
const plan: Plan = { id: 'plan-a', fieldId: 'a', name: 'Meadow cover plan', strategyId: 'cover', createdAt: '2026-11-15T12:00:00Z', updatedAt: '2026-11-15T12:00:00Z', seasons: Array.from({ length: 5 }, (_, i) => ({ year: 2027 + i, crop: { kind: 'catalog', id: i % 2 ? 'soybeans' : 'corn' }, cover: { species: 'cereal-rye', name: 'Cereal rye' }, tasks: [
  { id: `p${i}`, kind: 'plant', month: 5, label: `Plant ${i % 2 ? 'soybeans' : 'corn'}` },
  { id: `h${i}`, kind: 'harvest', month: 10, label: `Harvest ${i % 2 ? 'soybeans' : 'corn'}` },
  { id: `c${i}`, kind: 'cover-plant', month: 11, label: 'Seed cereal rye' },
  ...(i ? [{ id: `t${i}`, kind: 'cover-terminate' as const, month: 4, label: 'End cereal rye' }] : []),
] })) };

async function seed(page: import('@playwright/test').Page) {
  await mockSources(page);
  await page.addInitScript(({ fields, plan, finance }) => {
    if (sessionStorage.getItem('ecology-seeded')) return;
    localStorage.clear();
    const write = (key: string, items: unknown, schemaVersion = 1) => localStorage.setItem(`fieldshift.${key}`, JSON.stringify({ schemaVersion, items }));
    write('fields', Object.fromEntries(fields.map((f) => [f.id, f])), 2);
    write('plans', { [plan.id]: plan });
    write('settings', { farm: { externalLookups: false, lastFieldId: 'a' } });
    write('finance', { farm: finance });
    sessionStorage.setItem('ecology-seeded', 'yes');
  }, { fields, plan, finance: { ...DEFAULT_FINANCE, fields: { a: { acres: 31 } }, simulator: { a: { acres: 31 } } } });
}

test('ecological controls, field isolation, persistence, responsive charts and Finance handoff', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await seed(page);
  await page.goto('/simulator?field=a');
  await expect(page.getByTestId('mapped-acres')).toContainText('8.6 acres');
  await expect(page.getByTestId('mapped-acres')).toContainText('Using mapped acreage');
  const advanced = page.getByRole('button', { name: 'Show Advanced Metrics', exact: true });
  await expect(advanced).toHaveAttribute('aria-expanded', 'false');
  for (const name of ['Soil erosion', 'Soil organic matter trend', 'Nitrogen inputs and partial balance', 'Living cover and seasonal gaps', 'Crop rotation diversity']) {
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  }
  const n = page.getByLabel('Corn nitrogen', { exact: true });
  await n.fill('150');
  await expect(n).toBeFocused();
  await expect(page.getByRole('img', { name: '2027, Proposed Planner rotation: 150 lb N/ac', exact: true })).toBeAttached();
  await page.getByLabel('Corn expected yield', { exact: true }).fill('200');
  await page.getByRole('radio', { name: 'Balance', exact: true }).click();
  await expect(page.getByRole('img', { name: '2027, Proposed Planner rotation: 12 lb N/ac', exact: true })).toBeAttached();
  await page.getByLabel('Field', { exact: true }).selectOption('b');
  await expect(page.getByTestId('mapped-acres')).toContainText('22 acres');
  await expect(page.getByLabel('Corn nitrogen', { exact: true })).toHaveValue('');
  await expect(page.getByRole('heading', { name: 'Your next step: save a proposed plan' })).toBeVisible();
  await page.getByLabel('Field', { exact: true }).selectOption('a');
  await expect(n).toHaveValue('150');
  await page.reload();
  await expect(n).toHaveValue('150');
  await advanced.click();
  await page.getByRole('combobox', { name: 'Tillage', exact: true }).selectOption('no-till');
  await page.getByRole('combobox', { name: 'Residue after harvest', exact: true }).selectOption('retained');
  await expect(page.getByText('More protective practices', { exact: true }).first()).toBeVisible();
  await page.getByLabel('Use a temporary scenario acreage override').check();
  await page.getByTestId('sim-acres').fill('10');
  await expect(page.getByTestId('mapped-acres')).toContainText('Scenario override: 10 acres');
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('heading', { name: 'Scenario Simulator', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`simulator-${width}.png`) });
  }
  await page.getByRole('link', { name: 'View Financial Impact' }).click();
  await expect(page).toHaveURL(/finance\?field=a&scenario=1/);
  await expect(page.getByTestId('scenario-finance')).toContainText('10 acres');
  await expect(page.getByTestId('scenario-finance').getByRole('heading', { name: 'Annual net return' })).toBeVisible();
  await expect(page.getByTestId('finance-headline')).toContainText('30.6 acres');
  await page.getByRole('radio', { name: 'Your numbers' }).click();
  await expect(page).toHaveURL(/field=a.*scenario=1.*tab=inputs/);
  await expect(page.getByTestId('finance-field-a')).toContainText('8.6 acres');
  expect(errors).toEqual([]);
});

test('saved Planner date edits reach the ecological timeline without re-entering the rotation', async ({ page }) => {
  await seed(page);
  await page.goto('/planner?field=a&plan=plan-a');
  const task = page.getByTestId('plan-task').filter({ visible: true }).filter({ hasText: 'Plant corn' }).first();
  await task.click();
  await page.getByRole('dialog', { name: 'Edit task' }).getByLabel('Month').selectOption('6');
  await page.getByRole('button', { name: 'Save task' }).click();
  await page.goto('/simulator?field=a');
  await expect(page.getByTestId('sim-plan-proposed')).toContainText('Meadow cover plan');
  await expect(page.getByRole('button', { name: /Proposed Planner rotation, May 2027: No planned living crop/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Proposed Planner rotation, Jun 2027: Corn: Planner dates/ })).toBeVisible();
});
