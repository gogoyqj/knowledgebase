import { describe, it, expect } from 'vitest';
import { generateFixSuggestions } from '../../src/report/fix-suggestions.js';
import type { DiffResult } from '../../src/types.js';

describe('generateFixSuggestions', () => {
  it('should generate position fix with concrete px values', () => {
    const diffs: DiffResult[] = [{
      nodeId: '1:1', nodeName: 'Button',
      category: 'position_size', property: 'x',
      expected: 100, actual: 95, pass: false,
      diff: '+5px',
    }];
    const result = generateFixSuggestions(diffs);
    expect(result).toHaveLength(1);
    expect(result[0].property).toBe('left');
    expect(result[0].expectedPx).toBe('100px');
    expect(result[0].actualPx).toBe('95px');
    expect(result[0].diff).toBe('+5px');
    expect(result[0].fix).toContain('left: 100px');
  });

  it('should generate color fix with hex values', () => {
    const diffs: DiffResult[] = [{
      nodeId: '2:1', nodeName: 'Card',
      category: 'color_style', property: 'backgroundColor',
      expected: { r: 245, g: 245, b: 245, a: 1 },
      actual: { r: 255, g: 255, b: 255, a: 1 },
      pass: false,
    }];
    const result = generateFixSuggestions(diffs);
    expect(result).toHaveLength(1);
    expect(result[0].property).toBe('background-color');
    expect(result[0].expectedPx).toBe('#f5f5f5');
    expect(result[0].actualPx).toBe('#ffffff');
    expect(result[0].fix).toContain('background-color: #f5f5f5');
  });

  it('should generate typography fix with font-size', () => {
    const diffs: DiffResult[] = [{
      nodeId: '3:1', nodeName: 'Title',
      category: 'typography', property: 'fontSize',
      expected: 16, actual: 14, pass: false,
    }];
    const result = generateFixSuggestions(diffs);
    expect(result).toHaveLength(1);
    expect(result[0].property).toBe('font-size');
    expect(result[0].expectedPx).toBe('16px');
    expect(result[0].actualPx).toBe('14px');
    expect(result[0].fix).toContain('font-size: 16px');
  });

  it('should generate layout fix with flex properties', () => {
    const diffs: DiffResult[] = [{
      nodeId: '4:1', nodeName: 'Container',
      category: 'layout_properties', property: 'flexDirection',
      expected: 'column', actual: 'row', pass: false,
    }];
    const result = generateFixSuggestions(diffs);
    expect(result).toHaveLength(1);
    expect(result[0].property).toBe('flex-direction');
    expect(result[0].expectedPx).toBe('column');
    expect(result[0].actualPx).toBe('row');
    expect(result[0].fix).toContain('flex-direction: column');
  });

  it('should skip passing diffs', () => {
    const diffs: DiffResult[] = [{
      nodeId: '1:1', nodeName: 'Test',
      category: 'position_size', property: 'x',
      expected: 10, actual: 10, pass: true,
    }];
    const result = generateFixSuggestions(diffs);
    expect(result).toHaveLength(0);
  });

  it('should handle empty diffs', () => {
    expect(generateFixSuggestions([])).toHaveLength(0);
  });

  it('should generate font-family fix', () => {
    const diffs: DiffResult[] = [{
      nodeId: '5:1', nodeName: 'Text',
      category: 'typography', property: 'fontFamily',
      expected: 'Inter', actual: 'Arial', pass: false,
    }];
    const result = generateFixSuggestions(diffs);
    expect(result).toHaveLength(1);
    expect(result[0].property).toBe('font-family');
    expect(result[0].expectedPx).toBe('Inter');
    expect(result[0].actualPx).toBe('Arial');
    expect(result[0].fix).toContain('font-family: "Inter"');
  });

  it('should generate gap fix with px', () => {
    const diffs: DiffResult[] = [{
      nodeId: '6:1', nodeName: 'Row',
      category: 'layout_properties', property: 'gap',
      expected: 16, actual: 12, pass: false,
    }];
    const result = generateFixSuggestions(diffs);
    expect(result).toHaveLength(1);
    expect(result[0].property).toBe('gap');
    expect(result[0].expectedPx).toBe('16px');
    expect(result[0].actualPx).toBe('12px');
    expect(result[0].diff).toBe('+4px');
  });
});