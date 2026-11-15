import { expect, test } from '@playwright/test';
import { mockSources } from './helpers';

test('compare field finances with farmer-entered assumptions and create a Planner plan', async ({ page }) => {
  await mockSources(page);
  await page.goto('/fields');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: 'Load the demo farm' }).click();
  await expect(page.getByText('Loaded the demo farm: 6 example fields near Ames, Iowa.')).toBeVisible();
  await page.goto('/finance');
  await expect(page.getByRole('heading', { name: 'See what a rotation could mean for your bottom line.' })).toBeVisible();
  await expect(page.getByText('Planning estimate · not live market data or a yield forecast')).toBeVisible();

  await page.getByLabel('Alternative to compare').selectOption('strategy:cover');
  await page.getByLabel('Land arrangement').selectOption('owned');
  await page.getByLabel('Planning horizon').selectOption('3');
  await page.getByLabel('Cover crop cost per acre').fill('0');
  await page.getByLabel('One-time transition cost per acre').fill('0');

  const cropCards = page.locator('details');
  const cropCount = await cropCards.count();
  expect(cropCount).toBeGreaterThan(0);
  for (let index = 0; index < cropCount; index++) {
    const card = cropCards.nth(index);
    await card.getByLabel('Expected yield per acre').fill('120');
    await card.getByLabel('Yield unit').selectOption('bushel');
    await card.getByLabel('Expected sale price per bushel').fill('5');
    await card.getByLabel('Total operating costs per acre').fill('250');
  }
  await page.getByRole('button', { name: 'Save financial inputs' }).click();
  await expect(page.getByRole('status')).toContainText('Financial assumptions saved on this device');
  await expect(page.locator('svg[role="img"]')).toHaveCount(3);
  await expect(page.getByText('Needs inputs', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const fieldId = await page.getByLabel('Field', { exact: true }).inputValue();
  expect(fieldId).toBeTruthy();
  await page.getByRole('button', { name: 'Create plan and open Planner' }).click();
  await expect(page).toHaveURL(/\/planner\?field=.*&plan=/);
  await expect(page.getByText(/Cover crop plan for/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
