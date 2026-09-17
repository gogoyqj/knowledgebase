import { describe, it, expect } from 'vitest';
import {
  extractFigmaTokens,
  extractCodeTokens,
  matchTokens,
} from '../../src/verify/design-tokens.js';
import type { NormalizedNode } from '../../src/types.js';

describe('extractFigmaTokens', () => {
  it('should extract color tokens', () => {
    const nodes: NormalizedNode[] = [{
      id: '1', name: 'Button', type: 'FRAME', visible: true,
      x: 0, y: 0, width: 100, height: 40,
      backgroundColor: { r: 37, g: 99, b: 235, a: 1 },
      isComponent: false, isInstance: false,
    }];
    const tokens = extractFigmaTokens(nodes);
    const colorTokens = tokens.filter(t => t.type === 'color');
    expect(colorTokens).toHaveLength(1);
    expect(colorTokens[0].value).toBe('#2563eb');
  });

  it('should extract spacing tokens', () => {
    const nodes: NormalizedNode[] = [{
      id: '1', name: 'Container', type: 'FRAME', visible: true,
      x: 0, y: 0, width: 100, height: 100,
      gap: 16,
      padding: { top: 8, right: 12, bottom: 8, left: 12 },
      isComponent: false, isInstance: false,
    }];
    const tokens = extractFigmaTokens(nodes);
    const spacingTokens = tokens.filter(t => t.type === 'spacing');
    expect(spacingTokens.length).toBeGreaterThanOrEqual(2);
    expect(spacingTokens.some(t => t.value === '16px')).toBe(true);
    expect(spacingTokens.some(t => t.value === '8px')).toBe(true);
  });

  it('should extract typography tokens', () => {
    const nodes: NormalizedNode[] = [{
      id: '1', name: 'Title', type: 'TEXT', visible: true,
      x: 0, y: 0, width: 200, height: 30,
      fontSize: 24, fontWeight: 700,
      isComponent: false, isInstance: false,
    }];
    const tokens = extractFigmaTokens(nodes);
    expect(tokens.some(t => t.type === 'fontSize' && t.value === '24px')).toBe(true);
    expect(tokens.some(t => t.type === 'fontWeight' && t.value === '700')).toBe(true);
  });

  it('should extract border radius tokens', () => {
    const nodes: NormalizedNode[] = [{
      id: '1', name: 'Card', type: 'FRAME', visible: true,
      x: 0, y: 0, width: 100, height: 100,
      borderRadius: 8,
      isComponent: false, isInstance: false,
    }];
    const tokens = extractFigmaTokens(nodes);
    expect(tokens.some(t => t.type === 'borderRadius' && t.value === '8px')).toBe(true);
  });

  it('should deduplicate tokens', () => {
    const nodes: NormalizedNode[] = [
      {
        id: '1', name: 'Btn1', type: 'FRAME', visible: true,
        x: 0, y: 0, width: 100, height: 40,
        backgroundColor: { r: 37, g: 99, b: 235, a: 1 },
        isComponent: false, isInstance: false,
      },
      {
        id: '2', name: 'Btn2', type: 'FRAME', visible: true,
        x: 0, y: 50, width: 100, height: 40,
        backgroundColor: { r: 37, g: 99, b: 235, a: 1 },
        isComponent: false, isInstance: false,
      },
    ];
    const tokens = extractFigmaTokens(nodes);
    const colorTokens = tokens.filter(t => t.type === 'color');
    expect(colorTokens).toHaveLength(1); // deduplicated
  });
});

describe('extractCodeTokens', () => {
  it('should extract CSS custom properties', () => {
    const css = `
      :root {
        --color-primary: #2563eb;
        --spacing-md: 16px;
        --font-size-lg: 24px;
        --radius-sm: 4px;
      }
    `;
    const tokens = extractCodeTokens(css);
    expect(tokens).toHaveLength(4);
    expect(tokens.find(t => t.name === 'color-primary')?.value).toBe('#2563eb');
    expect(tokens.find(t => t.name === 'spacing-md')?.value).toBe('16px');
  });

  it('should infer token types', () => {
    const css = `
      --color-bg: #fff;
      --spacing-8: 8px;
      --font-size-sm: 14px;
      --radius-md: 8px;
    `;
    const tokens = extractCodeTokens(css);
    expect(tokens.find(t => t.name === 'color-bg')?.type).toBe('color');
    expect(tokens.find(t => t.name === 'spacing-8')?.type).toBe('spacing');
    expect(tokens.find(t => t.name === 'font-size-sm')?.type).toBe('fontSize');
    expect(tokens.find(t => t.name === 'radius-md')?.type).toBe('borderRadius');
  });
});

describe('matchTokens', () => {
  it('should match identical tokens', () => {
    const figma = extractFigmaTokens([{
      id: '1', name: 'Button', type: 'FRAME', visible: true,
      x: 0, y: 0, width: 100, height: 40,
      backgroundColor: { r: 37, g: 99, b: 235, a: 1 },
      isComponent: false, isInstance: false,
    }]);
    const code = extractCodeTokens(':root { --color-primary: #2563eb; }');

    const result = matchTokens(figma, code);
    expect(result.matchRate).toBeGreaterThan(0);
    expect(result.matchedTokens).toBeGreaterThanOrEqual(1);
  });

  it('should detect unmatched tokens', () => {
    const figma = extractFigmaTokens([{
      id: '1', name: 'Button', type: 'FRAME', visible: true,
      x: 0, y: 0, width: 100, height: 40,
      backgroundColor: { r: 37, g: 99, b: 235, a: 1 },
      isComponent: false, isInstance: false,
    }]);
    const code = extractCodeTokens(':root { --color-primary: #ff0000; }');

    const result = matchTokens(figma, code);
    expect(result.unmatchedTokens).toBeGreaterThanOrEqual(1);
  });

  it('should return 100% for empty figma tokens', () => {
    const result = matchTokens([], []);
    expect(result.matchRate).toBe(1);
  });
});