'use client';

import L from './leafletGlobal';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import type { Feature, FeatureCollection } from 'geojson';
import { acresFromM2, areaM2 } from '@/lib/domain/acreage';
import type { FieldGeometry, LonLat } from '@/lib/domain/types';

const feat = (geometry: FieldGeometry): Feature => ({ type: 'Feature', properties: {}, geometry });

export interface MapShape {
  id: string;
  name: string;
  geometry: FieldGeometry;
  tone?: 'default' | 'selected' | 'muted' | 'error';
  /** Boundary not drawn yet: show only a pin here instead of the (approximate) shape. */
  pinOnly?: LonLat;
}

export type MapMode = 'browse' | 'draw' | 'pin' | 'edit';

export type MapFocus =
  | { key: string | number; kind: 'geometry'; geometry: FieldGeometry | FieldGeometry[] }
  | { key: string | number; kind: 'point'; center: LonLat; zoom: number };

export interface FieldMapProps {
  shapes: MapShape[];
  mode?: MapMode;
  draft?: { geometry?: FieldGeometry; pin?: LonLat } | null;
  editShapeId?: string | null;
  focus?: MapFocus | null;
  onSelect?: (id: string) => void;
  onDrawn?: (geometry: FieldGeometry) => void;
  onPinPlaced?: (point: LonLat) => void;
  onEditChange?: (geometry: FieldGeometry) => void;
  showLabels?: boolean;
  /** Map pixels covered by an overlay at the bottom (phone bottom sheet); fits keep shapes above it. */
  bottomInset?: number;
  className?: string;
}

const USGS_IMAGERY = 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}';
const OSM = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const US_CENTER: L.LatLngExpression = [39.5, -96.5];

const TONES: Record<NonNullable<MapShape['tone']>, L.PathOptions> = {
  default: { color: '#ffffff', weight: 2, fillColor: '#2b7fd0', fillOpacity: 0.18 },
  selected: { color: '#7cc0ff', weight: 4, fillColor: '#2b7fd0', fillOpacity: 0.28 },
  muted: { color: '#d6e1d9', weight: 1.5, fillColor: '#ffffff', fillOpacity: 0.08, dashArray: '4 4' },
  error: { color: '#ff8a70', weight: 2.5, fillColor: '#b3402a', fillOpacity: 0.2, dashArray: '6 4' },
};

const pinIconMuted = L.divIcon({
  className: 'pin-icon',
  iconSize: [28, 36],
  iconAnchor: [14, 34],
  html: `<svg viewBox="0 0 34 44" width="28" height="36" aria-hidden="true"><path d="M17 43C17 43 3 26 3 16a14 14 0 1 1 28 0c0 10-14 27-14 27Z" fill="#ffffff" stroke="#2b7fd0" stroke-width="3"/><circle cx="17" cy="16" r="5.5" fill="#2b7fd0"/></svg>`,
});

const pinIcon = L.divIcon({
  className: 'pin-icon',
  iconSize: [34, 44],
  iconAnchor: [17, 42],
  html: `<svg viewBox="0 0 34 44" width="34" height="44" aria-hidden="true"><path d="M17 43C17 43 3 26 3 16a14 14 0 1 1 28 0c0 10-14 27-14 27Z" fill="#2b7fd0" stroke="#fff" stroke-width="2.5"/><circle cx="17" cy="16" r="5.5" fill="#fff"/></svg>`,
});

function toLatLngBounds(geoms: FieldGeometry[]): L.LatLngBounds | null {
  if (!geoms.length) return null;
  const fc: FeatureCollection = { type: 'FeatureCollection', features: geoms.map(feat) };
  return L.geoJSON(fc).getBounds();
}

export default function FieldMap(props: FieldMapProps) {
  const { shapes, mode = 'browse', draft, editShapeId, focus, showLabels = true, className } = props;
  // Padding that keeps shapes clear of the edges and of a bottom sheet; shrinks on tiny maps so a fit never fails.
  const pad = (p: number): Pick<L.FitBoundsOptions, 'paddingTopLeft' | 'paddingBottomRight'> => {
    const size = map.current?.getSize() ?? L.point(0, 0);
    const inset = Math.max(0, Math.min(cb.current.bottomInset ?? 0, size.y * 0.7));
    const edge = Math.min(p, size.x / 6, size.y / 6);
    return { paddingTopLeft: [edge, edge], paddingBottomRight: [edge, edge + inset] };
  };
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const shapesLayer = useRef<L.LayerGroup | null>(null);
  const draftLayer = useRef<L.LayerGroup | null>(null);
  const editLayer = useRef<L.Polygon | null>(null);
  const cb = useRef(props);
  cb.current = props;
  const [base, setBase] = useState<'imagery' | 'osm'>('imagery');
  const [imageryFailed, setImageryFailed] = useState(false);
  const [drawPoints, setDrawPoints] = useState(0);
  const [drawAcres, setDrawAcres] = useState<number | null>(null);
  const working = useRef<L.Polyline | null>(null);
  /** Re-read the in-progress outline: corner count and live acreage once there are 3+ corners. */
  const syncDrawing = () => {
    const pts = ((working.current?.getLatLngs() ?? []) as L.LatLng[]).map((ll) => [ll.lng, ll.lat] as LonLat);
    setDrawPoints(pts.length);
    setDrawAcres(pts.length >= 3 ? acresFromM2(areaM2({ type: 'Polygon', coordinates: [[...pts, pts[0]]] })) : null);
  };
  const baseLayer = useRef<L.TileLayer | null>(null);
  const firstFit = useRef(false);

  // Create the map once.
  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { center: US_CENTER, zoom: 4, zoomControl: false, attributionControl: true, tap: true } as L.MapOptions);
    L.control.zoom({ position: 'topright' }).addTo(m);
    shapesLayer.current = L.layerGroup().addTo(m);
    draftLayer.current = L.layerGroup().addTo(m);
    m.pm.setGlobalOptions({ allowSelfIntersection: false, snappable: true, templineStyle: { color: '#7cc0ff' }, hintlineStyle: { color: '#7cc0ff', dashArray: '5 5' }, pathOptions: TONES.selected } as L.PM.GlobalOptions);
    m.on('pm:create', (e: { layer: L.Layer }) => {
      const gj = (e.layer as L.Polygon).toGeoJSON();
      m.removeLayer(e.layer);
      working.current = null;
      setDrawPoints(0);
      setDrawAcres(null);
      cb.current.onDrawn?.(gj.geometry as FieldGeometry);
    });
    m.on('pm:drawstart', (e: { workingLayer: L.Layer }) => {
      working.current = e.workingLayer as L.Polyline;
      setDrawPoints(0);
      setDrawAcres(null);
      e.workingLayer.on('pm:vertexadded', () => syncDrawing());
    });
    m.on('click', (e: L.LeafletMouseEvent) => {
      if (cb.current.mode === 'pin') cb.current.onPinPlaced?.([e.latlng.lng, e.latlng.lat]);
    });
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      firstFit.current = false;
    };
  }, []);

  // Base layer with automatic fallback when USGS imagery fails to load.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    baseLayer.current?.remove();
    let loaded = 0;
    let errors = 0;
    const layer =
      base === 'imagery'
        ? L.tileLayer(USGS_IMAGERY, { maxNativeZoom: 16, maxZoom: 19, attribution: 'Imagery: <a href="https://www.usgs.gov/programs/national-geospatial-program/national-map">USGS The National Map</a>' })
        : L.tileLayer(OSM, { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' });
    if (base === 'imagery') {
      layer.on('tileload', () => loaded++);
      layer.on('tileerror', () => {
        errors++;
        if (errors >= 4 && loaded === 0) {
          setImageryFailed(true);
          setBase('osm');
        }
      });
    }
    layer.addTo(m);
    layer.bringToBack();
    baseLayer.current = layer;
  }, [base]);

  // Field shapes.
  useEffect(() => {
    const m = map.current;
    const group = shapesLayer.current;
    if (!m || !group) return;
    group.clearLayers();
    for (const s of shapes) {
      if (mode === 'edit' && s.id === editShapeId) continue;
      const layer: L.Layer = s.pinOnly
        ? L.marker([s.pinOnly[1], s.pinOnly[0]], { icon: s.tone === 'selected' ? pinIcon : pinIconMuted, keyboard: false, pmIgnore: true } as L.MarkerOptions)
        : L.geoJSON(feat(s.geometry), { style: TONES[s.tone ?? 'default'], pmIgnore: true } as L.GeoJSONOptions);
      if (showLabels) {
        layer.bindTooltip(s.name, { permanent: s.tone === 'selected', direction: s.pinOnly ? 'top' : 'center', offset: s.pinOnly ? [0, -38] : [0, 0], className: 'field-label' });
      }
      layer.on('click', (e) => {
        if (cb.current.mode === 'browse') {
          L.DomEvent.stopPropagation(e);
          cb.current.onSelect?.(s.id);
        }
      });
      layer.addTo(group);
    }
    if (!firstFit.current && shapes.length && !focus) {
      const b = toLatLngBounds(shapes.map((s) => s.geometry));
      firstFit.current = true;
      // Wait a frame so the container has its final size before fitting.
      if (b) requestAnimationFrame(() => {
        const live = map.current;
        if (!live) return;
        live.invalidateSize();
        live.fitBounds(b, { ...pad(40), maxZoom: 16 });
      });
    }
  }, [shapes, mode, editShapeId, showLabels, focus]);

  // Draft shape / pin.
  useEffect(() => {
    const group = draftLayer.current;
    if (!group) return;
    group.clearLayers();
    if (draft?.geometry) {
      L.geoJSON(feat(draft.geometry), { style: { ...TONES.selected, dashArray: '8 6' }, pmIgnore: true } as L.GeoJSONOptions).addTo(group);
    }
    if (draft?.pin) L.marker([draft.pin[1], draft.pin[0]], { icon: pinIcon, keyboard: false, pmIgnore: true } as L.MarkerOptions).addTo(group);
  }, [draft]);

  // Drawing mode.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (mode === 'draw') {
      m.pm.enableDraw('Polygon', { finishOn: null, allowSelfIntersection: false } as L.PM.DrawModeOptions);
    } else if (m.pm.globalDrawModeEnabled()) {
      m.pm.disableDraw();
    }
    m.getContainer().style.cursor = mode === 'pin' ? 'crosshair' : '';
  }, [mode]);

  // Editing an existing shape.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    editLayer.current?.remove();
    editLayer.current = null;
    if (mode !== 'edit' || !editShapeId) return;
    const shape = cb.current.shapes.find((s) => s.id === editShapeId);
    if (!shape) return;
    const poly = (L.geoJSON(feat(shape.geometry), { style: TONES.selected }).getLayers()[0] as L.Polygon).addTo(m);
    poly.pm.enable({ allowSelfIntersection: false, snappable: true } as L.PM.EditModeOptions);
    const emit = () => cb.current.onEditChange?.(poly.toGeoJSON().geometry as FieldGeometry);
    poly.on('pm:edit', emit);
    poly.on('pm:markerdragend', emit);
    poly.on('pm:vertexremoved', emit);
    editLayer.current = poly;
    return () => {
      poly.pm.disable();
      poly.remove();
    };
  }, [mode, editShapeId]);

  // Programmatic focus (select a field, ZIP lookup, coordinates…).
  useEffect(() => {
    const m = map.current;
    if (!m || !focus) return;
    if (focus.kind === 'point') {
      // Shift the target up so it lands in the visible part above a bottom sheet.
      const target = m.unproject(m.project([focus.center[1], focus.center[0]], focus.zoom).add([0, (cb.current.bottomInset ?? 0) / 2]), focus.zoom);
      m.flyTo(target, focus.zoom, { duration: 0.8 });
    } else {
      const b = toLatLngBounds(Array.isArray(focus.geometry) ? focus.geometry : [focus.geometry]);
      if (b) m.flyToBounds(b, { ...pad(48), maxZoom: 16, duration: 0.8 });
    }
    firstFit.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.key]);

  // Leaflet needs a nudge when its container changes size (bottom sheet, panels).
  useEffect(() => {
    const m = map.current;
    if (!m || !el.current) return;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => ro.disconnect();
  }, []);

  const pm = map.current?.pm as unknown as { Draw?: { Polygon?: { _removeLastVertex?: () => void; _finishShape?: () => void } } } | undefined;

  return (
    <div className={className ?? 'relative h-full w-full'}>
      <div ref={el} className="absolute inset-0" data-testid="field-map" />
      <div className="pointer-events-none absolute bottom-6 left-3 z-[1000] flex flex-col items-start gap-2">
        {imageryFailed && base === 'osm' && (
          <p className="pointer-events-auto max-w-xs rounded-lg border border-line bg-panel/95 px-3 py-2 text-sm text-ink-soft">
            USGS satellite imagery is not loading right now, so this is the OpenStreetMap street map.
          </p>
        )}
        <div className="pointer-events-auto flex overflow-hidden rounded-parcel border border-line bg-panel text-sm font-semibold shadow-sm" role="group" aria-label="Map background">
          {(['imagery', 'osm'] as const).map((b) => (
            <button key={b} type="button" onClick={() => setBase(b)} aria-pressed={base === b} className={`min-h-11 px-4 ${base === b ? 'bg-field text-white' : 'text-ink-soft hover:bg-field-tint'}`}>
              {b === 'imagery' ? 'Satellite' : 'Street map'}
            </button>
          ))}
        </div>
      </div>
      {mode === 'draw' && (
        <div className="absolute inset-x-3 top-3 z-[1000] flex flex-wrap items-center gap-2 rounded-parcel border border-line bg-panel/95 p-2 pl-4 shadow-sm lg:right-auto lg:max-w-xl">
          <div className="min-w-0 flex-1" role="status" aria-live="polite">
            <p className="text-[15px]">
              {drawPoints === 0
                ? 'Tap the map at each corner of your field.'
                : drawPoints < 3
                  ? `${drawPoints} corner${drawPoints > 1 ? 's' : ''} placed. Keep going around the field.`
                  : 'Tap the first corner, or Finish shape, to close it.'}
            </p>
            {drawAcres !== null && (
              <p className="text-[14px] font-semibold text-field" data-testid="live-acres">
                About {drawAcres < 10 ? drawAcres.toFixed(1) : Math.round(drawAcres).toLocaleString('en-US')} acres so far
              </p>
            )}
          </div>
          <button type="button" disabled={drawPoints === 0} onClick={() => { pm?.Draw?.Polygon?._removeLastVertex?.(); syncDrawing(); }} className="min-h-11 rounded-parcel border border-line px-3 font-semibold disabled:opacity-40">
            Undo corner
          </button>
          <button type="button" disabled={drawPoints < 3} onClick={() => pm?.Draw?.Polygon?._finishShape?.()} className="min-h-11 rounded-parcel bg-field px-4 font-semibold text-white disabled:opacity-40">
            Finish shape
          </button>
        </div>
      )}
      {mode === 'pin' && (
        <p className="absolute inset-x-3 top-3 z-[1000] rounded-parcel border border-line bg-panel/95 px-4 py-3 text-[15px] shadow-sm lg:right-auto lg:max-w-md">
          Tap the middle of your field. Then you&rsquo;ll trace its edges.
        </p>
      )}
    </div>
  );
}
