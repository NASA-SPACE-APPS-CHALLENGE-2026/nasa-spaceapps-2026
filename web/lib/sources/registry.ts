import { bboxOf, interiorPoint } from '../domain/acreage';
import { SOURCE_META } from '../domain/sourceMeta';
import type { FieldGeometry, SourceId, SourceResult } from '../domain/types';
import { imergSource } from './imerg';
import { smapSource } from './smap';
import { ndviSource } from './ndvi';
import { elevationSource } from './elevation';
import { powerSource } from './power';
import { ssurgoSource } from './ssurgo';
import type { ProfileSource, SourceDeps } from './types';

export const SOURCES: Record<SourceId, ProfileSource> = {
  power: powerSource,
  ssurgo: ssurgoSource,
  elevation: elevationSource,
  smap: smapSource,
  imerg: imergSource,
  ndvi: ndviSource,
};

/** Run one source in isolation. Whatever happens inside, the caller gets a SourceResult. */
export async function runSource(id: SourceId, geometry: FieldGeometry, deps: SourceDeps, now = new Date()): Promise<SourceResult> {
  const meta = SOURCE_META[id];
  try {
    return await SOURCES[id].run({ geometry, point: interiorPoint(geometry), bbox: bboxOf(geometry), now }, deps);
  } catch (err) {
    return {
      sourceId: id,
      sourceName: meta.provider,
      docsUrl: meta.docsUrl,
      status: 'unavailable',
      message: `Unexpected error in the ${meta.provider} module: ${(err as Error)?.message ?? String(err)}`,
      values: [],
    };
  }
}
