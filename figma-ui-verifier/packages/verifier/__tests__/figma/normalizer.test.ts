import { describe, it, expect } from 'vitest';
import { normalizeFigmaNode, p3TosRGB } from '../../src/figma/normalizer.js';
import type { FigmaNode } from '../../src/types.js';

describe('p3TosRGB', () => {
  it('should convert P3 white to sRGB (255,255,255)', () => {
    const result = p3TosRGB({ r: 1, g: 1, b: 1, a: 1 });
    expect(result.r).toBe(255);
    expect(result.g).toBe(255);
    expect(result.b).toBe(255);
    expect(result.a).toBe(1);
  });

  it('should convert P3 black to sRGB (0,0,0)', () => {
    const result = p3TosRGB({ r: 0, g: 0, b: 0, a: 1 });
    expect(result.r).toBe(0);
    expect(result.g).toBe(0);
    expect(result.b).toBe(0);
  });

  it('should apply fillOpacity multiplier', () => {
    const result = p3TosRGB({ r: 1, g: 0, b: 0, a: 1 }, 0.5);
    expect(result.a).toBe(0.5);
  });

  it('should handle zero alpha', () => {
    const result = p3TosRGB({ r: 1, g: 1, b: 1, a: 0 });
    expect(result.a).toBe(0);
  });
});

describe('normalizeFigmaNode', () => {
  const baseNode: FigmaNode = {
    id: '1:1', name: 'Test', type: 'FRAME',
    x: 10, y: 20, width: 100, height: 50,
  };

  it('should normalize basic properties', () => {
    const result = normalizeFigmaNode(baseNode);
    expect(result.id).toBe('1:1');
    expect(result.x).toBe(10);
    expect(result.y).toBe(20);
    expect(result.width).toBe(100);
    expect(result.height).toBe(50);
    expect(result.visible).toBe(true);
    expect(result.isComponent).toBe(false);
    expect(result.isInstance).toBe(false);
  });

  it('should extract first visible solid fill as backgroundColor', () => {
    const node: FigmaNode = {
      ...baseNode,
      fills: [
        { type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 }, visible: true },
      ],
    };
    const result = normalizeFigmaNode(node);
    expect(result.backgroundColor).toBeDefined();
    expect(result.backgroundColor!.r).toBe(255);
    expect(result.backgroundColor!.g).toBe(0);
    expect(result.backgroundColor!.b).toBe(0);
  });

  it('should skip invisible fills', () => {
    const node: FigmaNode = {
      ...baseNode,
      fills: [
        { type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 }, visible: false },
      ],
    };
    const result = normalizeFigmaNode(node);
    expect(result.backgroundColor).toBeUndefined();
  });

  it('should convert negative rotation to positive CSS deg', () => {
    const node: FigmaNode = { ...baseNode, rotation: -15 };
    const result = normalizeFigmaNode(node);
    expect(result.rotation).toBe(15);
  });

  it('should map auto-layout properties', () => {
    const node: FigmaNode = {
      ...baseNode,
      layoutMode: 'VERTICAL',
      primaryAxisAlignItems: 'CENTER',
      counterAxisAlignItems: 'MAX',
      itemSpacing: 12,
    };
    const result = normalizeFigmaNode(node);
    expect(result.display).toBe('flex');
    expect(result.flexDirection).toBe('column');
    expect(result.justifyContent).toBe('center');
    expect(result.alignItems).toBe('flex-end');
    expect(result.gap).toBe(12);
  });

  it('should map DROP_SHADOW to box-shadow', () => {
    const node: FigmaNode = {
      ...baseNode,
      effects: [
        { type: 'DROP_SHADOW', offset: { x: 0, y: 2 }, radius: 8, color: { r: 0, g: 0, b: 0, a: 0.1 } },
      ],
    };
    const result = normalizeFigmaNode(node);
    expect(result.boxShadow).toContain('8px');
    expect(result.boxShadow).toContain('2px');
  });

  it('should map clipsContent to overflow', () => {
    const node: FigmaNode = { ...baseNode, clipsContent: true };
    const result = normalizeFigmaNode(node);
    expect(result.overflow).toBe('hidden');
  });

  it('should handle INSTANCE type', () => {
    const node: FigmaNode = { ...baseNode, type: 'INSTANCE' };
    const result = normalizeFigmaNode(node);
    expect(result.isInstance).toBe(true);
  });
});
