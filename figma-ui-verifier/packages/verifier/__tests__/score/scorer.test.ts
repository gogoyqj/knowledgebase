import { describe, it, expect } from 'vitest';
import { calculateScore } from '../../src/score/scorer.js';
import { DEFAULT_WEIGHTS } from '../../src/config.js';
import type { DiffResult, MatchedPair, NormalizedNode } from '../../src/types.js';

function makeNode(id: string): NormalizedNode {
  return {
    id, name: 'Test', type: 'FRAME', visible: true,
    x: 0, y: 0, width: 100, height: 100,
    isComponent: false, isInstance: false,
  };
}

describe('calculateScore', () => {
  it('should return 100 for all passing diffs', () => {
    const diffs: DiffResult[] = [
      { nodeId: '1', nodeName: 'N', category: 'position_size', property: 'x', expected: 0, actual: 0, pass: true },
      { nodeId: '1', nodeName: 'N', category: 'color_style', property: 'bg', expected: '#fff', actual: '#fff', pass: true },
      { nodeId: '1', nodeName: 'N', category: 'typography', property: 'fontSize', expected: 14, actual: 14, pass: true },
      { nodeId: '1', nodeName: 'N', category: 'layout_properties', property: 'gap', expected: 8, actual: 8, pass: true },
    ];
    const matched: MatchedPair[] = [{ figma: makeNode('1'), dom: makeNode('1') }];
    const result = calculateScore(diffs, matched, [], [], DEFAULT_WEIGHTS, 1);
    expect(result.overall).toBe(100);
    expect(result.missing_nodes).toBe(0);
    expect(result.extra_nodes).toBe(0);
  });

  it('should reduce score for missing nodes', () => {
    const matched: MatchedPair[] = [{ figma: makeNode('1'), dom: makeNode('1') }];
    const missing = [makeNode('2')];
    const result = calculateScore([], matched, missing, [], DEFAULT_WEIGHTS, 2);
    expect(result.breakdown.completeness).toBeLessThan(100);
    expect(result.missing_nodes).toBe(1);
  });

  it('should reduce score for extra nodes', () => {
    const matched: MatchedPair[] = [{ figma: makeNode('1'), dom: makeNode('1') }];
    const extra = [makeNode('extra')];
    const result = calculateScore([], matched, [], extra, DEFAULT_WEIGHTS, 1);
    expect(result.breakdown.completeness).toBeLessThan(100);
    expect(result.extra_nodes).toBe(1);
  });

  it('should apply category weights correctly', () => {
    const diffs: DiffResult[] = [
      { nodeId: '1', nodeName: 'N', category: 'position_size', property: 'x', expected: 0, actual: 0, pass: true },
      { nodeId: '1', nodeName: 'N', category: 'color_style', property: 'bg', expected: '#fff', actual: '#f00', pass: false },
    ];
    const matched: MatchedPair[] = [{ figma: makeNode('1'), dom: makeNode('1') }];
    const result = calculateScore(diffs, matched, [], [], DEFAULT_WEIGHTS, 1);
    expect(result.breakdown.position_size).toBe(100);
    expect(result.breakdown.color_style).toBe(0);
    expect(result.overall).toBeLessThan(100);
  });
});
