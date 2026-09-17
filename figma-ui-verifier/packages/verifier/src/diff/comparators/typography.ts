import type { NormalizedNode, DiffResult } from '../../types.js';
import type { ToleranceConfig } from '../../config.js';

/**
 * 字体排版对比器
 */
export function compareTypography(
  expected: NormalizedNode,
  actual: NormalizedNode,
  tolerances: ToleranceConfig,
): DiffResult[] {
  const results: DiffResult[] = [];

  if (expected.fontSize != null) {
    const actualFs = actual.fontSize ?? 0;
    const pass = Math.abs(expected.fontSize - actualFs) <= tolerances.fontSize;
    results.push({
      nodeId: expected.id,
      nodeName: expected.name,
      category: 'typography',
      property: 'font-size',
      expected: expected.fontSize,
      actual: actualFs,
      pass,
      diff: pass ? undefined : `Δ${(expected.fontSize - actualFs).toFixed(1)}px`,
      fix: pass ? undefined : `set font-size to ${expected.fontSize}px`,
    });
  }

  if (expected.fontFamily) {
    const actualFf = actual.fontFamily ?? '';
    const pass = normalizeFontFamily(expected.fontFamily) === normalizeFontFamily(actualFf);
    results.push({
      nodeId: expected.id,
      nodeName: expected.name,
      category: 'typography',
      property: 'font-family',
      expected: expected.fontFamily,
      actual: actualFf,
      pass,
      fix: pass ? undefined : `set font-family to '${expected.fontFamily}'`,
    });
  }

  if (expected.fontWeight != null) {
    const actualFw = actual.fontWeight ?? 400;
    const pass = expected.fontWeight === actualFw;
    results.push({
      nodeId: expected.id,
      nodeName: expected.name,
      category: 'typography',
      property: 'font-weight',
      expected: expected.fontWeight,
      actual: actualFw,
      pass,
      fix: pass ? undefined : `set font-weight to ${expected.fontWeight}`,
    });
  }

  if (expected.lineHeight != null) {
    const actualLh = actual.lineHeight ?? 0;
    const pass = Math.abs(expected.lineHeight - actualLh) <= tolerances.spacing;
    results.push({
      nodeId: expected.id,
      nodeName: expected.name,
      category: 'typography',
      property: 'line-height',
      expected: expected.lineHeight,
      actual: actualLh,
      pass,
      diff: pass ? undefined : `Δ${(expected.lineHeight - actualLh).toFixed(1)}px`,
      fix: pass ? undefined : `set line-height to ${expected.lineHeight}px`,
    });
  }

  if (expected.letterSpacing != null) {
    const actualLs = actual.letterSpacing ?? 0;
    const pass = Math.abs(expected.letterSpacing - actualLs) <= tolerances.spacing;
    results.push({
      nodeId: expected.id,
      nodeName: expected.name,
      category: 'typography',
      property: 'letter-spacing',
      expected: expected.letterSpacing,
      actual: actualLs,
      pass,
      diff: pass ? undefined : `Δ${(expected.letterSpacing - actualLs).toFixed(1)}px`,
      fix: pass ? undefined : `set letter-spacing to ${expected.letterSpacing}px`,
    });
  }

  return results;
}

function normalizeFontFamily(ff: string): string {
  return ff.replace(/['"]/g, '').toLowerCase().trim();
}
