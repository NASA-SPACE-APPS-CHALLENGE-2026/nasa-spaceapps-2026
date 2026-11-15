import { describe, expect, it } from 'vitest';
import { squareAroundPoint } from '@/lib/domain/acreage';
import type { FieldGeometry } from '@/lib/domain/types';
import { hasBlockingIssue, overlapIssues, validateGeometry } from '@/lib/domain/validation';

const codes = (g: FieldGeometry) => validateGeometry(g).map((i) => i.code);

describe('geometry validation', () => {
  it('accepts a normal Iowa field with no issues', () => {
    expect(validateGeometry(squareAroundPoint([-93.6, 42.0], 80))).toEqual([]);
  });

  it('rejects a self-intersecting (bow-tie) polygon', () => {
    const bowtie: FieldGeometry = { type: 'Polygon', coordinates: [[[-93.6, 42], [-93.59, 42.01], [-93.59, 42], [-93.6, 42.01], [-93.6, 42]]] };
    const issues = validateGeometry(bowtie);
    expect(issues.map((i) => i.code)).toContain('self-intersecting');
    expect(hasBlockingIssue(issues)).toBe(true);
  });

  it('warns (but allows) outside the lower 48', () => {
    const alaska = squareAroundPoint([-149.9, 61.2], 40);
    const issues = validateGeometry(alaska);
    expect(issues.map((i) => i.code)).toEqual(['outside-conus']);
    expect(hasBlockingIssue(issues)).toBe(false);
  });

  it('warns on tiny and huge fields', () => {
    expect(codes(squareAroundPoint([-93.6, 42], 0.2))).toContain('too-small');
    expect(codes(squareAroundPoint([-93.6, 42], 6000))).toContain('too-large');
  });

  it('rejects projected (non lat/lon) coordinates', () => {
    const projected: FieldGeometry = { type: 'Polygon', coordinates: [[[500000, 4600000], [501000, 4600000], [501000, 4601000], [500000, 4600000]]] };
    expect(codes(projected)).toEqual(['bad-coordinates']);
  });

  it('warns about overlap with existing fields above 0.1 ac', () => {
    const a = squareAroundPoint([-93.6, 42], 40);
    const shifted = squareAroundPoint([-93.599, 42], 40); // ~83 m east: big overlap
    const far = squareAroundPoint([-93.5, 42], 40);
    expect(overlapIssues(shifted, [{ id: 'a', name: 'North 40', geometry: a }]).map((i) => i.message)[0]).toMatch(/Overlaps "North 40" by about \d+\.\d acres/);
    expect(overlapIssues(far, [{ id: 'a', name: 'North 40', geometry: a }])).toEqual([]);
  });
});
