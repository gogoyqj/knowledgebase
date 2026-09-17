import type { FigmaNode } from '../types.js';

export interface ParseOptions {
  includeHiddenNodes?: boolean;
}

/**
 * 解析 Figma JSON 节点树，展平为数组，执行文本 Mock
 */
export function parseFigmaTree(
  root: FigmaNode,
  options: ParseOptions = {},
): FigmaNode[] {
  const nodes: FigmaNode[] = [];
  walkFigmaTree(root, nodes, options.includeHiddenNodes ?? false);
  return nodes;
}

function walkFigmaTree(
  node: FigmaNode,
  acc: FigmaNode[],
  includeHidden: boolean,
  parentId?: string,
): void {
  // 过滤隐藏节点
  if (!includeHidden && node.visible === false) return;

  // 文本 Mock
  if (node.type === 'TEXT' && node.characters) {
    node = { ...node, characters: mockText(node.characters) };
  }

  // 记录 parent
  if (parentId) {
    node = { ...node, parent: { id: parentId } };
  }

  acc.push(node);

  // 递归子节点
  if (node.children) {
    for (const child of node.children) {
      walkFigmaTree(child, acc, includeHidden, node.id);
    }
  }
}

/**
 * 将文本替换为等长的 "X" 字符串，保留换行符位置
 */
export function mockText(text: string): string {
  return text
    .split('\n')
    .map(line => line.replace(/\S/g, 'X'))
    .join('\n');
}
