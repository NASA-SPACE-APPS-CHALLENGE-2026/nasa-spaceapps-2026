import { describe, expect, it } from 'vitest';
import { activeStep, CAMERA_KEYS, cameraAt, fitFactor, sceneAt, SLAB_LIFT, stillsAt, TEXT_STEPS, textState } from '@/components/landing/hero/timeline';

const step = (id: string) => TEXT_STEPS.find((s) => s.id === id)!;

describe('hero text sequence', () => {
  it('shows the site name alone on load', () => {
    expect(textState(step('name'), 0).opacity).toBe(1);
    for (const s of TEXT_STEPS.filter((s) => s.id !== 'name')) expect(textState(s, 0).opacity).toBe(0);
  });

  it('puts one idea on screen at a time, in order', () => {
    const order = [0.05, 0.22, 0.4, 0.6, 0.85].map(activeStep);
    expect(order).toEqual(['name', 'tagline', 'description', 'mission', 'cta']);
  });

  it('never shows two steps fully at once', () => {
    for (let p = 0; p <= 1; p += 0.005) {
      const visible = TEXT_STEPS.filter((s) => textState(s, p).opacity > 0.6);
      expect(visible.length).toBeLessThanOrEqual(1);
    }
  });

  it('keeps the CTA on screen once it has appeared', () => {
    for (const p of [0.76, 0.9, 1]) expect(textState(step('cta'), p).opacity).toBe(1);
  });

  it('is the same scrubbing back as forward', () => {
    expect(textState(step('tagline'), 0.2)).toEqual(textState(step('tagline'), 0.2));
  });
});

describe('hero camera', () => {
  it('starts high above (satellite) and ends low beside the slab (soil)', () => {
    expect(cameraAt(0).pos[1]).toBeGreaterThan(100);
    expect(cameraAt(1).pos[1]).toBeLessThan(3);
  });

  it('hits every keyframe exactly', () => {
    for (const k of CAMERA_KEYS) k.pos.forEach((v, i) => expect(cameraAt(k.p).pos[i]).toBeCloseTo(v, 9));
  });

  it('clamps outside 0–1', () => {
    expect(cameraAt(-1)).toEqual(cameraAt(0));
    expect(cameraAt(2)).toEqual(cameraAt(1));
  });

  it('moves continuously (no jumps between frames)', () => {
    let prev = cameraAt(0).pos;
    for (let p = 0.002; p <= 1; p += 0.002) {
      const cur = cameraAt(p).pos;
      const d = Math.hypot(cur[0] - prev[0], cur[1] - prev[1], cur[2] - prev[2]);
      expect(d).toBeLessThan(2);
      prev = cur;
    }
  });

  it('pulls back on portrait screens only', () => {
    expect(fitFactor(16 / 9)).toBe(1);
    expect(fitFactor(375 / 812)).toBeGreaterThan(1.5);
  });
});

describe('hero scene', () => {
  it('keeps the slab flush with the patchwork until the field is outlined', () => {
    expect(sceneAt(0.2).lift).toBe(0);
    expect(sceneAt(0.2).ground).toBe(1);
    expect(sceneAt(0.3).outline).toBe(1);
  });

  it('lifts the slab out and fades the patchwork by the field view', () => {
    expect(sceneAt(0.5).lift).toBe(SLAB_LIFT);
    expect(sceneAt(0.5).ground).toBe(0);
  });

  it('grows the roots in the soil stage', () => {
    expect(sceneAt(0.6).roots).toBe(0);
    expect(sceneAt(0.95).roots).toBe(1);
  });

  it('hands each rendered still over to the next', () => {
    expect(stillsAt(0).satellite).toBe(1);
    expect(stillsAt(0.45).field).toBe(1);
    expect(stillsAt(0.65).rows).toBe(1);
    expect(stillsAt(1).soil).toBe(1);
  });
});
