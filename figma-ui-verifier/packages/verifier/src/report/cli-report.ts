import type { VerifyResult } from '../types.js';

/**
 * 生成 JSON 格式的 CI 门禁报告
 */
export function generateCLIReport(result: VerifyResult): string {
  return JSON.stringify({
    score: result.score,
    passed: result.passed,
    threshold: result.threshold,
    breakdown: result.breakdown,
    viewport_scores: result.viewport_scores,
    aggregated_score: result.aggregated_score,
    missing_nodes: result.missing_nodes,
    extra_nodes: result.extra_nodes,
    total_nodes: result.total_nodes,
  }, null, 2);
}
