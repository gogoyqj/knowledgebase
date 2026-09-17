import { describe, it, expect } from 'vitest';
import { generateHTMLReport } from '../../src/report/html.js';
import type { VerifyResult, FixSuggestion } from '../../src/types.js';

describe('generateHTMLReport', () => {
  const baseResult: VerifyResult = {
    score: 85,
    passed: true,
    threshold: 80,
    breakdown: {
      completeness: { score: 90, weight: 0.1 },
      position_size: { score: 80, weight: 0.25 },
      color_style: { score: 85, weight: 0.2 },
      typography: { score: 88, weight: 0.2 },
      layout_properties: { score: 82, weight: 0.25 },
    },
    missing_nodes: 2,
    extra_nodes: 1,
    total_nodes: 50,
    diffs: [
      {
        nodeId: '1:1',
        nodeName: 'Button',
        category: 'position_size',
        property: 'x',
        expected: 100,
        actual: 95,
        pass: false,
        diff: '+5px',
      },
      {
        nodeId: '2:1',
        nodeName: 'Card',
        category: 'color_style',
        property: 'backgroundColor',
        expected: { r: 245, g: 245, b: 245, a: 1 },
        actual: { r: 255, g: 255, b: 255, a: 1 },
        pass: true,
      },
    ],
    missing: [
      {
        id: '3:1',
        name: 'Icon',
        type: 'VECTOR',
        visible: true,
        x: 10,
        y: 10,
        width: 24,
        height: 24,
        isComponent: false,
        isInstance: false,
      },
    ],
    extra: [],
  };

  const baseFixes: FixSuggestion[] = [
    {
      nodeId: '1:1',
      nodeName: 'Button',
      property: 'left',
      expectedPx: '100px',
      actualPx: '95px',
      diff: '+5px',
      fix: 'Set left: 100px (current: 95px, diff: +5px)',
    },
  ];

  it('should generate valid HTML', () => {
    const html = generateHTMLReport({ result: baseResult, fixSuggestions: baseFixes });
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('</html>');
    expect(html).toContain('Figma UI Verification Report');
  });

  it('should contain score information', () => {
    const html = generateHTMLReport({ result: baseResult, fixSuggestions: baseFixes });
    expect(html).toContain('85');
    expect(html).toContain('PASSED');
    expect(html).toContain('Threshold: 80');
  });

  it('should contain breakdown categories', () => {
    const html = generateHTMLReport({ result: baseResult, fixSuggestions: baseFixes });
    expect(html).toContain('Completeness');
    expect(html).toContain('Position/Size');
    expect(html).toContain('Color/Style');
    expect(html).toContain('Typography');
    expect(html).toContain('Layout');
  });

  it('should contain diff information', () => {
    const html = generateHTMLReport({ result: baseResult, fixSuggestions: baseFixes });
    expect(html).toContain('Button');
    expect(html).toContain('1:1');
    expect(html).toContain('Failed (1)');
  });

  it('should contain fix suggestions', () => {
    const html = generateHTMLReport({ result: baseResult, fixSuggestions: baseFixes });
    expect(html).toContain('Fix Suggestions (1)');
    expect(html).toContain('left: 100px');
  });

  it('should contain missing nodes info', () => {
    const html = generateHTMLReport({ result: baseResult, fixSuggestions: baseFixes });
    expect(html).toContain('Missing (2)');
    expect(html).toContain('Icon');
    expect(html).toContain('3:1');
  });

  it('should include screenshots when provided', () => {
    const html = generateHTMLReport({
      result: baseResult,
      fixSuggestions: baseFixes,
      screenshot: {
        figma: 'data:image/png;base64,AAA',
        dom: 'data:image/png;base64,BBB',
        diff: 'data:image/png;base64,CCC',
      },
    });
    expect(html).toContain('Figma Design');
    expect(html).toContain('DOM Screenshot');
    expect(html).toContain('Pixel Diff');
    expect(html).toContain('data:image/png;base64,AAA');
  });

  it('should include pixel result when provided', () => {
    const html = generateHTMLReport({
      result: baseResult,
      fixSuggestions: baseFixes,
      pixelResult: {
        ssimScore: 0.98,
        pixelMismatchRatio: 0.02,
        mismatchRegions: [{ x: 10, y: 10, width: 50, height: 50, pixelCount: 2500 }],
      },
    });
    expect(html).toContain('SSIM Score');
    expect(html).toContain('0.98');
    expect(html).toContain('Pixel Mismatch');
    expect(html).toContain('2.00%');
  });

  it('should show viewport scores when available', () => {
    const resultWithViewports: VerifyResult = {
      ...baseResult,
      viewport_scores: {
        '1440': { score: 85, ssim: 0.97, pixel_diff: 0.02 },
        '768': { score: 80 },
      },
    };
    const html = generateHTMLReport({ result: resultWithViewports, fixSuggestions: baseFixes });
    expect(html).toContain('Viewport Scores');
    expect(html).toContain('1440px');
    expect(html).toContain('768px');
  });

  it('should show failed state correctly', () => {
    const failedResult: VerifyResult = { ...baseResult, passed: false, score: 60 };
    const html = generateHTMLReport({ result: failedResult, fixSuggestions: [] });
    expect(html).toContain('FAILED');
    expect(html).toContain('60');
  });

  it('should handle no screenshots gracefully', () => {
    const html = generateHTMLReport({ result: baseResult, fixSuggestions: [] });
    expect(html).toContain('No screenshots available');
  });
});