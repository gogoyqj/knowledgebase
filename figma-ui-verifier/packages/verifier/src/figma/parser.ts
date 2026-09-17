import type { FigmaNode } from '../types.js';

export interface ParseOptions {
  includeHiddenNodes?: boolean;
  /** Skip children of INSTANCE nodes (they're from the component definition) */
  skipInstanceChildren?: boolean;
}

/**
 * 解析 Figma JSON 节点树，展平为数组，执行文本 Mock
 */
export function parseFigmaTree(
  root: FigmaNode,
  options: ParseOptions = {},
): FigmaNode[] {
  const nodes: FigmaNode[] = [];
  walkFigmaTree(root, nodes, options);
  return nodes;
}

function walkFigmaTree(
  node: FigmaNode,
  acc: FigmaNode[],
  options: ParseOptions,
  parentId?: string,
  insideInstance: boolean = false,
): void {
  const includeHidden = options.includeHiddenNodes ?? false;

  // 过滤隐藏节点
  if (!includeHidden && node.visible === false) return;

  // 文本 Mock
  if (node.type === 'TEXT' && node.characters) {
    node = { ...node, characters: mockText(node.characters) };
  }

  // 记录 parent 和 instance 上下文
  if (parentId) {
    node = { ...node, parent: { id: parentId } };
  }

  // 标记是否在 instance 内部
  if (insideInstance) {
    node = { ...node, _insideInstance: true } as FigmaNode & { _insideInstance?: boolean };
  }

  acc.push(node);

  // 判断当前节点是否是 instance
  const isInstance = node.type === 'INSTANCE' && node.componentId;
  const shouldSkipChildren = isInstance && options.skipInstanceChildren;

  // 递归子节点
  if (node.children && !shouldSkipChildren) {
    for (const child of node.children) {
      walkFigmaTree(child, acc, options, node.id, insideInstance || !!isInstance);
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

/**
 * 过滤掉 INSTANCE 内部的节点（组件定义的子节点）
 * 只保留 INSTANCE 节点本身
 */
export function filterInstanceChildren(nodes: FigmaNode[]): FigmaNode[] {
  return nodes.filter(n => !(n as FigmaNode & { _insideInstance?: boolean })._insideInstance);
}