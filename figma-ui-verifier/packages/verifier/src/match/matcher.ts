import type { NormalizedNode, MatchedPair } from '../types.js';
// @ts-expect-error — munkres-js 没有类型定义
import munkres from 'munkres-js';

/**
 * 匈牙利算法兜底匹配
 * 当无 data-figma-id 时，基于空间位置 + 元素类型匹配
 *
 * 前置条件：Puppeteer 视口宽度 = 当前验证断点的 Figma Frame 宽度
 */
export function hungarianMatch(
  figmaNodes: NormalizedNode[],
  domNodes: NormalizedNode[],
): MatchedPair[] {
  if (figmaNodes.length === 0 || domNodes.length === 0) return [];

  const figmaFlat = figmaNodes.flatMap(n => flattenNormalized(n));
  const domFlat = domNodes.flatMap(n => flattenNormalized(n));

  const rows = figmaFlat.length;
  const cols = domFlat.length;
  const size = Math.max(rows, cols);

  // 构建成本矩阵
  const costMatrix: number[][] = [];
  for (let i = 0; i < size; i++) {
    costMatrix[i] = [];
    for (let j = 0; j < size; j++) {
      if (i >= rows || j >= cols) {
        costMatrix[i][j] = 1; // 虚拟节点最大成本
      } else {
        costMatrix[i][j] = computeCost(figmaFlat[i], domFlat[j]);
      }
    }
  }

  // 匈牙利算法
  const assignments: [number, number][] = munkres(costMatrix);

  // 过滤 IoU < 0.5 和虚拟节点
  const matched: MatchedPair[] = [];
  for (const [i, j] of assignments) {
    if (i >= rows || j >= cols) continue;
    const iou = computeIoU(figmaFlat[i], domFlat[j]);
    if (iou >= 0.5) {
      matched.push({ figma: figmaFlat[i], dom: domFlat[j] });
    }
  }

  return matched;
}

/**
 * 成本函数：1 - (IoU × 0.6 + 类型匹配 × 0.4)
 * 类型不匹配惩罚 × 1.5
 */
function computeCost(figma: NormalizedNode, dom: NormalizedNode): number {
  const iou = computeIoU(figma, dom);
  const typeMatch = matchType(figma.type, dom.type) ? 1 : 0;
  let cost = 1 - (iou * 0.6 + typeMatch * 0.4);
  if (!matchType(figma.type, dom.type)) cost *= 1.5;
  return Math.min(cost, 1);
}

/**
 * IoU (Intersection over Union)
 */
function computeIoU(a: NormalizedNode, b: NormalizedNode): number {
  const ax1 = a.x, ay1 = a.y, ax2 = a.x + a.width, ay2 = a.y + a.height;
  const bx1 = b.x, by1 = b.y, bx2 = b.x + b.width, by2 = b.y + b.height;

  const ix1 = Math.max(ax1, bx1);
  const iy1 = Math.max(ay1, by1);
  const ix2 = Math.min(ax2, bx2);
  const iy2 = Math.min(ay2, by2);

  const inter = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1);
  const areaA = a.width * a.height;
  const areaB = b.width * b.height;
  const union = areaA + areaB - inter;

  return union > 0 ? inter / union : 0;
}

/**
 * 元素类型映射
 */
function matchType(figmaType: string, domType: string): boolean {
  const figma = figmaType.toUpperCase();
  const dom = domType.toUpperCase();

  if (figma === dom) return true;
  if (figma === 'FRAME' && ['FRAME', 'GROUP'].includes(dom)) return true;
  if (figma === 'TEXT' && dom === 'TEXT') return true;
  if (figma === 'RECTANGLE' && dom === 'FRAME') return true;
  if (figma === 'VECTOR' && dom === 'VECTOR') return true;
  if (figma === 'INSTANCE' && dom === 'FRAME') return true;
  return false;
}

function flattenNormalized(node: NormalizedNode): NormalizedNode[] {
  const acc: NormalizedNode[] = [node];
  if (node.children) {
    for (const child of node.children) {
      acc.push(...flattenNormalized(child));
    }
  }
  return acc;
}
