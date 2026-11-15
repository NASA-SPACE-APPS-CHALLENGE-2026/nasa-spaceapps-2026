import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, type Page } from '@playwright/test';

/** 40 years of monthly weather from the recorded NASA POWER fixture, in the /api/weather-history shape. */
function weatherYears() {
  const p = JSON.parse(readFileSync(path.join(__dirname, '..', 'fixtures', 'power-monthly.json'), 'utf8')).properties.parameter;
  const years = [];
  for (let y = 1985; y <= 2024; y++) {
    const m = Array.from({ length: 12 }, (_, i) => `${y}${String(i + 1).padStart(2, '0')}`);
    years.push({ year: y, rainMm: m.map((k) => p.PRECTOTCORR_SUM[k]), maxTempC: m.map((k) => p.T2M_MAX[k]) });
  }
  return years;
}

/** Third-party data is mocked at PlotTwist's own API boundary (/api/profile/*, /api/cdl), so tests are deterministic. */
const AMES_CLIMATE = {
  monthlyMeanTempF: [19.5, 24.7, 36.7, 48.9, 60.8, 70.8, 74.9, 72.8, 64.7, 50.7, 36.3, 24.8],
  monthlyRainIn: [0.94, 1.05, 1.92, 3.54, 4.58, 5.19, 4.16, 4.29, 3.27, 2.62, 1.72, 1.33],
};

export async function mockSources(page: Page) {
  await page.route('**/api/profile/*', async (route) => {
    const id = route.request().url().split('/').pop()!;
    const earthdata = ['imerg', 'ndvi'].includes(id);
    const smap = [
      { key: 'smapLatest', label: 'Topsoil moisture (Nov 11)', value: 29, unit: '%', honesty: 'Estimated' },
      { key: 'smapCondition', label: 'Topsoil condition', value: 'Good', honesty: 'Estimated' },
    ];
    await route.fulfill({
      json: earthdata
        ? { sourceId: id, sourceName: id, docsUrl: '', status: 'needs_token', values: [], message: 'Not available yet.' }
        : id === 'smap'
          ? { sourceId: id, sourceName: id, docsUrl: '', status: 'ok', fetchedAt: '2026-11-14T12:00:00Z', values: smap }
          : {
            sourceId: id,
            sourceName: id,
            docsUrl: '',
            status: 'ok',
            fetchedAt: '2026-11-14T12:00:00Z',
            values: [{ key: 'k', label: `Mock ${id} value`, value: 1, honesty: id === 'elevation' ? 'Measured' : 'Estimated' }],
            // Ames, Iowa 1991–2020 normals (rounded) so Rotation Explorer can score climate fit.
            ...(id === 'power' ? { climate: AMES_CLIMATE } : {}),
          },
    });
  });
  await page.route('**/api/weather-history', (route) => route.fulfill({ json: { years: weatherYears(), fetchedAt: '2026-11-14T12:00:00Z' } }));
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

export async function mapPoint(page: Page) {
  const box = (await page.getByTestId('field-map').boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + Math.min(box.height / 2, 200) };
}

/** Trace a square of corners around the visible map centre (draw mode must already be on). */
export async function drawSquare(page: Page, isMobile: boolean) {
  const m = await mapPoint(page);
  const d = isMobile ? 45 : 90;
  for (const [dx, dy] of [[-d, -d], [d, -d], [d, d]]) await page.mouse.click(m.x + dx, m.y + dy);
  await expect(page.getByTestId('live-acres')).toBeVisible(); // live acreage from the third corner
  await page.mouse.click(m.x - d, m.y + d);
  await page.getByRole('button', { name: 'Finish shape' }).click();
}

