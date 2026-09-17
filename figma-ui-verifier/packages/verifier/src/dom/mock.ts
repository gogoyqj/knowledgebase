import type { Page } from 'puppeteer';

/**
 * 在 Puppeteer 页面中将所有文本节点替换为等长 "X" 字符串
 * 保留换行符位置，确保多行文本布局不变
 */
export async function mockTextContent(page: Page): Promise<void> {
  await page.evaluate(() => {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.textContent?.trim()) {
        node.textContent = node.textContent
          .split('\n')
          .map(line => line.replace(/\S/g, 'X'))
          .join('\n');
      }
    }
  });
}
