'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { cameraAt, fitFactor, sceneAt } from './timeline';
import { PATCH_SIZE, patchworkTexture, rng, SLAB_D, SLAB_W, slabTopTexture, strataTexture } from './textures';

export interface FarmSceneProps {
  /** Live scroll progress (0–1), written by the scroll listener; read every frame, never re-renders. */
  progress: { current: number };
  /** Freeze idle motion (reduced motion / static render). */
  still?: boolean;
  /** Optional rendered satellite image to use instead of the drawn patchwork. */
  satelliteImage?: string | null;
}

const ROWS = 14;
const PER_ROW = 30;
const ROW_Z = (i: number) => -SLAB_D / 2 + 0.4 + (i * (SLAB_D - 0.8)) / (ROWS - 1);
const PLANT_X = (j: number) => -SLAB_W / 2 + 0.3 + (j * (SLAB_W - 0.6)) / (PER_ROW - 1);

const LAYERS = [
  { name: 'topsoil', h: 0.9, inset: 0, base: '#3b2a1c', grains: ['#2a1d13', '#4b3726', '#33241a'], pebbles: 6 },
  { name: 'subsoil', h: 1.1, inset: 0.06, base: '#5e4128', grains: ['#4e3520', '#6e4e31', '#553a24'], pebbles: 18 },
  { name: 'clay', h: 1.0, inset: 0.12, base: '#8a6842', grains: ['#7a5a38', '#9a7850', '#836240'], pebbles: 30 },
  { name: 'parent', h: 1.0, inset: 0.2, base: '#a08d6e', grains: ['#8f7c5f', '#b39f80', '#7d6b52'], pebbles: 90 },
];

export function FarmScene({ progress, still, satelliteImage }: FarmSceneProps) {
  const { camera, size } = useThree();
  const smoothed = useRef(progress.current);
  const slab = useRef<THREE.Group>(null);
  const ground = useRef<THREE.MeshStandardMaterial>(null);
  const clods = useRef<THREE.Group>(null);

  // ---- Textures and geometry (built once) ----
  const patch = useMemo(() => {
    if (!satelliteImage) return patchworkTexture();
    const t = new THREE.TextureLoader().load(satelliteImage);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [satelliteImage]);
  const top = useMemo(() => slabTopTexture(ROWS), []);
  const layerMats = useMemo(
    () =>
      LAYERS.map((l, i) => {
        const side = new THREE.MeshStandardMaterial({ map: strataTexture(l.base, l.grains, l.pebbles, 11 + i), roughness: 0.95 });
        const plain = new THREE.MeshStandardMaterial({ color: l.base, roughness: 1 });
        // Box faces: +x, -x, +y, -y, +z, -z
        return [side, side, i === 0 ? new THREE.MeshStandardMaterial({ map: top, roughness: 0.95 }) : plain, plain, side, side];
      }),
    [top],
  );

  const plants = useMemo(() => {
    const geo = new THREE.ConeGeometry(0.1, 0.5, 5);
    geo.translate(0, 0.25, 0);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.8, flatShading: true });
    const mesh = new THREE.InstancedMesh(geo, mat, ROWS * PER_ROW);
    const r = rng(42);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const col = new THREE.Color();
    const greens = ['#6f9a33', '#7fae3d', '#5d8a2a', '#8fbf4a'];
    let n = 0;
    for (let i = 0; i < ROWS; i++) {
      for (let j = 0; j < PER_ROW; j++) {
        const k = 0.75 + r() * 0.5;
        q.setFromEuler(new THREE.Euler((r() - 0.5) * 0.25, r() * Math.PI, (r() - 0.5) * 0.25));
        s.set(k, k * (0.9 + r() * 0.5), k);
        m.compose(new THREE.Vector3(PLANT_X(j) + (r() - 0.5) * 0.06, 0, ROW_Z(i) + (r() - 0.5) * 0.05), q, s);
        mesh.setMatrixAt(n, m);
        mesh.setColorAt(n, col.set(greens[Math.floor(r() * greens.length)]));
        n++;
      }
    }
    return mesh;
  }, []);

  const roots = useMemo(() => buildRoots(), []);

  const outline = useMemo(() => buildOutline(), []);
  useEffect(() => {
    outline.core.material.resolution.set(size.width, size.height);
    outline.glow.material.resolution.set(size.width, size.height);
  }, [outline, size]);

  const clodData = useMemo(() => {
    const r = rng(9);
    return Array.from({ length: 8 }, (_, i) => {
      const side = i % 2 ? 1 : -1;
      return {
        pos: new THREE.Vector3(side * (SLAB_W / 2 + 0.8 + r() * 2.2), -0.5 - r() * 3, -2.5 + r() * 6.5),
        r: 0.12 + r() * 0.26,
        phase: r() * Math.PI * 2,
        colour: ['#4a3624', '#5e4128', '#3b2a1c'][i % 3],
      };
    });
  }, []);

  useEffect(
    () => () => {
      patch.dispose();
      top.dispose();
      layerMats.flat().forEach((m) => m.dispose());
      plants.geometry.dispose();
      (plants.material as THREE.Material).dispose();
      roots.forEach((rt) => rt.mesh.geometry.dispose());
      outline.core.geometry.dispose();
      outline.glow.geometry.dispose();
    },
    [patch, top, layerMats, plants, roots, outline],
  );

  // ---- Per frame: everything follows scroll progress ----
  const target = useMemo(() => new THREE.Vector3(), []);
  useFrame((state, dt) => {
    const goal = progress.current;
    smoothed.current = still ? goal : THREE.MathUtils.damp(smoothed.current, goal, 7, Math.min(dt, 0.1));
    const p = smoothed.current;
    const sc = sceneAt(p);
    const cam = cameraAt(p);
    const fit = fitFactor(size.width / size.height);
    target.set(...cam.target);
    camera.position.set(
      cam.target[0] + (cam.pos[0] - cam.target[0]) * fit,
      cam.target[1] + (cam.pos[1] - cam.target[1]) * fit,
      cam.target[2] + (cam.pos[2] - cam.target[2]) * fit,
    );
    camera.lookAt(target);

    const t = still ? 0 : state.clock.elapsedTime;
    if (slab.current) {
      slab.current.position.y = sc.lift + Math.sin(t * 0.6) * 0.08 * sc.drift;
      slab.current.rotation.y = Math.sin(t * 0.25) * 0.05 * sc.drift;
      slab.current.rotation.x = Math.sin(t * 0.4 + 1) * 0.015 * sc.drift;
    }
    if (ground.current) {
      ground.current.opacity = sc.ground;
      ground.current.visible = sc.ground > 0.001;
    }
    // Fog sits just past the satellite view, pushed back by the same amount as the camera on portrait screens.
    if (state.scene.fog instanceof THREE.Fog) {
      state.scene.fog.near = 165 * fit;
      state.scene.fog.far = 250 * fit;
    }
    // Outline draws on (rebuilt only when the drawn share changes), then dims a little down at the soil.
    const share = Math.round(sc.outline * 400) / 400;
    if (share !== outline.share) {
      outline.share = share;
      if (share > 0) {
        const pts = outline.partial(share);
        writeSegments(outline.core.geometry, pts);
        writeSegments(outline.glow.geometry, pts);
      }
    }
    outline.core.visible = outline.glow.visible = share > 0;
    outline.core.material.opacity = sc.outlineGlow;
    outline.glow.material.opacity = 0.28 * sc.outlineGlow;
    // Roots grow down.
    for (const rt of roots) {
      const g = THREE.MathUtils.clamp((sc.roots - rt.delay) / (1 - rt.delay), 0, 1);
      rt.mesh.geometry.setDrawRange(0, Math.floor(g * rt.segments) * rt.radial * 6);
      rt.mesh.visible = g > 0;
    }
    if (clods.current) {
      clods.current.visible = sc.clods > 0.01;
      clods.current.children.forEach((c, i) => {
        const d = clodData[i];
        c.scale.setScalar(d.r * sc.clods);
        c.position.set(d.pos.x, sc.lift + d.pos.y + Math.sin(t * 0.7 + d.phase) * 0.15, d.pos.z);
        c.rotation.set(t * 0.2 + d.phase, t * 0.15, 0);
      });
    }
  });

  let depth = 0;
  return (
    <>
      <color attach="background" args={['#1a1510']} />
      <fog attach="fog" args={['#1a1510', 165, 250]} />
      <hemisphereLight args={['#f4ead2', '#1a1510', 1.1]} />
      <directionalLight position={[9, 16, 10]} intensity={2.4} color="#ffe3b5" />
      <directionalLight position={[-12, 6, -8]} intensity={0.5} color="#9fb6d9" />

      <mesh rotation-x={-Math.PI / 2} position-y={-0.02}>
        <planeGeometry args={[PATCH_SIZE, PATCH_SIZE]} />
        <meshStandardMaterial ref={ground} map={patch} roughness={1} transparent depthWrite={false} />
      </mesh>

      <group ref={slab}>
        {LAYERS.map((l, i) => {
          const y = -depth - l.h / 2;
          depth += l.h;
          return (
            <mesh key={l.name} position-y={y} material={layerMats[i]}>
              <boxGeometry args={[SLAB_W - l.inset * 2, l.h, SLAB_D - l.inset * 2]} />
            </mesh>
          );
        })}
        <primitive object={plants} />
        {roots.map((rt, i) => (
          <primitive key={i} object={rt.mesh} />
        ))}
        <group position-y={0.55}>
          <primitive object={outline.glow} />
          <primitive object={outline.core} />
        </group>
      </group>

      <group ref={clods}>
        {clodData.map((d, i) => (
          <mesh key={i}>
            <dodecahedronGeometry args={[1, 0]} />
            <meshStandardMaterial color={d.colour} roughness={1} flatShading />
          </mesh>
        ))}
      </group>
    </>
  );
}

/** Field boundary: a slightly irregular polygon around the slab top. partial(f) returns the first share f of it. */
function buildOutline() {
  const hw = SLAB_W / 2 + 0.25;
  const hd = SLAB_D / 2 + 0.25;
  const corners: [number, number][] = [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd * 0.45],
    [hw * 0.68, hd],
    [-hw, hd],
    [-hw, -hd],
  ];
  const lens = corners.slice(1).map((c, i) => Math.hypot(c[0] - corners[i][0], c[1] - corners[i][1]));
  const total = lens.reduce((a, b) => a + b, 0);
  /** Always the same number of points; corners not reached yet collapse onto the pen tip. */
  const partial = (f: number): number[] => {
    const pts: number[] = [corners[0][0], 0, corners[0][1]];
    let left = Math.max(0.001, f) * total;
    let tip: [number, number] = corners[0];
    for (let i = 0; i < lens.length; i++) {
      if (left > 0) {
        const t = Math.min(1, left / lens[i]);
        const [x0, z0] = corners[i];
        const [x1, z1] = corners[i + 1];
        tip = [x0 + (x1 - x0) * t, z0 + (z1 - z0) * t];
        left -= lens[i];
      }
      pts.push(tip[0], 0, tip[1]);
    }
    return pts;
  };
  const make = (width: number, colour: string, opacity: number) => {
    const geo = new LineGeometry();
    geo.setPositions(partial(1));
    const mat = new LineMaterial({ color: colour, linewidth: width, transparent: true, opacity, depthWrite: false, toneMapped: false });
    if (width > 4) mat.blending = THREE.AdditiveBlending;
    const line = new Line2(geo, mat);
    line.renderOrder = 10;
    line.frustumCulled = false; // the buffer is rewritten in place, so its bounds would go stale
    return line as Line2 & { geometry: LineGeometry; material: LineMaterial };
  };
  return { core: make(2.5, '#d4f58a', 1), glow: make(12, '#8fbf4a', 0.28), partial, share: -1 };
}

/** Rewrite a LineGeometry's segments in place (same point count), so the GPU buffer size never changes. */
function writeSegments(geo: LineGeometry, pts: number[]) {
  const attr = geo.attributes.instanceStart as THREE.InterleavedBufferAttribute;
  const arr = attr.data.array as Float32Array;
  for (let i = 0; i < pts.length / 3 - 1; i++) {
    for (let k = 0; k < 6; k++) arr[i * 6 + k] = pts[i * 3 + k];
  }
  attr.data.needsUpdate = true;
}

/** Roots on the front face of the slab: wandering tubes that grow downward through the top two layers. */
function buildRoots() {
  const r = rng(5);
  const mat = new THREE.MeshStandardMaterial({ color: '#e8d9b4', roughness: 0.7, emissive: '#3a2f1c', emissiveIntensity: 0.4 });
  const out: { mesh: THREE.Mesh; segments: number; radial: number; delay: number }[] = [];
  const z = SLAB_D / 2 + 0.025;
  for (let j = 1; j < PER_ROW; j += 2) {
    const x = PLANT_X(j);
    const len = 1.2 + r() * 1.3;
    const main = walk(x, 0, z, len, r);
    out.push(tube(main, 0.026, mat, r() * 0.25));
    for (let b = 0; b < 2; b++) {
      const at = main.getPoint(0.25 + r() * 0.5);
      out.push(tube(walk(at.x, at.y, z, 0.3 + r() * 0.6, r, (b ? 1 : -1) * 0.5), 0.014, mat, 0.35 + r() * 0.35));
    }
  }
  return out;
}

function walk(x: number, y: number, z: number, len: number, r: () => number, lean = 0) {
  const pts = [new THREE.Vector3(x, y, z)];
  const steps = 7;
  let cx = x;
  for (let i = 1; i <= steps; i++) {
    cx += (r() - 0.5) * 0.25 + lean * 0.12;
    pts.push(new THREE.Vector3(cx, y - (len * i) / steps, z));
  }
  return new THREE.CatmullRomCurve3(pts);
}

function tube(curve: THREE.Curve<THREE.Vector3>, radius: number, mat: THREE.Material, delay: number) {
  const segments = 32;
  const radial = 5;
  const geo = new THREE.TubeGeometry(curve, segments, radius, radial, false);
  return { mesh: new THREE.Mesh(geo, mat), segments, radial, delay };
}
