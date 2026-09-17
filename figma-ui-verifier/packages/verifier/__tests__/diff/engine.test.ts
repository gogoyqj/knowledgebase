import { describe, it, expect } from 'vitest';
import { diffNodes } from '../../src/diff/engine.js';
import { DEFAULT_CONFIG } from '../../src/config.js';
import type { NormalizedNode } from '../../src/types.js';

function makeNode(overrides: Partial<NormalizedNode> = {}): NormalizedNode {
  return {
    id: '1:1', name: 'Test', type: 'FRAME', visible: true,
    x: 0, y: 0, width: 100, height: 100,
    isComponent: false, isInstance: false,
    ...overrides,
  };
}

describe('diffNodes', () => {
  it('should match nodes by ID', () => {
    const figma = [makeNode({ id: '1:1' })];
    const dom = [makeNode({ id: '1:1' })];
    const result = diffNodes(figma, dom, DEFAULT_CONFIG);
    expect(result.matched).toHaveLength(1);
    expect(result.missing).toHaveLength(0);
    expect(result.extra).toHaveLength(0);
  });

  it('should detect missing nodes', () => {
    const figma = [makeNode({ id: '1:1' }), makeNode({ id: '1:2' })];
    const dom = [makeNode({ id: '1:1' })];
    const result = diffNodes(figma, dom, DEFAULT_CONFIG);
    expect(result.matched).toHaveLength(1);
    expect(result.missing).toHaveLength(1);
    expect(result.missing[0].id).toBe('1:2');
  });

  it('should detect extra nodes', () => {
    const figma = [makeNode({ id: '1:1' })];
    const dom = [makeNode({ id: '1:1' }), makeNode({ id: '1:2' })];
    const result = diffNodes(figma, dom, DEFAULT_CONFIG);
    expect(result.matched).toHaveLength(1);
    expect(result.extra).toHaveLength(1);
    expect(result.extra[0].id).toBe('1:2');
  });

  it('should compare matching nodes and produce diffs', () => {
    const figma = [makeNode({ id: '1:1', width: 200, height: 100 })];
    const dom = [makeNode({ id: '1:1', width: 195, height: 100 })];
    const result = diffNodes(figma, dom, DEFAULT_CONFIG);
    expect(result.diffs.length).toBeGreaterThan(0);
    const widthDiff = result.diffs.find(d => d.property === 'width');
    expect(widthDiff).toBeDefined();
    expect(widthDiff!.pass).toBe(false); // Δ5px > tolerance 2px
  });

  it('should pass when within tolerance', () => {
    const figma = [makeNode({ id: '1:1', width: 100, height: 100 })];
    const dom = [makeNode({ id: '1:1', width: 101, height: 100 })];
    const result = diffNodes(figma, dom, DEFAULT_CONFIG);
    const widthDiff = result.diffs.find(d => d.property === 'width');
    expect(widthDiff!.pass).toBe(true); // Δ1px <= tolerance 2px
  });

  it('should handle empty inputs', () => {
    const result = diffNodes([], [], DEFAULT_CONFIG);
    expect(result.matched).toHaveLength(0);
    expect(result.missing).toHaveLength(0);
    expect(result.extra).toHaveLength(0);
    expect(result.diffs).toHaveLength(0);
  });

  it('should use Hungarian fallback for unmatched nodes with similar position', () => {
    // Figma has node '3:1' at (100, 100, 200, 50)
    // DOM has node 'dom-1' at (102, 98, 198, 52) — close enough for IoU match
    const figma = [makeNode({ id: '3:1', x: 100, y: 100, width: 200, height: 50, type: 'FRAME' })];
    const dom = [makeNode({ id: 'dom-1', x: 102, y: 98, width: 198, height: 52, type: 'FRAME' })];

    const result = diffNodes(figma, dom, DEFAULT_CONFIG);

    // Hungarian should match these based on spatial proximity
    expect(result.matched).toHaveLength(1);
    expect(result.missing).toHaveLength(0);
    expect(result.extra).toHaveLength(0);
    expect(result.fallbackMatched).toBe(1);
    expect(result.matched[0].figma.id).toBe('3:1');
    expect(result.matched[0].dom.id).toBe('dom-1');
  });

  it('should not match nodes with very different positions via Hungarian', () => {
    // Figma node at top-left, DOM node at bottom-right — low IoU
    const figma = [makeNode({ id: '3:1', x: 0, y: 0, width: 50, height: 50, type: 'FRAME' })];
    const dom = [makeNode({ id: 'dom-1', x: 1000, y: 1000, width: 50, height: 50, type: 'FRAME' })];

    const result = diffNodes(figma, dom, DEFAULT_CONFIG);

    expect(result.matched).toHaveLength(0);
    expect(result.missing).toHaveLength(1);
    expect(result.extra).toHaveLength(1);
    expect(result.fallbackMatched).toBe(0);
  });

  it('should prefer ID matching over Hungarian fallback', () => {
    // Two nodes: one with matching ID, one without
    const figma = [
      makeNode({ id: '1:1', x: 10, y: 10, width: 100, height: 100 }),
      makeNode({ id: '2:1', x: 200, y: 200, width: 100, height: 100 }),
    ];
    const dom = [
      makeNode({ id: '1:1', x: 10, y: 10, width: 100, height: 100 }),
      makeNode({ id: 'dom-1', x: 202, y: 198, width: 98, height: 102 }),
    ];

    const result = diffNodes(figma, dom, DEFAULT_CONFIG);

    // '1:1' matched by ID, '2:1' matched by Hungarian to 'dom-1'
    expect(result.matched).toHaveLength(2);
    expect(result.missing).toHaveLength(0);
    expect(result.extra).toHaveLength(0);
    expect(result.fallbackMatched).toBe(1);
  });
});
