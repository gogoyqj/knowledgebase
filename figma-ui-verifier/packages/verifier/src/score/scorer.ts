import type { DiffResult, NormalizedNode, MatchedPair, DiffCategory } from '../types.js';
import type { WeightConfig } from '../config.js';

export interface ScoreResult {
  breakdown: Record<DiffCategory, number>;
  overall: number;
  missing_nodes: number;
  extra_nodes: number;
  total_nodes: number;
}

/**
 * 计算评分
 */
export function calculateScore(
  diffs: DiffResult[],
  matched: MatchedPair[],
  missing: NormalizedNode[],
  extra: NormalizedNode[],
  weights: WeightConfig,
  totalFigmaNodes: number,
): ScoreResult {
  // 按类别分组
  const byCategory = new Map<DiffCategory, DiffResult[]>();
  for (const d of diffs) {
    if (!byCategory.has(d.category)) byCategory.set(d.category, []);
    byCategory.get(d.category)!.push(d);
  }

  // 类别得分 = pass 数 / 总属性数 × 100
  const categories: DiffCategory[] = [
    'position_size', 'color_style', 'typography', 'layout_properties',
  ];

  const breakdown: Record<DiffCategory, number> = {
    completeness: 0,
    position_size: 0,
    color_style: 0,
    typography: 0,
    layout_properties: 0,
  };

  for (const cat of categories) {
    const catDiffs = byCategory.get(cat) ?? [];
    if (catDiffs.length === 0) {
      breakdown[cat] = 100; // 无属性需要对比视为通过
    } else {
      const passCount = catDiffs.filter(d => d.pass).length;
      breakdown[cat] = Math.round((passCount / catDiffs.length) * 100 * 10) / 10;
    }
  }

  // 完整性得分
  const matchedCount = matched.length;
  const extraPenalty = extra.reduce((sum, node) => {
    const pageArea = 1440 * 900; // 估算页面面积
    const nodeArea = node.width * node.height;
    return sum + Math.min((nodeArea / pageArea) * 100, 3);
  }, 0);

  breakdown.completeness = totalFigmaNodes > 0
    ? Math.max(0, Math.round(((matchedCount / totalFigmaNodes) * 100 - extraPenalty) * 10) / 10)
    : 100;

  // 总分 = Σ (权重 × 类别分)
  const overall = Math.round(
    (breakdown.completeness * weights.completeness +
     breakdown.position_size * weights.position_size +
     breakdown.color_style * weights.color_style +
     breakdown.typography * weights.typography +
     breakdown.layout_properties * weights.layout_properties) * 10,
  ) / 10;

  return {
    breakdown,
    overall,
    missing_nodes: missing.length,
    extra_nodes: extra.length,
    total_nodes: totalFigmaNodes,
  };
}
