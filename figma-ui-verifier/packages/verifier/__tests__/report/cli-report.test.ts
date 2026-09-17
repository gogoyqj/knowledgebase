import { describe, it, expect } from 'vitest';
import { generateCLIReport } from '../../src/report/cli-report.js';
import type { VerifyResult } from '../../src/types.js';

describe('generateCLIReport', () => {
  it('should produce valid JSON with expected fields', () => {
    const result: VerifyResult = {
      score: 85,
      passed: true,
      threshold: 80,
      breakdown: {
        completeness: { score: 90, weight: 0.10 },
        position_size: { score: 85, weight: 0.25 },
        color_style: { score: 80, weight: 0.20 },
        typography: { score: 88, weight: 0.20 },
        layout_properties: { score: 82, weight: 0.25 },
      },
      missing_nodes: 1,
      extra_nodes: 0,
      total_nodes: 10,
      diffs: [],
      missing: [],
      extra: [],
    };
    const json = JSON.parse(generateCLIReport(result));
    expect(json.score).toBe(85);
    expect(json.passed).toBe(true);
    expect(json.threshold).toBe(80);
    expect(json.total_nodes).toBe(10);
  });
});
