import { describe, it, expect } from 'vitest';
import { hungarianMatch } from '../../src/match/matcher.js';
import type { NormalizedNode } from '../../src/types.js';

function makeNode(id: string, overrides: Partial<NormalizedNode> = {}): NormalizedNode {
  return {
    id, name: 'Test', type: 'FRAME', visible: true,
    x: 0, y: 0, width: 100, height: 100,
    isComponent: false, isInstance: false,
    ...overrides,
  };
}

describe('hungarianMatch', () => {
  it('should match nodes with same position and size', () => {
    const figma = [makeNode('f1', { x: 10, y: 10, width: 100, height: 50 })];
    const dom = [makeNode('d1', { x: 10, y: 10, width: 100, height: 50 })];
    const result = hungarianMatch(figma, dom);
    expect(result).toHaveLength(1);
    expect(result[0].figma.id).toBe('f1');
    expect(result[0].dom.id).toBe('d1');
  });

  it('should not match with IoU < 0.5', () => {
    const figma = [makeNode('f1', { x: 0, y: 0, width: 100, height: 100 })];
    const dom = [makeNode('d1', { x: 200, y: 200, width: 100, height: 100 })];
    const result = hungarianMatch(figma, dom);
    expect(result).toHaveLength(0);
  });

  it('should handle empty inputs', () => {
    expect(hungarianMatch([], [])).toHaveLength(0);
    expect(hungarianMatch([makeNode('f1')], [])).toHaveLength(0);
    expect(hungarianMatch([], [makeNode('d1')])).toHaveLength(0);
  });

  it('should find optimal matching for multiple nodes', () => {
    const figma = [
      makeNode('f1', { x: 0, y: 0, width: 100, height: 50 }),
      makeNode('f2', { x: 200, y: 0, width: 100, height: 50 }),
    ];
    const dom = [
      makeNode('d2', { x: 200, y: 0, width: 100, height: 50 }),
      makeNode('d1', { x: 0, y: 0, width: 100, height: 50 }),
    ];
    const result = hungarianMatch(figma, dom);
    expect(result).toHaveLength(2);
    // Should match f1↔d1, f2↔d2 (optimal)
    const match1 = result.find(m => m.figma.id === 'f1');
    expect(match1?.dom.id).toBe('d1');
  });
});
