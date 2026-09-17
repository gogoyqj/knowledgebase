/** Figma 原始节点（从 API JSON 解析） */
export interface FigmaNode {
  id: string;
  name: string;
  type: string; // FRAME | TEXT | RECTANGLE | VECTOR | INSTANCE | COMPONENT | GROUP
  visible?: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  opacity?: number;
  cornerRadius?: number;
  rectangleCornerRadii?: [number, number, number, number];
  fills?: FigmaFill[];
  strokes?: FigmaFill[];
  effects?: FigmaEffect[];
  clipsContent?: boolean;
  isMask?: boolean;
  // Auto-Layout
  layoutMode?: 'NONE' | 'HORIZONTAL' | 'VERTICAL';
  primaryAxisAlignItems?: 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN';
  counterAxisAlignItems?: 'MIN' | 'CENTER' | 'MAX' | 'BASELINE';
  layoutSizingHorizontal?: 'FIXED' | 'HUG' | 'FILL';
  layoutSizingVertical?: 'FIXED' | 'HUG' | 'FILL';
  layoutGrow?: number;
  layoutAlign?: string;
  counterAxisSizingMode?: 'FIXED' | 'AUTO';
  // Typography
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  lineHeight?: number;
  letterSpacing?: number;
  characters?: string;
  // Spacing
  padding?: { top: number; right: number; bottom: number; left: number };
  itemSpacing?: number;
  // Instance
  componentId?: string;
  overrides?: FigmaOverride[];
  componentPropertyReferences?: Record<string, string>;
  children?: FigmaNode[];
  // Position context
  parent?: { id: string };
}

export interface FigmaFill {
  type: 'SOLID' | 'GRADIENT_LINEAR' | 'IMAGE' | string;
  color?: { r: number; g: number; b: number; a: number };
  visible?: boolean;
  opacity?: number;
}

export interface FigmaEffect {
  type: 'DROP_SHADOW' | 'INNER_SHADOW' | 'LAYER_BLUR' | 'BACKGROUND_BLUR';
  visible?: boolean;
  radius: number;
  offset?: { x: number; y: number };
  color?: { r: number; g: number; b: number; a: number };
}

export interface FigmaOverride {
  id: string;
  overriddenFields: string[];
}

/** 归一化后的标准节点 */
export interface NormalizedNode {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  // Position (相对父容器)
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  // Colors (sRGB, 0-255)
  backgroundColor?: RGBAColor;
  borderColor?: RGBAColor;
  opacity?: number;
  // Border
  borderRadius?: number | [number, number, number, number];
  // Spacing
  padding?: { top: number; right: number; bottom: number; left: number };
  gap?: number;
  // Typography
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  lineHeight?: number;
  letterSpacing?: number;
  textContent?: string;
  // Effects
  boxShadow?: string;
  filter?: string;
  backdropFilter?: string;
  // Layout
  display?: string;
  flexDirection?: string;
  justifyContent?: string;
  alignItems?: string;
  overflow?: string;
  // Meta
  isComponent: boolean;
  isInstance: boolean;
  parentId?: string;
  children?: NormalizedNode[];
  instanceOverrides?: Record<string, unknown>;
}

export interface RGBAColor {
  r: number; // 0-255
  g: number;
  b: number;
  a: number; // 0-1
}

/** 单个属性的 diff 结果 */
export interface DiffResult {
  nodeId: string;
  nodeName: string;
  category: DiffCategory;
  property: string;
  expected: unknown;
  actual: unknown;
  pass: boolean;
  diff?: string;
  fix?: string;
}

export type DiffCategory =
  | 'completeness'
  | 'position_size'
  | 'color_style'
  | 'typography'
  | 'layout_properties';

/** 匹配节点对 */
export interface MatchedPair {
  figma: NormalizedNode;
  dom: NormalizedNode;
}

/** 评分分解 */
export interface ScoreBreakdown {
  completeness: number;
  position_size: number;
  color_style: number;
  typography: number;
  layout_properties: number;
  overall: number;
}

/** 验证结果 */
export interface VerifyResult {
  score: number;
  passed: boolean;
  threshold: number;
  breakdown: Record<string, { score: number; weight: number }>;
  viewport_scores?: Record<string, { score: number; ssim?: number; pixel_diff?: number }>;
  aggregated_score?: number;
  missing_nodes: number;
  extra_nodes: number;
  total_nodes: number;
  diffs: DiffResult[];
  missing: NormalizedNode[];
  extra: NormalizedNode[];
}

/** 修复建议 */
export interface FixSuggestion {
  nodeId: string;
  nodeName: string;
  property: string;
  expectedPx: string;
  actualPx: string;
  actualSpecified?: string;
  diff: string;
  fix: string;
}
