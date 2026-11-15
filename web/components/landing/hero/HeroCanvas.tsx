'use client';

import { Canvas } from '@react-three/fiber';
import { useState } from 'react';
import * as THREE from 'three';
import { FarmScene, type FarmSceneProps } from './FarmScene';

interface HeroCanvasProps extends FarmSceneProps {
  /** Stop rendering while the hero is scrolled out of view. */
  paused?: boolean;
  label: string;
}

/** The WebGL layer. Loaded lazily (next/dynamic, no SSR); fades in over the poster once the first frame is drawn. */
export default function HeroCanvas({ paused, still, label, ...scene }: HeroCanvasProps) {
  const [ready, setReady] = useState(false);
  return (
    <div
      role="img"
      aria-label={label}
      className={`absolute inset-0 transition-opacity duration-700 ${ready ? 'opacity-100' : 'opacity-0'}`}
    >
      <Canvas
        dpr={[1, 1.75]}
        frameloop={still ? 'demand' : paused ? 'never' : 'always'}
        camera={{ fov: 35, near: 0.1, far: 600, position: [0, 150, 34] }}
        gl={{ antialias: true, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping }}
        onCreated={() => requestAnimationFrame(() => setReady(true))}
      >
        <FarmScene still={still} {...scene} />
      </Canvas>
    </div>
  );
}
