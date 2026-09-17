import type { Page } from 'puppeteer';
import type { NormalizedNode, DiffResult } from '../types.js';

export interface BehavioralCheckOptions {
  /** Check hover states */
  checkHover?: boolean;
  /** Check click/active states */
  checkActive?: boolean;
  /** Check focus states */
  checkFocus?: boolean;
  /** Timeout for state transitions (ms) */
  transitionTimeout?: number;
}

export interface BehavioralResult {
  nodeId: string;
  nodeName: string;
  check: 'hover' | 'active' | 'focus';
  passed: boolean;
  expected?: Record<string, unknown>;
  actual?: Record<string, string>;
  diffs: DiffResult[];
}

const DEFAULT_OPTIONS: Required<BehavioralCheckOptions> = {
  checkHover: true,
  checkActive: true,
  checkFocus: false,
  transitionTimeout: 300,
};

/**
 * Check interactive states (hover, active, focus) for matched nodes.
 * Compares computed styles before and after interaction.
 */
export async function checkBehavioralStates(
  page: Page,
  matchedPairs: Array<{ figma: NormalizedNode; dom: NormalizedNode }>,
  options?: BehavioralCheckOptions,
): Promise<BehavioralResult[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const results: BehavioralResult[] = [];

  for (const pair of matchedPairs) {
    const selector = `[data-figma-id="${pair.dom.id}"]`;
    const element = await page.$(selector);
    if (!element) continue;

    // Get baseline styles
    const baseline = await getElementStyles(page, selector);

    // Check hover state
    if (opts.checkHover) {
      const hoverResult = await checkState(
        page, element, selector, 'hover', baseline, pair, opts.transitionTimeout,
      );
      if (hoverResult) results.push(hoverResult);
    }

    // Check active state
    if (opts.checkActive) {
      const activeResult = await checkState(
        page, element, selector, 'active', baseline, pair, opts.transitionTimeout,
      );
      if (activeResult) results.push(activeResult);
    }

    // Check focus state
    if (opts.checkFocus) {
      const focusResult = await checkState(
        page, element, selector, 'focus', baseline, pair, opts.transitionTimeout,
      );
      if (focusResult) results.push(focusResult);
    }
  }

  return results;
}

async function checkState(
  page: Page,
  element: import('puppeteer').ElementHandle,
  selector: string,
  state: 'hover' | 'active' | 'focus',
  baseline: Record<string, string>,
  pair: { figma: NormalizedNode; dom: NormalizedNode },
  timeout: number,
): Promise<BehavioralResult | null> {
  try {
    // Trigger the state
    switch (state) {
      case 'hover':
        await element.hover();
        break;
      case 'active':
        await page.mouse.down();
        break;
      case 'focus':
        await element.focus();
        break;
    }

    // Wait for transition
    await new Promise(resolve => setTimeout(resolve, timeout));

    // Get styles in new state
    const stateStyles = await getElementStyles(page, selector);

    // Reset state
    switch (state) {
      case 'active':
        await page.mouse.up();
        break;
      case 'focus':
        await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          if (el) (el as HTMLElement).blur();
        }, selector);
        break;
    }

    // Check if styles changed (meaning the state is implemented)
    const changed = hasStyleChanged(baseline, stateStyles);

    // If Figma defines expected state, compare against it
    const expectedState = pair.figma.instanceOverrides?.[state] as Record<string, unknown> | undefined;
    const diffs: DiffResult[] = [];

    if (expectedState) {
      for (const [prop, expected] of Object.entries(expectedState)) {
        const actual = stateStyles[prop];
        if (actual !== String(expected)) {
          diffs.push({
            nodeId: pair.dom.id,
            nodeName: pair.dom.name,
            category: 'color_style',
            property: `${state}:${prop}`,
            expected,
            actual,
            pass: false,
            diff: `${prop} should change on ${state}`,
          });
        }
      }
    }

    return {
      nodeId: pair.dom.id,
      nodeName: pair.dom.name,
      check: state,
      passed: changed || diffs.length === 0,
      expected: expectedState,
      actual: stateStyles,
      diffs,
    };
  } catch {
    return null;
  }
}

async function getElementStyles(
  page: Page,
  selector: string,
): Promise<Record<string, string>> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) {
      return {
        backgroundColor: '',
        color: '',
        borderColor: '',
        opacity: '',
        transform: '',
        boxShadow: '',
        outline: '',
      };
    }
    const computed = window.getComputedStyle(el);
    return {
      backgroundColor: computed.backgroundColor ?? '',
      color: computed.color ?? '',
      borderColor: computed.borderColor ?? '',
      opacity: computed.opacity ?? '',
      transform: computed.transform ?? '',
      boxShadow: computed.boxShadow ?? '',
      outline: computed.outline ?? '',
    };
  }, selector);
}

function hasStyleChanged(
  baseline: Record<string, string>,
  current: Record<string, string>,
): boolean {
  const propsToCheck = ['backgroundColor', 'color', 'borderColor', 'boxShadow', 'opacity', 'transform'];
  return propsToCheck.some(prop => baseline[prop] !== current[prop]);
}

/**
 * Generate behavioral verification report
 */
export function generateBehavioralReport(results: BehavioralResult[]): {
  total: number;
  passed: number;
  failed: number;
  details: BehavioralResult[];
} {
  const passed = results.filter(r => r.passed).length;
  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    details: results,
  };
}