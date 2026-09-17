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
});
