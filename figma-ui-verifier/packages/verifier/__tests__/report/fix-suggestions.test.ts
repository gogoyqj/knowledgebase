import { describe, it, expect } from 'vitest';
import { generateFixSuggestions } from '../../src/report/fix-suggestions.js';
import type { DiffResult } from '../../src/types.js';

describe('generateFixSuggestions', () => {
  it('should generate fix for failed diff', () => {
    const diffs: DiffResult[] = [{
      nodeId: '1:1', nodeName: 'Button',
      category: 'layout_properties', property: 'padding-top',
      expected: 12, actual: 8, pass: false,
      diff: '-4px', fix: 'set padding-top to 12px',
    }];
    const result = generateFixSuggestions(diffs);
    expect(result).toHaveLength(1);
    expect(result[0].fix).toBe('set padding-top to 12px');
    expect(result[0].expectedPx).toBe('12px');
    expect(result[0].actualPx).toBe('8px');
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
});
