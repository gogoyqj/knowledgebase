import type { DiffResult, FixSuggestion } from '../types.js';

/**
 * Generate fix suggestions with concrete CSS values from failed diffs.
 * Each suggestion includes the exact property/value to change.
 */
export function generateFixSuggestions(diffs: DiffResult[]): FixSuggestion[] {
  return diffs
    .filter(d => !d.pass)
    .map(d => buildFixSuggestion(d))
    .filter((s): s is FixSuggestion => s !== null);
}

function buildFixSuggestion(diff: DiffResult): FixSuggestion | null {
  const { nodeId, nodeName, property, expected, actual, category } = diff;

  // Build specific fix based on category + property
  switch (category) {
    case 'position_size':
      return buildPositionFix(nodeId, nodeName, property, expected, actual);
    case 'color_style':
      return buildColorFix(nodeId, nodeName, property, expected, actual);
    case 'typography':
      return buildTypographyFix(nodeId, nodeName, property, expected, actual);
    case 'layout_properties':
      return buildLayoutFix(nodeId, nodeName, property, expected, actual);
    default:
      return {
        nodeId,
        nodeName,
        property,
        expectedPx: formatValue(expected),
        actualPx: formatValue(actual),
        diff: diff.diff ?? '',
        fix: diff.fix ?? `Change ${property} from ${formatValue(actual)} to ${formatValue(expected)}`,
      };
  }
}

function buildPositionFix(
  nodeId: string, nodeName: string, property: string, expected: unknown, actual: unknown,
): FixSuggestion {
  const exp = expected as number;
  const act = actual as number;
  const delta = Math.round((exp - act) * 10) / 10;

  const cssProp = property === 'x' ? 'left'
    : property === 'y' ? 'top'
    : property;

  return {
    nodeId,
    nodeName,
    property: cssProp,
    expectedPx: `${exp}px`,
    actualPx: `${act}px`,
    diff: `${delta > 0 ? '+' : ''}${delta}px`,
    fix: `Set ${cssProp}: ${exp}px (current: ${act}px, diff: ${delta > 0 ? '+' : ''}${delta}px)`,
  };
}

function buildColorFix(
  nodeId: string, nodeName: string, property: string, expected: unknown, actual: unknown,
): FixSuggestion {
  const exp = expected as { r: number; g: number; b: number; a: number } | undefined;
  const act = actual as { r: number; g: number; b: number; a: number } | undefined;

  const cssProp = property === 'backgroundColor' ? 'background-color'
    : property === 'borderColor' ? 'border-color'
    : property;

  if (exp && act && 'r' in exp && 'r' in act) {
    const expHex = rgbToHex(exp.r, exp.g, exp.b);
    const actHex = rgbToHex(act.r, act.g, act.b);
    const alphaStr = exp.a < 1 ? ` / ${(exp.a * 100).toFixed(0)}%` : '';

    return {
      nodeId,
      nodeName,
      property: cssProp,
      expectedPx: `${expHex}${alphaStr}`,
      actualPx: actHex,
      diff: `${actHex} → ${expHex}`,
      fix: `Set ${cssProp}: ${expHex}${alphaStr} (current: ${actHex})`,
    };
  }

  return {
    nodeId,
    nodeName,
    property: cssProp,
    expectedPx: formatValue(expected),
    actualPx: formatValue(actual),
    diff: '',
    fix: `Change ${cssProp} from ${formatValue(actual)} to ${formatValue(expected)}`,
  };
}

function buildTypographyFix(
  nodeId: string, nodeName: string, property: string, expected: unknown, actual: unknown,
): FixSuggestion {
  const exp = expected as number | string | undefined;
  const act = actual as number | string | undefined;

  if (property === 'fontSize' || property === 'lineHeight' || property === 'letterSpacing') {
    const cssProp = property === 'fontSize' ? 'font-size'
      : property === 'lineHeight' ? 'line-height'
      : 'letter-spacing';
    const unit = property === 'letterSpacing' ? 'em' : (property === 'lineHeight' && typeof exp === 'number' && exp < 10 ? '' : 'px');
    return {
      nodeId,
      nodeName,
      property: cssProp,
      expectedPx: typeof exp === 'number' ? `${exp}${unit}` : String(exp),
      actualPx: typeof act === 'number' ? `${act}${unit}` : String(act),
      diff: typeof exp === 'number' && typeof act === 'number' ? `${exp - act > 0 ? '+' : ''}${Math.round((exp - act) * 10) / 10}${unit}` : '',
      fix: `Set ${cssProp}: ${typeof exp === 'number' ? `${exp}${unit}` : exp} (current: ${typeof act === 'number' ? `${act}${unit}` : act})`,
    };
  }

  if (property === 'fontFamily') {
    return {
      nodeId,
      nodeName,
      property: 'font-family',
      expectedPx: String(exp),
      actualPx: String(act),
      diff: '',
      fix: `Set font-family: "${exp}" (current: "${act}")`,
    };
  }

  if (property === 'fontWeight') {
    return {
      nodeId,
      nodeName,
      property: 'font-weight',
      expectedPx: String(exp),
      actualPx: String(act),
      diff: '',
      fix: `Set font-weight: ${exp} (current: ${act})`,
    };
  }

  return {
    nodeId,
    nodeName,
    property,
    expectedPx: formatValue(expected),
    actualPx: formatValue(actual),
    diff: '',
    fix: `Change ${property} from ${formatValue(actual)} to ${formatValue(expected)}`,
  };
}

function buildLayoutFix(
  nodeId: string, nodeName: string, property: string, expected: unknown, actual: unknown,
): FixSuggestion {
  const cssPropMap: Record<string, string> = {
    display: 'display',
    flexDirection: 'flex-direction',
    justifyContent: 'justify-content',
    alignItems: 'align-items',
    gap: 'gap',
    paddingTop: 'padding-top',
    paddingRight: 'padding-right',
    paddingBottom: 'padding-bottom',
    paddingLeft: 'padding-left',
    borderRadius: 'border-radius',
    overflow: 'overflow',
  };

  const cssProp = cssPropMap[property] ?? property;
  const isSize = ['gap', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderRadius'].includes(property);

  return {
    nodeId,
    nodeName,
    property: cssProp,
    expectedPx: isSize ? `${expected}px` : String(expected),
    actualPx: isSize ? `${actual}px` : String(actual),
    diff: isSize && typeof expected === 'number' && typeof actual === 'number'
      ? `${expected - actual > 0 ? '+' : ''}${Math.round((expected - actual) * 10) / 10}px`
      : `${actual} → ${expected}`,
    fix: `Set ${cssProp}: ${isSize ? `${expected}px` : expected} (current: ${isSize ? `${actual}px` : actual})`,
  };
}

function formatValue(v: unknown): string {
  if (typeof v === 'number') return `${v}px`;
  if (typeof v === 'object' && v !== null) return JSON.stringify(v);
  return String(v);
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}