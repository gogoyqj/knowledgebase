import { describe, it, expect } from 'vitest';
import { parseFigmaTree, mockText } from '../../src/figma/parser.js';
import type { FigmaNode } from '../../src/types.js';

describe('parseFigmaTree', () => {
  it('should flatten nested nodes', () => {
    const root: FigmaNode = {
      id: '1:1', name: 'Root', type: 'FRAME',
      x: 0, y: 0, width: 100, height: 100,
      children: [
        { id: '1:2', name: 'Child', type: 'TEXT', x: 10, y: 10, width: 80, height: 20, characters: 'Hello' },
      ],
    };
    const result = parseFigmaTree(root);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('1:1');
    expect(result[1].id).toBe('1:2');
  });

  it('should mock TEXT node characters', () => {
    const root: FigmaNode = {
      id: '1:1', name: 'Text', type: 'TEXT',
      x: 0, y: 0, width: 100, height: 20,
      characters: 'Hello World',
    };
    const result = parseFigmaTree(root);
    expect(result[0].characters).toBe('XXXXX XXXXX');
  });

  it('should filter hidden nodes by default', () => {
    const root: FigmaNode = {
      id: '1:1', name: 'Root', type: 'FRAME',
      x: 0, y: 0, width: 100, height: 100,
      children: [
        { id: '1:2', name: 'Hidden', type: 'FRAME', x: 0, y: 0, width: 50, height: 50, visible: false },
        { id: '1:3', name: 'Visible', type: 'FRAME', x: 0, y: 0, width: 50, height: 50 },
      ],
    };
    const result = parseFigmaTree(root);
    expect(result).toHaveLength(2); // Root + Visible
    expect(result.find(n => n.id === '1:2')).toBeUndefined();
  });

  it('should include hidden nodes when option set', () => {
    const root: FigmaNode = {
      id: '1:1', name: 'Root', type: 'FRAME',
      x: 0, y: 0, width: 100, height: 100,
      children: [
        { id: '1:2', name: 'Hidden', type: 'FRAME', x: 0, y: 0, width: 50, height: 50, visible: false },
      ],
    };
    const result = parseFigmaTree(root, { includeHiddenNodes: true });
    expect(result).toHaveLength(2);
  });

  it('should preserve parent reference', () => {
    const root: FigmaNode = {
      id: '1:1', name: 'Root', type: 'FRAME',
      x: 0, y: 0, width: 100, height: 100,
      children: [
        { id: '1:2', name: 'Child', type: 'FRAME', x: 10, y: 10, width: 80, height: 80 },
      ],
    };
    const result = parseFigmaTree(root);
    expect(result[1].parent?.id).toBe('1:1');
  });

  it('should handle empty tree', () => {
    const root: FigmaNode = {
      id: '1:1', name: 'Empty', type: 'FRAME',
      x: 0, y: 0, width: 100, height: 100,
    };
    const result = parseFigmaTree(root);
    expect(result).toHaveLength(1);
  });
});

describe('mockText', () => {
  it('should replace non-space chars with X', () => {
    expect(mockText('Hello')).toBe('XXXXX');
  });

  it('should preserve spaces', () => {
    expect(mockText('Hello World')).toBe('XXXXX XXXXX');
  });

  it('should preserve newlines', () => {
    expect(mockText('Line1\nLine2')).toBe('XXXXX\nXXXXX');
  });

  it('should handle multi-byte content', () => {
    expect(mockText('你好世界')).toBe('XXXX');
  });
});
