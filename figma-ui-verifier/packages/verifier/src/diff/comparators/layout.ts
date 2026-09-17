import type { NormalizedNode, DiffResult } from '../../types.js';
import type { ToleranceConfig } from '../../config.js';

/**
 * 位置/尺寸对比器
 */
export function compareLayout(
  expected: NormalizedNode,
  actual: NormalizedNode,
  tolerances: ToleranceConfig,
): DiffResult[] {
  const results: DiffResult[] = [];

  // Position
  results.push(checkNumeric(expected, actual, 'x', expected.x, actual.x, tolerances.position.x, 'position_size'));
  results.push(checkNumeric(expected, actual, 'y', expected.y, actual.y, tolerances.position.y, 'position_size'));

  // Size
  results.push(checkNumeric(expected, actual, 'width', expected.width, actual.width, tolerances.size.width, 'position_size'));
  results.push(checkNumeric(expected, actual, 'height', expected.height, actual.height, tolerances.size.height, 'position_size'));

  // Rotation
  if (expected.rotation != null) {
    const actualRot = actual.rotation ?? 0;
    const pass = Math.abs(expected.rotation - actualRot) <= tolerances.rotation;
    results.push({
      nodeId: expected.id,
      nodeName: expected.name,
      category: 'position_size',
      property: 'rotation',
      expected: expected.rotation,
      actual: actualRot,
      pass,
      diff: pass ? undefined : `Δ${(expected.rotation - actualRot).toFixed(1)}°`,
      fix: pass ? undefined : `set transform: rotate(${expected.rotation}deg)`,
    });
  }

  return results;
}

function checkNumeric(
  expected: NormalizedNode,
  actual: NormalizedNode,
  prop: string,
  expVal: number,
  actVal: number,
  tolerance: number,
  category: 'position_size',
): DiffResult {
  const pass = Math.abs(expVal - actVal) <= tolerance;
  return {
    nodeId: expected.id,
    nodeName: expected.name,
    category,
    property: prop,
    expected: expVal,
    actual: actVal,
    pass,
    diff: pass ? undefined : `Δ${(expVal - actVal).toFixed(1)}px`,
    fix: pass ? undefined : `set ${prop} to ${expVal}px`,
  };
}
