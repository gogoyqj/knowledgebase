import { describe, it, expect } from 'vitest';
import { aggregateScores } from '../../src/score/aggregator.js';

describe('aggregateScores', () => {
  it('should return the score for single viewport', () => {
    expect(aggregateScores([85])).toBe(85);
  });

  it('should return 0 for empty input', () => {
    expect(aggregateScores([])).toBe(0);
  });

  it('should apply bucket penalty for uneven scores', () => {
    // Desktop 95, Tablet 80, Mobile 60
    const result = aggregateScores([95, 80, 60]);
    const avg = (95 + 80 + 60) / 3; // 78.33
    const expected = avg * Math.pow(60 / avg, 0.3);
    expect(result).toBeCloseTo(expected, 0);
  });

  it('should return same as avg for equal scores', () => {
    const result = aggregateScores([80, 80, 80]);
    expect(result).toBe(80);
  });

  it('should penalize more when lowest score is much lower', () => {
    const even = aggregateScores([80, 80, 80]);
    const uneven = aggregateScores([95, 90, 50]);
    expect(uneven).toBeLessThan(even);
  });
});
