import type { Page } from 'puppeteer';
import type { RawDOMElement } from './normalizer.js';

const STYLE_PROPS = [
  'backgroundColor', 'borderColor', 'borderTopWidth', 'borderRightWidth',
  'borderBottomWidth', 'borderLeftWidth', 'borderRadius',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'fontSize', 'fontFamily', 'fontWeight', 'lineHeight', 'letterSpacing',
  'opacity', 'boxShadow', 'filter', 'backdropFilter',
  'display', 'flexDirection', 'justifyContent', 'alignItems', 'gap', 'overflow',
] as const;

/**
 * 设置 Puppeteer 视口宽度
 */
export async function setupViewport(page: Page, width: number): Promise<void> {
  await page.setViewport({ width, height: 800 });
}

/**
 * 从 Puppeteer 页面提取所有带 data-figma-id 的元素的 computed styles
 */
export async function inspectDOM(page: Page): Promise<RawDOMElement[]> {
  return page.evaluate((styleProps: readonly string[]) => {
    const elements = document.querySelectorAll('[data-figma-id]');
    const results: Array<{
      figmaId: string;
      tagName: string;
      rect: { x: number; y: number; width: number; height: number };
      parentRect: { x: number; y: number; width: number; height: number } | null;
      styles: Record<string, string>;
      boxSizing: 'border-box' | 'content-box';
      children: unknown[];
      textContent: string | null;
    }> = [];

    for (const el of elements) {
      const htmlEl = el as HTMLElement;
      const rect = htmlEl.getBoundingClientRect();
      const parentEl = htmlEl.parentElement;
      const parentRect = parentEl ? parentEl.getBoundingClientRect() : null;
      const computed = getComputedStyle(htmlEl);

      const styles: Record<string, string> = {};
      for (const prop of styleProps) {
        styles[prop] = (computed as unknown as Record<string, string>)[prop] ?? '';
      }

      // 提取直接文本内容（不含子元素文本）
      let textContent: string | null = null;
      for (const child of htmlEl.childNodes) {
        if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) {
          textContent = (textContent ?? '') + child.textContent;
        }
      }

      results.push({
        figmaId: htmlEl.getAttribute('data-figma-id')!,
        tagName: htmlEl.tagName.toLowerCase(),
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        parentRect: parentRect ? { x: parentRect.x, y: parentRect.y, width: parentRect.width, height: parentRect.height } : null,
        styles,
        boxSizing: computed.boxSizing as 'border-box' | 'content-box',
        children: [], // 子元素通过 DOM 树关系构建
        textContent,
      });
    }

    // 构建父子关系
    const idMap = new Map(results.map(r => [r.figmaId, r]));
    const roots: typeof results = [];
    for (const r of results) {
      const parentEl = document.querySelector(`[data-figma-id="${r.figmaId}"]`)?.parentElement;
      const parentFigmaId = parentEl?.getAttribute?.('data-figma-id');
      if (parentFigmaId && idMap.has(parentFigmaId) && parentFigmaId !== r.figmaId) {
        idMap.get(parentFigmaId)!.children.push(r);
      } else {
        roots.push(r);
      }
    }

    return roots as unknown as RawDOMElement[];
  }, STYLE_PROPS);
}
