import { describe, it, expect } from 'vitest';
import { compareEffects } from '../../../src/diff/comparators/effects.js';
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

describe('compareEffects', () => {
  it('should pass matching box-shadow', () => {
    const shadow = '0px 2px 8px 0px rgba(0,0,0,0.1)';
    const expected = makeNode({ boxShadow: shadow });
    const actual = makeNode({ boxShadow: shadow });
    const results = compareEffects(expected, actual, DEFAULT_TOLERANCES);
    expect(results.find(r => r.property === 'box-shadow')!.pass).toBe(true);
  });

  it('should fail mismatched box-shadow', () => {
    const expected = makeNode({ boxShadow: '0px 2px 8px 0px rgba(0,0,0,0.1)' });
    const actual = makeNode({ boxShadow: '0px 4px 12px 0px rgba(0,0,0,0.2)' });
    const results = compareEffects(expected, actual, DEFAULT_TOLERANCES);
    expect(results.find(r => r.property === 'box-shadow')!.pass).toBe(false);
  });

  it('should compare overflow', () => {
    const expected = makeNode({ overflow: 'hidden' });
    const actual = makeNode({ overflow: 'visible' });
    const results = compareEffects(expected, actual, DEFAULT_TOLERANCES);
    expect(results.find(r => r.property === 'overflow')!.pass).toBe(false);
  });

  it('should compare filter', () => {
    const expected = makeNode({ filter: 'blur(4px)' });
    const actual = makeNode({ filter: 'blur(4px)' });
    const results = compareEffects(expected, actual, DEFAULT_TOLERANCES);
    expect(results.find(r => r.property === 'filter')!.pass).toBe(true);
  });
});
