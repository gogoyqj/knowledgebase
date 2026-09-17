import type { DiffResult, FixSuggestion } from '../types.js';

/**
 * 从失败的 DiffResult 生成修复建议
 */
export function generateFixSuggestions(diffs: DiffResult[]): FixSuggestion[] {
  return diffs
    .filter(d => !d.pass && d.fix)
    .map(d => ({
      nodeId: d.nodeId,
      nodeName: d.nodeName,
      property: d.property,
      expectedPx: formatValue(d.expected),
      actualPx: formatValue(d.actual),
      diff: d.diff ?? '',
      fix: d.fix!,
    }));
}

function formatValue(v: unknown): string {
  if (typeof v === 'number') return `${v}px`;
  if (typeof v === 'object' && v !== null) return JSON.stringify(v);
  return String(v);
}
