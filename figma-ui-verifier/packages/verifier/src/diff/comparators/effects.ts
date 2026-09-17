import type { NormalizedNode, DiffResult } from '../../types.js';
import type { ToleranceConfig } from '../../config.js';

/**
 * 效果对比器：box-shadow, filter, backdrop-filter
 * 标准化后精确匹配
 */
export function compareEffects(
  expected: NormalizedNode,
  actual: NormalizedNode,
  _tolerances: ToleranceConfig,
): DiffResult[] {
  const results: DiffResult[] = [];

  if (expected.boxShadow) {
    const actualBs = actual.boxShadow;
    const pass = normalizeShadow(expected.boxShadow) === normalizeShadow(actualBs ?? '');
    results.push({
      nodeId: expected.id,
      nodeName: expected.name,
      category: 'layout_properties',
      property: 'box-shadow',
      expected: expected.boxShadow,
      actual: actualBs ?? 'none',
      pass,
      fix: pass ? undefined : `set box-shadow: ${expected.boxShadow}`,
    });
  }

  if (expected.filter) {
    const actualF = actual.filter;
    const pass = expected.filter === actualF;
    results.push({
      nodeId: expected.id,
      nodeName: expected.name,
      category: 'layout_properties',
      property: 'filter',
      expected: expected.filter,
      actual: actualF ?? 'none',
      pass,
      fix: pass ? undefined : `set filter: ${expected.filter}`,
    });
  }

  if (expected.backdropFilter) {
    const actualBf = actual.backdropFilter;
    const pass = expected.backdropFilter === actualBf;
    results.push({
      nodeId: expected.id,
      nodeName: expected.name,
      category: 'layout_properties',
      property: 'backdrop-filter',
      expected: expected.backdropFilter,
      actual: actualBf ?? 'none',
      pass,
      fix: pass ? undefined : `set backdrop-filter: ${expected.backdropFilter}`,
    });
  }

  // Overflow
  if (expected.overflow) {
    const actualOf = actual.overflow ?? 'visible';
    const pass = expected.overflow === actualOf;
    results.push({
      nodeId: expected.id,
      nodeName: expected.name,
      category: 'layout_properties',
      property: 'overflow',
      expected: expected.overflow,
      actual: actualOf,
      pass,
      fix: pass ? undefined : `set overflow: ${expected.overflow}`,
    });
  }

  return results;
}

/**
 * 标准化 box-shadow 字符串（去空格、统一精度）
 */
function normalizeShadow(s: string): string {
  if (!s || s === 'none') return '';
  return s
    .replace(/rgba?\(([^)]+)\)/g, (_match, inner: string) => {
      const parts = inner.split(',').map(p => p.trim());
      return `rgba(${parts.map(p => {
        const n = parseFloat(p);
        return Number.isInteger(n) ? n : n.toFixed(2);
      }).join(',')})`;
    })
    .replace(/\s+/g, ' ')
    .trim();
}
