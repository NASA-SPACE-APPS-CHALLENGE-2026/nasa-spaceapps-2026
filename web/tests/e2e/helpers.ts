import { expect, type Page } from '@playwright/test';

/** Third-party data is mocked at FieldShift's own API boundary (/api/profile/*, /api/cdl), so tests are deterministic. */
const AMES_CLIMATE = {
  monthlyMeanTempF: [19.5, 24.7, 36.7, 48.9, 60.8, 70.8, 74.9, 72.8, 64.7, 50.7, 36.3, 24.8],
  monthlyRainIn: [0.94, 1.05, 1.92, 3.54, 4.58, 5.19, 4.16, 4.29, 3.27, 2.62, 1.72, 1.33],
};

export async function mockSources(page: Page) {
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
            // Ames, Iowa 1991–2020 normals (rounded) so Rotation Explorer can score climate fit.
            ...(id === 'power' ? { climate: AMES_CLIMATE } : {}),
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

