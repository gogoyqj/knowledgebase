import type { NormalizedNode, RGBAColor } from '../types.js';

export interface DesignToken {
  name: string;
  value: string;
  type: 'color' | 'spacing' | 'fontSize' | 'fontWeight' | 'borderRadius' | 'shadow';
  source: 'figma' | 'code';
}

export interface TokenMatchResult {
  token: DesignToken;
  matched: boolean;
  codeToken?: DesignToken;
  similarity: number;
  diff?: string;
}

export interface TokenValidationResult {
  totalFigmaTokens: number;
  matchedTokens: number;
  unmatchedTokens: number;
  matchRate: number;
  results: TokenMatchResult[];
}

/**
 * Extract design tokens from Figma nodes.
 * Looks for patterns like: color names, spacing values, font sizes, etc.
 */
export function extractFigmaTokens(nodes: NormalizedNode[]): DesignToken[] {
  const tokens: DesignToken[] = [];
  const seen = new Set<string>();

  for (const node of nodes) {
    // Color tokens
    if (node.backgroundColor) {
      const key = `color:${colorToHex(node.backgroundColor)}`;
      if (!seen.has(key)) {
        seen.add(key);
        tokens.push({
          name: guessColorTokenName(node.backgroundColor, node.name),
          value: colorToHex(node.backgroundColor),
          type: 'color',
          source: 'figma',
        });
      }
    }

    // Spacing tokens
    if (node.gap) {
      const key = `spacing:${node.gap}`;
      if (!seen.has(key)) {
        seen.add(key);
        tokens.push({
          name: `spacing-${node.gap}`,
          value: `${node.gap}px`,
          type: 'spacing',
          source: 'figma',
        });
      }
    }

    if (node.padding) {
      for (const [side, val] of Object.entries(node.padding)) {
        const key = `spacing:${val}`;
        if (!seen.has(key) && val > 0) {
          seen.add(key);
          tokens.push({
            name: `spacing-${val}`,
            value: `${val}px`,
            type: 'spacing',
            source: 'figma',
          });
        }
      }
    }

    // Typography tokens
    if (node.fontSize) {
      const key = `fontSize:${node.fontSize}`;
      if (!seen.has(key)) {
        seen.add(key);
        tokens.push({
          name: `font-size-${node.fontSize}`,
          value: `${node.fontSize}px`,
          type: 'fontSize',
          source: 'figma',
        });
      }
    }

    if (node.fontWeight) {
      const key = `fontWeight:${node.fontWeight}`;
      if (!seen.has(key)) {
        seen.add(key);
        tokens.push({
          name: `font-weight-${node.fontWeight}`,
          value: String(node.fontWeight),
          type: 'fontWeight',
          source: 'figma',
        });
      }
    }

    // Border radius tokens
    if (node.borderRadius) {
      const val = typeof node.borderRadius === 'number' ? node.borderRadius : node.borderRadius[0];
      const key = `borderRadius:${val}`;
      if (!seen.has(key)) {
        seen.add(key);
        tokens.push({
          name: `radius-${val}`,
          value: `${val}px`,
          type: 'borderRadius',
          source: 'figma',
        });
      }
    }
  }

  return tokens;
}

/**
 * Extract design tokens from CSS text (CSS variables, theme values).
 */
export function extractCodeTokens(cssText: string): DesignToken[] {
  const tokens: DesignToken[] = [];

  // Match CSS custom properties: --name: value;
  const varRegex = /--([\w-]+)\s*:\s*([^;]+);/g;
  let match;

  while ((match = varRegex.exec(cssText)) !== null) {
    const name = match[1];
    const value = match[2].trim();

    tokens.push({
      name,
      value,
      type: inferTokenType(name, value),
      source: 'code',
    });
  }

  return tokens;
}

/**
 * Match Figma tokens against code tokens.
 * Uses value-based matching with name similarity bonus.
 */
export function matchTokens(
  figmaTokens: DesignToken[],
  codeTokens: DesignToken[],
): TokenValidationResult {
  const results: TokenMatchResult[] = [];
  const usedCodeTokens = new Set<string>();

  for (const figmaToken of figmaTokens) {
    let bestMatch: TokenMatchResult | null = null;
    let bestSimilarity = 0;

    for (const codeToken of codeTokens) {
      if (usedCodeTokens.has(codeToken.name)) continue;
      if (figmaToken.type !== codeToken.type) continue;

      const similarity = computeTokenSimilarity(figmaToken, codeToken);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestMatch = {
          token: figmaToken,
          matched: similarity >= 0.8,
          codeToken,
          similarity,
          diff: similarity < 1 ? `Value mismatch: ${figmaToken.value} vs ${codeToken.value}` : undefined,
        };
      }
    }

    if (bestMatch && bestMatch.matched) {
      usedCodeTokens.add(bestMatch.codeToken!.name);
    }

    results.push(bestMatch ?? {
      token: figmaToken,
      matched: false,
      similarity: 0,
      diff: 'No matching code token found',
    });
  }

  const matchedCount = results.filter(r => r.matched).length;

  return {
    totalFigmaTokens: figmaTokens.length,
    matchedTokens: matchedCount,
    unmatchedTokens: figmaTokens.length - matchedCount,
    matchRate: figmaTokens.length > 0 ? matchedCount / figmaTokens.length : 1,
    results,
  };
}

function computeTokenSimilarity(a: DesignToken, b: DesignToken): number {
  // Exact value match
  if (normalizeValue(a.value) === normalizeValue(b.value)) {
    // Bonus for name similarity
    const nameSim = nameSimilarity(a.name, b.name);
    return 0.8 + 0.2 * nameSim;
  }

  // Same type, different value
  const valueSim = valueSimilarity(a.value, b.value, a.type);
  const nameSim = nameSimilarity(a.name, b.name);

  return valueSim * 0.7 + nameSim * 0.3;
}

function normalizeValue(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '').replace(/px$/, '');
}

function valueSimilarity(a: string, b: string, type: DesignToken['type']): number {
  const normA = normalizeValue(a);
  const normB = normalizeValue(b);

  if (normA === normB) return 1;

  if (type === 'color') {
    return colorSimilarity(normA, normB);
  }

  // Numeric values
  const numA = parseFloat(normA);
  const numB = parseFloat(normB);
  if (!isNaN(numA) && !isNaN(numB)) {
    const diff = Math.abs(numA - numB);
    const max = Math.max(numA, numB);
    return max > 0 ? Math.max(0, 1 - diff / max) : 1;
  }

  return 0;
}

function colorSimilarity(a: string, b: string): number {
  const colorA = parseColorString(a);
  const colorB = parseColorString(b);
  if (!colorA || !colorB) return 0;

  const diff = Math.sqrt(
    Math.pow(colorA.r - colorB.r, 2) +
    Math.pow(colorA.g - colorB.g, 2) +
    Math.pow(colorA.b - colorB.b, 2),
  );
  return Math.max(0, 1 - diff / 441.67); // 441.67 = sqrt(255^2 * 3)
}

function parseColorString(color: string): RGBAColor | null {
  // Hex
  const hexMatch = color.match(/^#?([0-9a-f]{6})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: 1,
    };
  }

  // rgb/rgba
  const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1]),
      g: parseInt(rgbMatch[2]),
      b: parseInt(rgbMatch[3]),
      a: rgbMatch[4] ? parseFloat(rgbMatch[4]) : 1,
    };
  }

  return null;
}

function nameSimilarity(a: string, b: string): number {
  const normA = a.toLowerCase().replace(/[-_\s]/g, '');
  const normB = b.toLowerCase().replace(/[-_\s]/g, '');

  if (normA === normB) return 1;
  if (normA.includes(normB) || normB.includes(normA)) return 0.7;

  // Levenshtein-based similarity
  const maxLen = Math.max(normA.length, normB.length);
  if (maxLen === 0) return 1;
  const distance = levenshteinDistance(normA, normB);
  return 1 - distance / maxLen;
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[b.length][a.length];
}

function inferTokenType(name: string, value: string): DesignToken['type'] {
  const lowerName = name.toLowerCase();
  if (lowerName.includes('color') || lowerName.includes('bg') || lowerName.includes('text')) return 'color';
  if (lowerName.includes('spacing') || lowerName.includes('gap') || lowerName.includes('margin') || lowerName.includes('padding')) return 'spacing';
  if (lowerName.includes('font-size') || lowerName.includes('text')) return 'fontSize';
  if (lowerName.includes('font-weight') || lowerName.includes('weight')) return 'fontWeight';
  if (lowerName.includes('radius') || lowerName.includes('rounded')) return 'borderRadius';
  if (lowerName.includes('shadow')) return 'shadow';

  // Guess from value
  if (/^#[0-9a-f]{6}$/i.test(value) || value.startsWith('rgb')) return 'color';
  if (/^\d+px$/.test(value)) return 'spacing';

  return 'color'; // default
}

function colorToHex(color: RGBAColor): string {
  const toHex = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

function guessColorTokenName(color: RGBAColor, nodeName: string): string {
  const hex = colorToHex(color);
  // Common color names
  const commonColors: Record<string, string> = {
    '#000000': 'black',
    '#ffffff': 'white',
    '#ff0000': 'red',
    '#00ff00': 'green',
    '#0000ff': 'blue',
  };
  return commonColors[hex] ?? `color-${nodeName.toLowerCase().replace(/\s+/g, '-')}`;
}