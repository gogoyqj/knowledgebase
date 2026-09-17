import { DiffCategory } from '../types.js';

export interface PixelDiffOptions {
  /** SSIM threshold below which images are considered different (default: 0.95) */
  ssimThreshold?: number;
  /** pixelmatch color threshold 0-1 (default: 0.1) */
  colorThreshold?: number;
  /** pixelmatch pixel anti-aliasing (default: true) */
  includeAA?: boolean;
}

export interface MismatchRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  pixelCount: number;
}

export interface PixelDiffResult {
  ssimScore: number;
  ssimPass: boolean;
  pixelMismatchRatio: number;
  pixelPass: boolean;
  diffImageBuffer: Buffer | null;
  mismatchRegions: MismatchRegion[];
  width: number;
  height: number;
  category: DiffCategory;
}

const DEFAULT_OPTIONS: Required<PixelDiffOptions> = {
  ssimThreshold: 0.95,
  colorThreshold: 0.1,
  includeAA: true,
};

/**
 * Parse PNG buffer to raw RGBA pixel data.
 * Returns { width, height, data } where data is Uint8ClampedArray of RGBA.
 */
function parsePNG(buffer: Buffer): { width: number; height: number; data: Uint8ClampedArray } {
  // Dynamic import for pngjs — it's a CJS module
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PNG } = require('pngjs') as typeof import('pngjs');
  const png = PNG.sync.read(buffer);
  return {
    width: png.width,
    height: png.height,
    data: new Uint8ClampedArray(png.data),
  };
}

/**
 * Write raw RGBA data to PNG buffer.
 */
function writePNG(
  width: number,
  height: number,
  data: Uint8ClampedArray,
): Buffer {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PNG } = require('pngjs') as typeof import('pngjs');
  const png = new PNG({ width, height });
  png.data = Buffer.from(data);
  return PNG.sync.write(png);
}

/**
 * Compute SSIM between two images.
 * Uses ssim.js with downsampled window for performance.
 */
function computeSSIM(
  img1: { width: number; height: number; data: Uint8ClampedArray },
  img2: { width: number; height: number; data: Uint8ClampedArray },
): number {
  // Dynamic import for ssim.js
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ssim = require('ssim.js') as { ssim: (img1: unknown, img2: unknown) => { mssim: number } };

  // ssim.js expects { data, width, height } shape — same as ours
  const result = ssim.ssim(img1, img2);
  return result.mssim;
}

/**
 * Compute pixel-level diff using pixelmatch.
 * Returns mismatch pixel count and diff image data.
 */
function computePixelDiff(
  img1: { width: number; height: number; data: Uint8ClampedArray },
  img2: { width: number; height: number; data: Uint8ClampedArray },
  options: Required<PixelDiffOptions>,
): { mismatchCount: number; diffData: Uint8ClampedArray } {
  // Dynamic import for pixelmatch — handle both CJS and ESM default exports
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pixelmatchMod = require('pixelmatch') as {
    default?: (img1: Uint8ClampedArray, img2: Uint8ClampedArray, output: Uint8ClampedArray, width: number, height: number, options: { threshold: number; includeAA: boolean }) => number;
    (img1: Uint8ClampedArray, img2: Uint8ClampedArray, output: Uint8ClampedArray, width: number, height: number, options: { threshold: number; includeAA: boolean }): number;
  };
  const pixelmatch = pixelmatchMod.default ?? pixelmatchMod;

  const diffData = new Uint8ClampedArray(img1.data.length);
  const mismatchCount = pixelmatch(
    img1.data,
    img2.data,
    diffData,
    img1.width,
    img1.height,
    {
      threshold: options.colorThreshold,
      includeAA: options.includeAA,
    },
  );

  return { mismatchCount, diffData };
}

/**
 * Find contiguous mismatch regions from diff image data.
 * Uses simple flood-fill to cluster red-ish pixels.
 */
function findMismatchRegions(
  diffData: Uint8ClampedArray,
  width: number,
  height: number,
): MismatchRegion[] {
  const visited = new Uint8Array(width * height);
  const regions: MismatchRegion[] = [];
  const MIN_REGION_PIXELS = 10; // ignore noise

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (visited[idx]) continue;

      const offset = idx * 4;
      // pixelmatch marks diff pixels as red (255, 0, 0)
      const isDiff =
        diffData[offset] > 200 &&
        diffData[offset + 1] < 50 &&
        diffData[offset + 2] < 50;

      if (!isDiff) {
        visited[idx] = 1;
        continue;
      }

      // BFS flood fill
      const queue: number[] = [idx];
      visited[idx] = 1;
      let minX = x,
        maxX = x,
        minY = y,
        maxY = y,
        count = 0;

      while (queue.length > 0) {
        const ci = queue.shift()!;
        const cx = ci % width;
        const cy = Math.floor(ci / width);
        count++;

        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        // 4-connected neighbors
        for (const [dx, dy] of [
          [0, 1],
          [0, -1],
          [1, 0],
          [-1, 0],
        ] as const) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const ni = ny * width + nx;
          if (visited[ni]) continue;
          visited[ni] = 1;
          const no = ni * 4;
          if (
            diffData[no] > 200 &&
            diffData[no + 1] < 50 &&
            diffData[no + 2] < 50
          ) {
            queue.push(ni);
          }
        }
      }

      if (count >= MIN_REGION_PIXELS) {
        regions.push({
          x: minX,
          y: minY,
          width: maxX - minX + 1,
          height: maxY - minY + 1,
          pixelCount: count,
        });
      }
    }
  }

  return regions;
}

/**
 * Main pixel comparison entry point.
 * Compares two PNG image buffers and returns SSIM + pixel diff results.
 */
export function comparePixels(
  expectedBuffer: Buffer,
  actualBuffer: Buffer,
  options?: PixelDiffOptions,
): PixelDiffResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const expected = parsePNG(expectedBuffer);
  const actual = parsePNG(actualBuffer);

  // Resize to match if dimensions differ — use the smaller dimensions
  const width = Math.min(expected.width, actual.width);
  const height = Math.min(expected.height, actual.height);

  // Crop to common area
  const cropExpected = cropImage(expected, width, height);
  const cropActual = cropImage(actual, width, height);

  // SSIM
  const ssimScore = computeSSIM(cropExpected, cropActual);
  const ssimPass = ssimScore >= opts.ssimThreshold;

  // Pixel diff
  const { mismatchCount, diffData } = computePixelDiff(
    cropExpected,
    cropActual,
    opts,
  );
  const totalPixels = width * height;
  const pixelMismatchRatio = totalPixels > 0 ? mismatchCount / totalPixels : 0;
  const pixelPass = pixelMismatchRatio < 0.05; // < 5% mismatch = pass

  // Diff image
  const diffImageBuffer = writePNG(width, height, diffData);

  // Mismatch regions
  const mismatchRegions = findMismatchRegions(diffData, width, height);

  return {
    ssimScore,
    ssimPass,
    pixelMismatchRatio,
    pixelPass,
    diffImageBuffer,
    mismatchRegions,
    width,
    height,
    category: 'color_style' as DiffCategory,
  };
}

/**
 * Crop image to specified dimensions from top-left corner.
 */
function cropImage(
  img: { width: number; height: number; data: Uint8ClampedArray },
  targetWidth: number,
  targetHeight: number,
): { width: number; height: number; data: Uint8ClampedArray } {
  if (img.width === targetWidth && img.height === targetHeight) {
    return img;
  }

  const croppedData = new Uint8ClampedArray(targetWidth * targetHeight * 4);
  for (let y = 0; y < targetHeight; y++) {
    const srcOffset = y * img.width * 4;
    const dstOffset = y * targetWidth * 4;
    const rowBytes = targetWidth * 4;
    croppedData.set(img.data.subarray(srcOffset, srcOffset + rowBytes), dstOffset);
  }

  return {
    width: targetWidth,
    height: targetHeight,
    data: croppedData,
  };
}