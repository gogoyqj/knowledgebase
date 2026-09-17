import { describe, it, expect } from 'vitest';
import { compareAutoLayout } from '../../../src/diff/comparators/auto-layout.js';
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

describe('compareAutoLayout', () => {
  it('should pass matching flex properties', () => {
    const expected = makeNode({
      display: 'flex', flexDirection: 'column',
      justifyContent: 'center', alignItems: 'center',
    });
    const actual = makeNode({
      display: 'flex', flexDirection: 'column',
      justifyContent: 'center', alignItems: 'center',
    });
    const results = compareAutoLayout(expected, actual, DEFAULT_TOLERANCES);
    expect(results.every(r => r.pass)).toBe(true);
  });

  it('should fail on flexDirection mismatch', () => {
    const expected = makeNode({ display: 'flex', flexDirection: 'column' });
    const actual = makeNode({ display: 'flex', flexDirection: 'row' });
    const results = compareAutoLayout(expected, actual, DEFAULT_TOLERANCES);
    expect(results.find(r => r.property === 'flex-direction')!.pass).toBe(false);
  });

  it('should compare gap within tolerance', () => {
    const expected = makeNode({ gap: 12 });
    const actual = makeNode({ gap: 11 });
    const results = compareAutoLayout(expected, actual, DEFAULT_TOLERANCES);
    expect(results.find(r => r.property === 'gap')!.pass).toBe(true);
  });

  it('should compare padding', () => {
    const expected = makeNode({ padding: { top: 16, right: 16, bottom: 16, left: 16 } });
    const actual = makeNode({ padding: { top: 16, right: 16, bottom: 16, left: 16 } });
    const results = compareAutoLayout(expected, actual, DEFAULT_TOLERANCES);
    expect(results.filter(r => r.property.startsWith('padding')).every(r => r.pass)).toBe(true);
  });

  it('should compare border-radius', () => {
    const expected = makeNode({ borderRadius: 12 });
    const actual = makeNode({ borderRadius: 12 });
    const results = compareAutoLayout(expected, actual, DEFAULT_TOLERANCES);
    expect(results.find(r => r.property === 'border-radius')!.pass).toBe(true);
  });
});
