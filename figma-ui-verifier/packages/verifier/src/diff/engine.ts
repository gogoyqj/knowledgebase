import type { NormalizedNode, DiffResult, MatchedPair } from '../types.js';
import type { VerifyConfig } from '../config.js';
import { compareLayout } from './comparators/layout.js';
import { compareColor } from './comparators/color.js';
import { compareTypography } from './comparators/typography.js';
import { compareEffects } from './comparators/effects.js';
import { compareAutoLayout } from './comparators/auto-layout.js';
import { hungarianMatch } from '../match/matcher.js';

export interface DiffOutput {
  matched: MatchedPair[];
  missing: NormalizedNode[];
  extra: NormalizedNode[];
  diffs: DiffResult[];
  /** How many pairs were matched by Hungarian fallback */
  fallbackMatched: number;
}

/**
 * Diff 主引擎：ID 匹配 + 匈牙利算法兜底 + 逐属性对比
 */
export function diffNodes(
  figmaNodes: NormalizedNode[],
  domNodes: NormalizedNode[],
  config: VerifyConfig,
): DiffOutput {
  // 1. 按 ID 建立映射
  const domMap = new Map<string, NormalizedNode>();
  for (const node of domNodes) {
    flattenNormalized(node).forEach(n => domMap.set(n.id, n));
  }

  const figmaFlat = figmaNodes.flatMap(n => flattenNormalized(n));

  const matched: MatchedPair[] = [];
  const missing: NormalizedNode[] = [];

  for (const figmaNode of figmaFlat) {
    const domNode = domMap.get(figmaNode.id);
    if (domNode) {
      matched.push({ figma: figmaNode, dom: domNode });
      domMap.delete(figmaNode.id);
    } else {
      missing.push(figmaNode);
    }
  }

  // 剩余的 DOM 节点为多余
  const extra = Array.from(domMap.values());

  // 2. 匈牙利算法兜底：对 ID 未匹配的节点尝试空间+类型匹配
  let fallbackMatched = 0;
  if (missing.length > 0 && extra.length > 0) {
    const fallbackPairs = hungarianMatch(missing, extra);

    for (const pair of fallbackPairs) {
      matched.push(pair);
      // 从 missing 和 extra 中移除已匹配的节点
      const missIdx = missing.findIndex(m => m.id === pair.figma.id);
      if (missIdx !== -1) missing.splice(missIdx, 1);

      const extraIdx = extra.findIndex(e => e.id === pair.dom.id);
      if (extraIdx !== -1) extra.splice(extraIdx, 1);

      fallbackMatched++;
    }
  }

  // 3. 对每对匹配节点调用 comparators
  const diffs: DiffResult[] = [];
  const { tolerances } = config;

  for (const pair of matched) {
    diffs.push(...compareLayout(pair.figma, pair.dom, tolerances));
    diffs.push(...compareColor(pair.figma, pair.dom, tolerances));
    diffs.push(...compareTypography(pair.figma, pair.dom, tolerances));
    diffs.push(...compareEffects(pair.figma, pair.dom, tolerances));
    diffs.push(...compareAutoLayout(pair.figma, pair.dom, tolerances));
  }

  return { matched, missing, extra, diffs, fallbackMatched };
}

/**
 * 展平归一化节点树为数组
 */
function flattenNormalized(node: NormalizedNode): NormalizedNode[] {
  const acc: NormalizedNode[] = [node];
  if (node.children) {
    for (const child of node.children) {
      acc.push(...flattenNormalized(child));
    }
  }
  return acc;
}