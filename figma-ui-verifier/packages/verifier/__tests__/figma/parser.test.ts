import { describe, it, expect } from 'vitest';
import { parseFigmaTree, mockText, filterInstanceChildren } from '../../src/figma/parser.js';
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

describe('Instance handling', () => {
  const instanceTree: FigmaNode = {
    id: '1:1', name: 'Root', type: 'FRAME',
    x: 0, y: 0, width: 400, height: 300,
    children: [
      {
        id: '2:1', name: 'Button', type: 'INSTANCE',
        componentId: 'comp-1',
        x: 10, y: 10, width: 100, height: 40,
        children: [
          { id: '2:2', name: 'Label', type: 'TEXT', x: 10, y: 10, width: 80, height: 20, characters: 'Click' },
          { id: '2:3', name: 'Icon', type: 'VECTOR', x: 80, y: 10, width: 20, height: 20 },
        ],
      },
      { id: '3:1', name: 'Title', type: 'TEXT', x: 10, y: 60, width: 200, height: 30, characters: 'Hello' },
    ],
  };

  it('should include instance children by default', () => {
    const result = parseFigmaTree(instanceTree);
    expect(result).toHaveLength(5); // Root, Button, Label, Icon, Title
    expect(result.find(n => n.id === '2:2')).toBeDefined();
    expect(result.find(n => n.id === '2:3')).toBeDefined();
  });

  it('should skip instance children when option set', () => {
    const result = parseFigmaTree(instanceTree, { skipInstanceChildren: true });
    expect(result).toHaveLength(3); // Root, Button, Title
    expect(result.find(n => n.id === '2:1')).toBeDefined(); // Button instance kept
    expect(result.find(n => n.id === '2:2')).toBeUndefined(); // Label skipped
    expect(result.find(n => n.id === '2:3')).toBeUndefined(); // Icon skipped
  });

  it('should mark nodes inside instance', () => {
    const result = parseFigmaTree(instanceTree);
    const label = result.find(n => n.id === '2:2')!;
    const icon = result.find(n => n.id === '2:3')!;
    const button = result.find(n => n.id === '2:1')!;
    const title = result.find(n => n.id === '3:1')!;

    // Children of instance should be marked
    expect((label as FigmaNode & { _insideInstance?: boolean })._insideInstance).toBe(true);
    expect((icon as FigmaNode & { _insideInstance?: boolean })._insideInstance).toBe(true);

    // Instance itself should NOT be marked as inside instance
    expect((button as FigmaNode & { _insideInstance?: boolean })._insideInstance).toBeUndefined();

    // Non-instance nodes should not be marked
    expect((title as FigmaNode & { _insideInstance?: boolean })._insideInstance).toBeUndefined();
  });

  it('should filter instance children', () => {
    const allNodes = parseFigmaTree(instanceTree);
    const filtered = filterInstanceChildren(allNodes);
    expect(filtered).toHaveLength(3); // Root, Button, Title
    expect(filtered.find(n => n.id === '2:2')).toBeUndefined();
    expect(filtered.find(n => n.id === '2:3')).toBeUndefined();
  });

  it('should handle nested instances', () => {
    const nestedTree: FigmaNode = {
      id: '1:1', name: 'Root', type: 'FRAME',
      x: 0, y: 0, width: 400, height: 300,
      children: [{
        id: '2:1', name: 'Card', type: 'INSTANCE',
        componentId: 'comp-card',
        x: 10, y: 10, width: 200, height: 100,
        children: [{
          id: '2:2', name: 'InnerButton', type: 'INSTANCE',
          componentId: 'comp-btn',
          x: 10, y: 60, width: 80, height: 30,
          children: [
            { id: '2:3', name: 'BtnLabel', type: 'TEXT', x: 0, y: 0, width: 80, height: 30, characters: 'OK' },
          ],
        }],
      }],
    };

    const result = parseFigmaTree(nestedTree, { skipInstanceChildren: true });
    // Root + Card (instance children skipped, so InnerButton and BtnLabel are skipped)
    expect(result).toHaveLength(2);
    expect(result.find(n => n.id === '1:1')).toBeDefined();
    expect(result.find(n => n.id === '2:1')).toBeDefined();
  });
});
