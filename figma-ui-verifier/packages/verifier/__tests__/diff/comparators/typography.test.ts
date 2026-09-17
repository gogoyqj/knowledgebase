import { describe, it, expect } from 'vitest';
import { compareTypography } from '../../../src/diff/comparators/typography.js';
import { DEFAULT_TOLERANCES } from '../../../src/config.js';
import type { NormalizedNode } from '../../../src/types.js';

function makeNode(overrides: Partial<NormalizedNode> = {}): NormalizedNode {
  return {
    id: '1:1', name: 'Test', type: 'TEXT', visible: true,
    x: 0, y: 0, width: 100, height: 20,
    isComponent: false, isInstance: false,
    ...overrides,
  };
}

describe('compareTypography', () => {
  it('should pass matching font-size', () => {
    const expected = makeNode({ fontSize: 16 });
    const actual = makeNode({ fontSize: 16 });
    const results = compareTypography(expected, actual, DEFAULT_TOLERANCES);
    expect(results.find(r => r.property === 'font-size')!.pass).toBe(true);
  });

  it('should fail font-size outside tolerance', () => {
    const expected = makeNode({ fontSize: 16 });
    const actual = makeNode({ fontSize: 14 });
    const results = compareTypography(expected, actual, DEFAULT_TOLERANCES);
    expect(results.find(r => r.property === 'font-size')!.pass).toBe(false);
  });

  it('should match font-family ignoring quotes', () => {
    const expected = makeNode({ fontFamily: 'Inter' });
    const actual = makeNode({ fontFamily: "'Inter'" });
    const results = compareTypography(expected, actual, DEFAULT_TOLERANCES);
    expect(results.find(r => r.property === 'font-family')!.pass).toBe(true);
  });

  it('should compare font-weight', () => {
    const expected = makeNode({ fontWeight: 700 });
    const actual = makeNode({ fontWeight: 400 });
    const results = compareTypography(expected, actual, DEFAULT_TOLERANCES);
    expect(results.find(r => r.property === 'font-weight')!.pass).toBe(false);
  });
});
