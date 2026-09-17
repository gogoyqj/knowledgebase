import type { NormalizedNode, RGBAColor } from '../types.js';

export interface RawDOMElement {
  figmaId: string;
  tagName: string;
  rect: { x: number; y: number; width: number; height: number };
  parentRect: { x: number; y: number; width: number; height: number } | null;
  styles: Record<string, string>;
  boxSizing: 'border-box' | 'content-box';
  children: RawDOMElement[];
  textContent: string | null;
}

/**
 * DOM 元素 → 标准化节点
 */
export function normalizeDOMNode(raw: RawDOMElement): NormalizedNode {
  // 位置：相对父容器
  const x = raw.parentRect
    ? raw.rect.x - raw.parentRect.x
    : raw.rect.x;
  const y = raw.parentRect
    ? raw.rect.y - raw.parentRect.y
    : raw.rect.y;

  // 尺寸：box-sizing 归一化
  const { width, height } = normalizeSize(raw);

  const node: NormalizedNode = {
    id: raw.figmaId,
    name: raw.tagName,
    type: tagToNodeType(raw.tagName),
    visible: true,
    x,
    y,
    width,
    height,
    isComponent: false,
    isInstance: false,
  };

  // Colors
  if (raw.styles.backgroundColor && raw.styles.backgroundColor !== 'rgba(0, 0, 0, 0)') {
    node.backgroundColor = parseColor(raw.styles.backgroundColor);
  }
  if (raw.styles.borderColor) {
    node.borderColor = parseColor(raw.styles.borderColor);
  }
  if (raw.styles.opacity) {
    node.opacity = parseFloat(raw.styles.opacity);
  }

  // Border radius
  if (raw.styles.borderRadius) {
    node.borderRadius = parseBorderRadius(raw.styles.borderRadius);
  }

  // Spacing
  const padding = parsePadding(raw.styles);
  if (padding) node.padding = padding;

  if (raw.styles.gap && raw.styles.gap !== 'normal') {
    node.gap = parseFloat(raw.styles.gap);
  }

  // Typography
  if (raw.styles.fontSize) node.fontSize = parseFloat(raw.styles.fontSize);
  if (raw.styles.fontFamily) node.fontFamily = raw.styles.fontFamily.replace(/['"]/g, '');
  if (raw.styles.fontWeight) node.fontWeight = parseInt(raw.styles.fontWeight, 10);
  if (raw.styles.lineHeight && raw.styles.lineHeight !== 'normal') {
    node.lineHeight = parseFloat(raw.styles.lineHeight);
  }
  if (raw.styles.letterSpacing && raw.styles.letterSpacing !== 'normal') {
    node.letterSpacing = parseFloat(raw.styles.letterSpacing);
  }
  if (raw.textContent) node.textContent = raw.textContent;

  // Effects
  if (raw.styles.boxShadow && raw.styles.boxShadow !== 'none') {
    node.boxShadow = raw.styles.boxShadow;
  }
  if (raw.styles.filter && raw.styles.filter !== 'none') {
    node.filter = raw.styles.filter;
  }
  if (raw.styles.backdropFilter && raw.styles.backdropFilter !== 'none') {
    node.backdropFilter = raw.styles.backdropFilter;
  }

  // Layout
  if (raw.styles.display) node.display = raw.styles.display;
  if (raw.styles.flexDirection) node.flexDirection = raw.styles.flexDirection;
  if (raw.styles.justifyContent) node.justifyContent = raw.styles.justifyContent;
  if (raw.styles.alignItems) node.alignItems = raw.styles.alignItems;
  if (raw.styles.overflow) node.overflow = raw.styles.overflow;

  // Children
  if (raw.children.length > 0) {
    node.children = raw.children.map(c => normalizeDOMNode(c));
  }

  return node;
}

/**
 * 批量归一化
 */
export function normalizeDOMNodes(raws: RawDOMElement[]): NormalizedNode[] {
  return raws.map(r => normalizeDOMNode(r));
}

// --- Helpers ---

function normalizeSize(raw: RawDOMElement): { width: number; height: number } {
  // border-box: offsetWidth/Height 直接可用
  // content-box: 需要加回 padding + border
  if (raw.boxSizing === 'border-box') {
    return { width: raw.rect.width, height: raw.rect.height };
  }

  // content-box 归一化
  const pt = parseFloat(raw.styles.paddingTop ?? '0');
  const pr = parseFloat(raw.styles.paddingRight ?? '0');
  const pb = parseFloat(raw.styles.paddingBottom ?? '0');
  const pl = parseFloat(raw.styles.paddingLeft ?? '0');
  const bt = parseFloat(raw.styles.borderTopWidth ?? '0');
  const br = parseFloat(raw.styles.borderRightWidth ?? '0');
  const bb = parseFloat(raw.styles.borderBottomWidth ?? '0');
  const bl = parseFloat(raw.styles.borderLeftWidth ?? '0');

  return {
    width: raw.rect.width + pl + pr + bl + br,
    height: raw.rect.height + pt + pb + bt + bb,
  };
}

/**
 * 解析 CSS 颜色字符串 → RGBAColor (0-255)
 */
export function parseColor(css: string): RGBAColor {
  // rgb(r, g, b) / rgba(r, g, b, a)
  const rgba = css.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (rgba) {
    return {
      r: parseInt(rgba[1], 10),
      g: parseInt(rgba[2], 10),
      b: parseInt(rgba[3], 10),
      a: rgba[4] != null ? parseFloat(rgba[4]) : 1,
    };
  }
  // Hex
  const hex = css.match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    const h = hex[1];
    if (h.length === 3) {
      return {
        r: parseInt(h[0] + h[0], 16),
        g: parseInt(h[1] + h[1], 16),
        b: parseInt(h[2] + h[2], 16),
        a: 1,
      };
    }
    if (h.length === 6 || h.length === 8) {
      return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
        a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
      };
    }
  }
  return { r: 0, g: 0, b: 0, a: 0 };
}

function parseBorderRadius(css: string): number | [number, number, number, number] {
  const parts = css.split(/\s+/).map(parseFloat);
  if (parts.length === 1) return parts[0];
  if (parts.length === 4) return [parts[0], parts[1], parts[2], parts[3]];
  if (parts.length === 2) return [parts[0], parts[1], parts[0], parts[1]];
  if (parts.length === 3) return [parts[0], parts[1], parts[2], parts[1]];
  return parts[0];
}

function parsePadding(styles: Record<string, string>): NormalizedNode['padding'] | undefined {
  const top = parseFloat(styles.paddingTop ?? '0');
  const right = parseFloat(styles.paddingRight ?? '0');
  const bottom = parseFloat(styles.paddingBottom ?? '0');
  const left = parseFloat(styles.paddingLeft ?? '0');
  if (top === 0 && right === 0 && bottom === 0 && left === 0) return undefined;
  return { top, right, bottom, left };
}

function tagToNodeType(tag: string): string {
  const t = tag.toLowerCase();
  if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'label'].includes(t)) return 'TEXT';
  if (['svg', 'img'].includes(t)) return 'VECTOR';
  if (['section', 'article', 'header', 'footer', 'nav', 'main', 'aside'].includes(t)) return 'FRAME';
  return 'FRAME';
}
