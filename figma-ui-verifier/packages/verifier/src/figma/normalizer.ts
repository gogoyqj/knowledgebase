import type { FigmaNode, FigmaFill, FigmaEffect, NormalizedNode, RGBAColor } from '../types.js';

/**
 * Figma 节点 → 标准化节点
 */
export function normalizeFigmaNode(node: FigmaNode, parentAbs?: { x: number; y: number }): NormalizedNode {
  const absX = parentAbs ? node.x : node.x;
  const absY = parentAbs ? node.y : node.y;

  const normalized: NormalizedNode = {
    id: node.id,
    name: node.name,
    type: node.type,
    visible: node.visible !== false,
    x: absX,
    y: absY,
    width: node.width,
    height: node.height,
    isComponent: node.type === 'COMPONENT',
    isInstance: node.type === 'INSTANCE',
    parentId: node.parent?.id,
  };

  // Rotation
  if (node.rotation != null && node.rotation !== 0) {
    // Figma 顺时针负值 → CSS 正值
    normalized.rotation = -node.rotation;
  }

  // Opacity
  if (node.opacity != null) {
    normalized.opacity = node.opacity;
  }

  // Colors — 取第一个可见 Solid Fill
  const fill = findFirstVisibleSolid(node.fills);
  if (fill?.color) {
    normalized.backgroundColor = p3TosRGB(fill.color, fill.opacity);
  }

  const stroke = findFirstVisibleSolid(node.strokes);
  if (stroke?.color) {
    normalized.borderColor = p3TosRGB(stroke.color, stroke.opacity);
  }

  // Border radius
  if (node.rectangleCornerRadii) {
    normalized.borderRadius = [
      node.rectangleCornerRadii[0],
      node.rectangleCornerRadii[1],
      node.rectangleCornerRadii[2],
      node.rectangleCornerRadii[3],
    ];
  } else if (node.cornerRadius != null) {
    normalized.borderRadius = node.cornerRadius;
  }

  // Spacing
  if (node.padding) {
    normalized.padding = { ...node.padding };
  }
  if (node.itemSpacing != null) {
    normalized.gap = node.itemSpacing;
  }

  // Typography
  if (node.type === 'TEXT') {
    if (node.fontSize != null) normalized.fontSize = node.fontSize;
    if (node.fontFamily) normalized.fontFamily = node.fontFamily;
    if (node.fontWeight != null) normalized.fontWeight = node.fontWeight;
    if (node.lineHeight != null) normalized.lineHeight = node.lineHeight;
    if (node.letterSpacing != null) normalized.letterSpacing = node.letterSpacing;
    if (node.characters) normalized.textContent = node.characters; // 已被 mock
  }

  // Effects
  if (node.effects) {
    const effects = normalizeEffects(node.effects);
    if (effects.boxShadow) normalized.boxShadow = effects.boxShadow;
    if (effects.filter) normalized.filter = effects.filter;
    if (effects.backdropFilter) normalized.backdropFilter = effects.backdropFilter;
  }

  // Auto-Layout → CSS
  if (node.layoutMode && node.layoutMode !== 'NONE') {
    normalized.display = 'flex';
    normalized.flexDirection = node.layoutMode === 'HORIZONTAL' ? 'row' : 'column';
    if (node.primaryAxisAlignItems) {
      normalized.justifyContent = mapJustifyContent(node.primaryAxisAlignItems);
    }
    if (node.counterAxisAlignItems) {
      normalized.alignItems = mapAlignItems(node.counterAxisAlignItems);
    }
  }

  // clipsContent
  if (node.clipsContent != null) {
    normalized.overflow = node.clipsContent ? 'hidden' : 'visible';
  }

  // Children
  if (node.children) {
    normalized.children = node.children.map(child =>
      normalizeFigmaNode(child, { x: absX, y: absY }),
    );
  }

  return normalized;
}

/**
 * 批量归一化
 */
export function normalizeFigmaNodes(nodes: FigmaNode[]): NormalizedNode[] {
  return nodes.map(n => normalizeFigmaNode(n));
}

// --- Helpers ---

function findFirstVisibleSolid(fills?: FigmaFill[]): FigmaFill | undefined {
  if (!fills) return undefined;
  return fills.find(f => f.type === 'SOLID' && f.visible !== false && f.color);
}

/**
 * Figma 颜色 → sRGB (0-255)
 * Figma API 返回归一化的颜色值 (0-1 浮点)，直接缩放到 0-255
 */
export function p3TosRGB(
  color: { r: number; g: number; b: number; a: number },
  fillOpacity?: number,
): RGBAColor {
  const a = (fillOpacity ?? 1) * color.a;

  return {
    r: Math.round(Math.max(0, Math.min(1, color.r)) * 255),
    g: Math.round(Math.max(0, Math.min(1, color.g)) * 255),
    b: Math.round(Math.max(0, Math.min(1, color.b)) * 255),
    a: Math.round(a * 100) / 100,
  };
}

function normalizeEffects(effects: FigmaEffect[]): {
  boxShadow?: string;
  filter?: string;
  backdropFilter?: string;
} {
  const result: { boxShadow?: string; filter?: string; backdropFilter?: string } = {};

  for (const effect of effects) {
    if (effect.visible === false) continue;

    switch (effect.type) {
      case 'DROP_SHADOW': {
        const c = effect.color ? p3TosRGB(effect.color) : { r: 0, g: 0, b: 0, a: 0.25 };
        result.boxShadow = `${effect.offset?.x ?? 0}px ${effect.offset?.y ?? 0}px ${effect.radius}px 0px rgba(${c.r},${c.g},${c.b},${c.a})`;
        break;
      }
      case 'INNER_SHADOW': {
        const c = effect.color ? p3TosRGB(effect.color) : { r: 0, g: 0, b: 0, a: 0.25 };
        result.boxShadow = `inset ${effect.offset?.x ?? 0}px ${effect.offset?.y ?? 0}px ${effect.radius}px 0px rgba(${c.r},${c.g},${c.b},${c.a})`;
        break;
      }
      case 'LAYER_BLUR':
        result.filter = `blur(${effect.radius}px)`;
        break;
      case 'BACKGROUND_BLUR':
        result.backdropFilter = `blur(${effect.radius}px)`;
        break;
    }
  }

  return result;
}

function mapJustifyContent(v: string): string {
  switch (v) {
    case 'MIN': return 'flex-start';
    case 'CENTER': return 'center';
    case 'MAX': return 'flex-end';
    case 'SPACE_BETWEEN': return 'space-between';
    default: return 'flex-start';
  }
}

function mapAlignItems(v: string): string {
  switch (v) {
    case 'MIN': return 'flex-start';
    case 'CENTER': return 'center';
    case 'MAX': return 'flex-end';
    case 'BASELINE': return 'baseline';
    default: return 'flex-start';
  }
}
