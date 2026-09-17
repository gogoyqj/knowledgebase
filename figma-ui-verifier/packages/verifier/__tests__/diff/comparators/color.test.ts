import { describe, it, expect } from 'vitest';
import { deltaE2000, colorMatch, compareColor } from '../../../src/diff/comparators/color.js';
import { DEFAULT_TOLERANCES } from '../../../src/config.js';
import type { NormalizedNode, RGBAColor } from '../../../src/types.js';

function makeNode(overrides: Partial<NormalizedNode> = {}): NormalizedNode {
  return {
    id: '1:1', name: 'Test', type: 'FRAME', visible: true,
    x: 0, y: 0, width: 100, height: 100,
    isComponent: false, isInstance: false,
    ...overrides,
  };
}

describe('deltaE2000', () => {
  it('should return 0 for identical colors', () => {
    const c: RGBAColor = { r: 255, g: 0, b: 0, a: 1 };
    expect(deltaE2000(c, c)).toBeCloseTo(0, 2);
  });

  it('should return small value for similar colors', () => {
    const c1: RGBAColor = { r: 255, g: 0, b: 0, a: 1 };
    const c2: RGBAColor = { r: 253, g: 2, b: 2, a: 1 };
    expect(deltaE2000(c1, c2)).toBeLessThan(3.0);
  });

  it('should return large value for very different colors', () => {
    const c1: RGBAColor = { r: 255, g: 0, b: 0, a: 1 };
    const c2: RGBAColor = { r: 0, g: 0, b: 255, a: 1 };
    expect(deltaE2000(c1, c2)).toBeGreaterThan(30);
  });
});

describe('colorMatch', () => {
  const tolerances = DEFAULT_TOLERANCES.color;

  it('should pass identical colors', () => {
    const c: RGBAColor = { r: 128, g: 128, b: 128, a: 1 };
    expect(colorMatch(c, c, tolerances)).toBe(true);
  });

  it('should pass within CIEDE2000 tolerance', () => {
    const c1: RGBAColor = { r: 100, g: 100, b: 100, a: 1 };
    const c2: RGBAColor = { r: 102, g: 101, b: 99, a: 1 };
    expect(colorMatch(c1, c2, tolerances)).toBe(true);
  });

  it('should fail when alpha differs too much', () => {
    const c1: RGBAColor = { r: 100, g: 100, b: 100, a: 1 };
    const c2: RGBAColor = { r: 100, g: 100, b: 100, a: 0.5 };
    expect(colorMatch(c1, c2, tolerances)).toBe(false);
  });
});

describe('compareColor', () => {
  const tolerances = DEFAULT_TOLERANCES;

  it('should compare backgroundColor', () => {
    const expected = makeNode({ backgroundColor: { r: 255, g: 255, b: 255, a: 1 } });
    const actual = makeNode({ backgroundColor: { r: 255, g: 255, b: 255, a: 1 } });
    const results = compareColor(expected, actual, tolerances);
    expect(results).toHaveLength(1);
    expect(results[0].pass).toBe(true);
  });

  it('should fail on backgroundColor mismatch', () => {
    const expected = makeNode({ backgroundColor: { r: 255, g: 0, b: 0, a: 1 } });
    const actual = makeNode({ backgroundColor: { r: 0, g: 0, b: 255, a: 1 } });
    const results = compareColor(expected, actual, tolerances);
    expect(results[0].pass).toBe(false);
    expect(results[0].fix).toContain('background-color');
  });

  it('should fail when actual has no backgroundColor', () => {
    const expected = makeNode({ backgroundColor: { r: 255, g: 255, b: 255, a: 1 } });
    const actual = makeNode();
    const results = compareColor(expected, actual, tolerances);
    expect(results[0].pass).toBe(false);
  });

  it('should compare opacity', () => {
    const expected = makeNode({ opacity: 0.5 });
    const actual = makeNode({ opacity: 0.5 });
    const results = compareColor(expected, actual, tolerances);
    const opacityResult = results.find(r => r.property === 'opacity');
    expect(opacityResult?.pass).toBe(true);
  });
});
