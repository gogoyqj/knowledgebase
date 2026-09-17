/**
 * 多断点评分聚合（木桶效应）
 *
 * 最终分数 = 平均分 × (最低分 / 平均分)^0.3
 * 最低分越低，惩罚越大
 */
export function aggregateScores(scores: number[]): number {
  if (scores.length === 0) return 0;
  if (scores.length === 1) return scores[0];

  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const min = Math.min(...scores);

  if (avg === 0) return 0;

  return Math.round(avg * Math.pow(min / avg, 0.3) * 10) / 10;
}
