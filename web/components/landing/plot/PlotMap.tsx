'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { Map as MapLibreMap, NavigationControl, setWorkerUrl, type ErrorEvent as MapErrorEvent, type StyleSpecification } from 'maplibre-gl';
import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { TerraDraw, TerraDrawPolygonMode, TerraDrawSelectMode } from 'terra-draw';
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';
import type { Polygon } from 'geojson';
import type { LonLat } from '@/lib/domain/types';

export interface PlotMapHandle {
  clear(): void;
  flyTo(center: LonLat, zoom?: number): void;
}

interface Props {
  ref?: Ref<PlotMapHandle>;
  /** Called on every edit with the polygon so far (null when empty); `closed` once the ring is finished. */
  onShape(shape: Polygon | null, closed: boolean): void;
  onError(): void;
}

const TOKEN = process.env.NEXT_PUBLIC_MAP_TOKEN;

/** Satellite imagery: Mapbox when a token is set, otherwise USGS imagery (no key needed, same as the app's map). */
function satelliteStyle(): StyleSpecification {
  const source = TOKEN
    ? {
        tiles: [`https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.jpg90?access_token=${TOKEN}`],
        tileSize: 512,
        maxzoom: 19,
        attribution: '© Mapbox © Maxar',
      }
    : {
        tiles: ['https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        maxzoom: 16,
        attribution: 'Imagery: USGS The National Map',
      };
  return {
    version: 8,
    sources: { satellite: { type: 'raster', ...source } },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#1a1510' } },
      { id: 'satellite', type: 'raster', source: 'satellite' },
    ],
  };
}

/** Full-bleed satellite map with a terra-draw polygon tool. Click corners; click the first corner to close. */
export default function PlotMap({ ref, onShape, onError }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const draw = useRef<TerraDraw | null>(null);
  const cb = useRef({ onShape, onError });
  cb.current = { onShape, onError };

  useImperativeHandle(ref, () => ({
    clear() {
      draw.current?.clear();
      draw.current?.setMode('polygon');
      cb.current.onShape(null, false);
    },
    flyTo(center, zoom = 16) {
      map.current?.flyTo({ center, zoom, speed: 1.6 });
    },
  }));

  useEffect(() => {
    if (!el.current) return;
    // The worker is copied into public/ by scripts/copy-maplibre-worker.mjs (the bundler can't resolve it).
    setWorkerUrl('/vendor/maplibre-gl-worker.mjs');
    let m: MapLibreMap;
    try {
      m = new MapLibreMap({
        container: el.current,
        style: satelliteStyle(),
        center: [-93.6, 42.03],
        zoom: 13,
        maxZoom: 19,
        attributionControl: { compact: true },
      });
    } catch {
      cb.current.onError(); // no WebGL
      return;
    }
    map.current = m;
    m.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');
    // Missing tiles (edge of the imagery, a flaky connection) leave the dark background showing; drawing still works.
    m.on('error', (e: MapErrorEvent) => console.warn('Map:', e.error?.message));

    m.on('load', () => {
      const td = new TerraDraw({
        adapter: new TerraDrawMapLibreGLAdapter({ map: m }),
        modes: [
          new TerraDrawPolygonMode({
            editable: true,
            styles: {
              fillColor: '#8fbf4a',
              fillOpacity: 0.22,
              outlineColor: '#d4f58a',
              outlineWidth: 3,
              closingPointColor: '#d9b65a',
              closingPointWidth: 7,
              closingPointOutlineColor: '#1a1510',
              closingPointOutlineWidth: 2,
              editedPointColor: '#d9b65a',
              editedPointWidth: 7,
            },
          }),
          new TerraDrawSelectMode({
            flags: { polygon: { feature: { draggable: false, coordinates: { draggable: true, midpoints: true, deletable: true } } } },
            styles: {
              selectedPolygonColor: '#8fbf4a',
              selectedPolygonFillOpacity: 0.22,
              selectedPolygonOutlineColor: '#d4f58a',
              selectedPolygonOutlineWidth: 3,
              selectionPointColor: '#d9b65a',
              selectionPointWidth: 7,
              selectionPointOutlineColor: '#1a1510',
              selectionPointOutlineWidth: 2,
              midPointColor: '#f4f2ec',
              midPointWidth: 4,
            },
          }),
        ],
      });
      td.start();
      td.setMode('polygon');
      draw.current = td;

      const report = (closed: boolean) => {
        const poly = td.getSnapshot().find((f) => f.geometry.type === 'Polygon');
        const ring = poly ? (poly.geometry as Polygon).coordinates[0] : [];
        // A ring needs 3 distinct corners (4 points with the closing one) before it has an area.
        cb.current.onShape(poly && ring.length >= 4 ? (poly.geometry as Polygon) : null, closed);
      };
      td.on('change', () => report(td.getSnapshot().some((f) => f.geometry.type === 'Polygon' && !f.properties.currentlyDrawing)));
      td.on('finish', (id, ctx) => {
        report(true);
        // One field at a time: once the ring closes, switch to editing it (drag corners) instead of starting another.
        if (ctx.mode === 'polygon') {
          td.setMode('select');
          td.selectFeature(id);
        }
      });
    });

    return () => {
      draw.current?.stop();
      draw.current = null;
      m.remove();
      map.current = null;
    };
  }, []);

  // MapLibre's stylesheet makes its container position: relative, so the container fills a positioned wrapper.
  return (
    // On phones the field panel covers the bottom of the map, so the zoom buttons and credits sit above it.
    <div className="absolute inset-0 [&_.maplibregl-ctrl-bottom-right]:bottom-[300px] md:[&_.maplibregl-ctrl-bottom-right]:bottom-0">
      <div ref={el} className="h-full w-full" />
    </div>
  );
}
