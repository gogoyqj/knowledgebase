import type { NormalizedNode, DiffResult } from '../../types.js';
import type { ToleranceConfig } from '../../config.js';

/**
 * Auto-Layout 属性对比器
 * Figma layoutMode → CSS flex-direction
 * Figma primaryAxisAlignItems → CSS justify-content
 * Figma counterAxisAlignItems → CSS align-items
 * Figma itemSpacing → CSS gap
 * Figma padding → CSS padding
 * Figma cornerRadius → CSS border-radius
 */
export function compareAutoLayout(
  expected: NormalizedNode,
  actual: NormalizedNode,
  tolerances: ToleranceConfig,
): DiffResult[] {
  const results: DiffResult[] = [];

  // Display
  if (expected.display) {
    const pass = expected.display === (actual.display ?? 'block');
    results.push({
      nodeId: expected.id,
      nodeName: expected.name,
      category: 'layout_properties',
      property: 'display',
      expected: expected.display,
      actual: actual.display ?? 'block',
      pass,
      fix: pass ? undefined : `set display: ${expected.display}`,
    });
  }

  // Flex direction
  if (expected.flexDirection) {
    const pass = expected.flexDirection === (actual.flexDirection ?? 'row');
    results.push({
      nodeId: expected.id,
      nodeName: expected.name,
      category: 'layout_properties',
      property: 'flex-direction',
      expected: expected.flexDirection,
      actual: actual.flexDirection ?? 'row',
      pass,
      fix: pass ? undefined : `set flex-direction: ${expected.flexDirection}`,
    });
  }

  // Justify content
  if (expected.justifyContent) {
    const pass = expected.justifyContent === (actual.justifyContent ?? 'flex-start');
    results.push({
      nodeId: expected.id,
      nodeName: expected.name,
      category: 'layout_properties',
      property: 'justify-content',
      expected: expected.justifyContent,
      actual: actual.justifyContent ?? 'flex-start',
      pass,
      fix: pass ? undefined : `set justify-content: ${expected.justifyContent}`,
    });
  }

  // Align items
  if (expected.alignItems) {
    const pass = expected.alignItems === (actual.alignItems ?? 'stretch');
    results.push({
      nodeId: expected.id,
      nodeName: expected.name,
      category: 'layout_properties',
      property: 'align-items',
      expected: expected.alignItems,
      actual: actual.alignItems ?? 'stretch',
      pass,
      fix: pass ? undefined : `set align-items: ${expected.alignItems}`,
    });
  }

  // Gap
  if (expected.gap != null) {
    const actualGap = actual.gap ?? 0;
    const pass = Math.abs(expected.gap - actualGap) <= tolerances.spacing;
    results.push({
      nodeId: expected.id,
      nodeName: expected.name,
      category: 'layout_properties',
      property: 'gap',
      expected: expected.gap,
      actual: actualGap,
      pass,
      diff: pass ? undefined : `Δ${(expected.gap - actualGap).toFixed(1)}px`,
      fix: pass ? undefined : `set gap to ${expected.gap}px`,
    });
  }

  // Padding
  if (expected.padding) {
    const actualPad = actual.padding ?? { top: 0, right: 0, bottom: 0, left: 0 };
    for (const side of ['top', 'right', 'bottom', 'left'] as const) {
      const expVal = expected.padding[side];
      const actVal = actualPad[side];
      const pass = Math.abs(expVal - actVal) <= tolerances.spacing;
      results.push({
        nodeId: expected.id,
        nodeName: expected.name,
        category: 'layout_properties',
        property: `padding-${side}`,
        expected: expVal,
        actual: actVal,
        pass,
        diff: pass ? undefined : `Δ${(expVal - actVal).toFixed(1)}px`,
        fix: pass ? undefined : `set padding-${side} to ${expVal}px`,
      });
    }
  }

  // Border radius
  if (expected.borderRadius != null) {
    const actualBr = actual.borderRadius ?? 0;
    const pass = compareBorderRadius(expected.borderRadius, actualBr, tolerances.borderRadius);
    results.push({
      nodeId: expected.id,
      nodeName: expected.name,
      category: 'layout_properties',
      property: 'border-radius',
      expected: expected.borderRadius,
      actual: actualBr,
      pass,
      fix: pass ? undefined : `set border-radius to ${formatBorderRadius(expected.borderRadius)}`,
    });
  }

  return results;
}

function compareBorderRadius(
  expected: number | [number, number, number, number],
  actual: number | [number, number, number, number],
  tolerance: number,
): boolean {
  if (typeof expected === 'number' && typeof actual === 'number') {
    return Math.abs(expected - actual) <= tolerance;
  }
  const exp = typeof expected === 'number' ? [expected, expected, expected, expected] : expected;
  const act = typeof actual === 'number' ? [actual, actual, actual, actual] : actual;
  return exp.every((v, i) => Math.abs(v - act[i]) <= tolerance);
}

function formatBorderRadius(v: number | [number, number, number, number]): string {
  if (typeof v === 'number') return `${v}px`;
  return `${v[0]}px ${v[1]}px ${v[2]}px ${v[3]}px`;
}
