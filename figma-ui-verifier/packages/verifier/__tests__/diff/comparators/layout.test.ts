import { describe, it, expect } from 'vitest';
import { compareLayout } from '../../../src/diff/comparators/layout.js';
import { DEFAULT_TOLERANCES } from '../../../src/config.js';
import type { NormalizedNode } from '../../../src/types.js';

function makeNode(overrides: Partial<NormalizedNode> = {}): NormalizedNode {
  return {
    id: '1:1', name: 'Test', type: 'FRAME', visible: true,
    x: 0, y: 0, width: 100, height: 100,
    isComponent: false, isInstance: false,
    ...overrides,
  };
}

describe('compareLayout', () => {
  it('should pass when position within tolerance', () => {
    const expected = makeNode({ x: 10, y: 20 });
    const actual = makeNode({ x: 11, y: 19 });
    const results = compareLayout(expected, actual, DEFAULT_TOLERANCES);
    expect(results.every(r => r.pass)).toBe(true);
  });

  it('should fail when position exceeds tolerance', () => {
    const expected = makeNode({ x: 10, y: 20 });
    const actual = makeNode({ x: 15, y: 20 });
    const results = compareLayout(expected, actual, DEFAULT_TOLERANCES);
    const xResult = results.find(r => r.property === 'x');
    expect(xResult!.pass).toBe(false);
  });

  it('should compare rotation', () => {
    const expected = makeNode({ rotation: 15 });
    const actual = makeNode({ rotation: 15 });
    const results = compareLayout(expected, actual, DEFAULT_TOLERANCES);
    const rotResult = results.find(r => r.property === 'rotation');
    expect(rotResult!.pass).toBe(true);
  });

  it('should fail rotation outside tolerance', () => {
    const expected = makeNode({ rotation: 15 });
    const actual = makeNode({ rotation: 20 });
    const results = compareLayout(expected, actual, DEFAULT_TOLERANCES);
    const rotResult = results.find(r => r.property === 'rotation');
    expect(rotResult!.pass).toBe(false);
  });
});
