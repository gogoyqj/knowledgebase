import { describe, it, expect } from 'vitest';
import { comparePixels } from '../../src/diff/pixel.js';

// Helper: create a PNG buffer for testing (minimum 64x64 for SSIM to work)
function createTestPNG(width: number, height: number, r: number, g: number, b: number, a: number = 255): Buffer {
  // Use pngjs to create a valid PNG
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PNG } = require('pngjs') as typeof import('pngjs');
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      png.data[idx] = r;
      png.data[idx + 1] = g;
      png.data[idx + 2] = b;
      png.data[idx + 3] = a;
    }
  }
  return PNG.sync.write(png);
}

describe('comparePixels', () => {
  it('should return perfect SSIM for identical images', () => {
    const img = createTestPNG(64, 64, 128, 128, 128);
    const result = comparePixels(img, img);

    expect(result.ssimScore).toBeCloseTo(1.0, 2);
    expect(result.ssimPass).toBe(true);
    expect(result.pixelMismatchRatio).toBe(0);
    expect(result.pixelPass).toBe(true);
    expect(result.width).toBe(64);
    expect(result.height).toBe(64);
  });

  it('should detect differences between images', () => {
    const img1 = createTestPNG(64, 64, 255, 0, 0); // red
    const img2 = createTestPNG(64, 64, 0, 0, 255); // blue
    const result = comparePixels(img1, img2);

    expect(result.ssimScore).toBeLessThan(0.95);
    expect(result.ssimPass).toBe(false);
    expect(result.pixelMismatchRatio).toBeGreaterThan(0);
    expect(result.pixelPass).toBe(false);
  });

  it('should produce diff image buffer', () => {
    const img1 = createTestPNG(64, 64, 255, 0, 0);
    const img2 = createTestPNG(64, 64, 0, 0, 255);
    const result = comparePixels(img1, img2);

    expect(result.diffImageBuffer).not.toBeNull();
    expect(result.diffImageBuffer!.length).toBeGreaterThan(0);
  });

  it('should handle images of different sizes', () => {
    const img1 = createTestPNG(64, 64, 128, 128, 128);
    const img2 = createTestPNG(48, 48, 128, 128, 128);
    const result = comparePixels(img1, img2);

    expect(result.width).toBe(48);
    expect(result.height).toBe(48);
    expect(result.ssimScore).toBeCloseTo(1.0, 2);
  });

  it('should find mismatch regions', () => {
    // Create two images with a small different region
    const img1 = createTestPNG(64, 64, 128, 128, 128);
    // Create a second image that differs in a region
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PNG } = require('pngjs') as typeof import('pngjs');
    const png2 = PNG.sync.read(img1);
    // Make a 10x10 block different
    for (let y = 20; y < 30; y++) {
      for (let x = 20; x < 30; x++) {
        const idx = (y * 64 + x) * 4;
        png2.data[idx] = 255;
        png2.data[idx + 1] = 0;
        png2.data[idx + 2] = 0;
      }
    }
    const img2 = PNG.sync.write(png2);

    const result = comparePixels(img1, img2);

    expect(result.mismatchRegions.length).toBeGreaterThan(0);
    expect(result.pixelMismatchRatio).toBeGreaterThan(0);
  });

  it('should respect custom SSIM threshold', () => {
    const img1 = createTestPNG(64, 64, 128, 128, 128);
    const img2 = createTestPNG(64, 64, 130, 130, 130); // slightly different

    const strictResult = comparePixels(img1, img2, { ssimThreshold: 0.999 });
    const looseResult = comparePixels(img1, img2, { ssimThreshold: 0.5 });

    // Same SSIM score but different pass/fail based on threshold
    expect(strictResult.ssimScore).toBe(looseResult.ssimScore);
    expect(looseResult.ssimPass).toBe(true);
  });

  it('should respect custom color threshold', () => {
    const img1 = createTestPNG(64, 64, 128, 128, 128);
    const img2 = createTestPNG(64, 64, 130, 130, 130);

    const strictResult = comparePixels(img1, img2, { colorThreshold: 0.01 });
    const looseResult = comparePixels(img1, img2, { colorThreshold: 0.5 });

    // Strict threshold should find more mismatches
    expect(strictResult.pixelMismatchRatio).toBeGreaterThanOrEqual(looseResult.pixelMismatchRatio);
  });
});