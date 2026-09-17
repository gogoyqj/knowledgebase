import { describe, it, expect } from 'vitest';
import { normalizeDOMNode, parseColor } from '../../src/dom/normalizer.js';
import type { RawDOMElement } from '../../src/dom/normalizer.js';

describe('parseColor', () => {
  it('should parse rgb()', () => {
    const result = parseColor('rgb(255, 128, 0)');
    expect(result).toEqual({ r: 255, g: 128, b: 0, a: 1 });
  });

  it('should parse rgba()', () => {
    const result = parseColor('rgba(0, 0, 0, 0.5)');
    expect(result).toEqual({ r: 0, g: 0, b: 0, a: 0.5 });
  });

  it('should parse hex 6', () => {
    const result = parseColor('#ff8000');
    expect(result).toEqual({ r: 255, g: 128, b: 0, a: 1 });
  });

  it('should parse hex 3', () => {
    const result = parseColor('#f80');
    expect(result).toEqual({ r: 255, g: 136, b: 0, a: 1 });
  });
});

describe('normalizeDOMNode', () => {
  const baseRaw: RawDOMElement = {
    figmaId: '1:1',
    tagName: 'div',
    rect: { x: 100, y: 200, width: 300, height: 150 },
    parentRect: { x: 50, y: 100, width: 400, height: 300 },
    styles: {
      backgroundColor: 'rgb(255, 255, 255)',
      paddingTop: '16px', paddingRight: '16px',
      paddingBottom: '16px', paddingLeft: '16px',
      borderTopWidth: '0px', borderRightWidth: '0px',
      borderBottomWidth: '0px', borderLeftWidth: '0px',
      borderRadius: '8px', opacity: '1',
      fontSize: '14px', fontFamily: 'Inter',
      fontWeight: '400', lineHeight: '20px',
      letterSpacing: 'normal', gap: '8px',
      display: 'flex', flexDirection: 'column',
      justifyContent: 'flex-start', alignItems: 'stretch',
      boxShadow: 'none', filter: 'none', backdropFilter: 'none',
      overflow: 'visible',
    },
    boxSizing: 'border-box',
    children: [],
    textContent: null,
  };

  it('should calculate relative position', () => {
    const result = normalizeDOMNode(baseRaw);
    expect(result.x).toBe(50); // 100 - 50
    expect(result.y).toBe(100); // 200 - 100
  });

  it('should use rect dimensions for border-box', () => {
    const result = normalizeDOMNode(baseRaw);
    expect(result.width).toBe(300);
    expect(result.height).toBe(150);
  });

  it('should normalize content-box dimensions', () => {
    const raw: RawDOMElement = {
      ...baseRaw,
      boxSizing: 'content-box',
      styles: {
        ...baseRaw.styles,
        paddingTop: '10px', paddingRight: '10px',
        paddingBottom: '10px', paddingLeft: '10px',
        borderTopWidth: '2px', borderRightWidth: '2px',
        borderBottomWidth: '2px', borderLeftWidth: '2px',
      },
    };
    const result = normalizeDOMNode(raw);
    expect(result.width).toBe(300 + 20 + 4); // rect + padding + border
    expect(result.height).toBe(150 + 20 + 4);
  });

  it('should parse padding', () => {
    const result = normalizeDOMNode(baseRaw);
    expect(result.padding).toEqual({ top: 16, right: 16, bottom: 16, left: 16 });
  });

  it('should parse typography properties', () => {
    const result = normalizeDOMNode(baseRaw);
    expect(result.fontSize).toBe(14);
    expect(result.fontFamily).toBe('Inter');
    expect(result.fontWeight).toBe(400);
    expect(result.lineHeight).toBe(20);
  });

  it('should map tag names to node types', () => {
    const span: RawDOMElement = { ...baseRaw, tagName: 'span' };
    expect(normalizeDOMNode(span).type).toBe('TEXT');

    const svg: RawDOMElement = { ...baseRaw, tagName: 'svg' };
    expect(normalizeDOMNode(svg).type).toBe('VECTOR');
  });
});
