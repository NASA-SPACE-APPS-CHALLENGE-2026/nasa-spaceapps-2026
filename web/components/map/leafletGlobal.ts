import L from 'leaflet';

// Leaflet-Geoman patches the global `L`; ES imports are evaluated in order, so importing this module
// before '@geoman-io/leaflet-geoman-free' guarantees the global exists when Geoman loads.
(globalThis as unknown as { L: typeof L }).L = L;

export default L;
