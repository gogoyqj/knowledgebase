import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const CACHE_DIR = '.figma-cache';

/**
 * 基于 file_key + version hash 的本地缓存
 * 避免高频 CI 触发 Figma API 限流
 */
export class FigmaCache {
  private cacheDir: string;

  constructor(cacheDir: string = CACHE_DIR) {
    this.cacheDir = cacheDir;
    if (!existsSync(cacheDir)) {
      mkdirSync(cacheDir, { recursive: true });
    }
  }

  get(fileKey: string, version: string): unknown | null {
    const path = this.cachePath(fileKey, version);
    if (!existsSync(path)) return null;
    try {
      return JSON.parse(readFileSync(path, 'utf-8'));
    } catch {
      return null;
    }
  }

  set(fileKey: string, version: string, data: unknown): void {
    const path = this.cachePath(fileKey, version);
    writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
  }

  private cachePath(fileKey: string, version: string): string {
    const hash = createHash('sha256').update(`${fileKey}:${version}`).digest('hex').slice(0, 12);
    return join(this.cacheDir, `${fileKey}_${hash}.json`);
  }
}

/**
 * Figma REST API wrapper for fetching node images (screenshots).
 */
export class FigmaAPI {
  private token: string;
  private baseUrl = 'https://api.figma.com/v1';

  constructor(token: string) {
    this.token = token;
  }

  /**
   * Fetch rendered image for a specific node.
   * Returns PNG buffer or null if the request fails.
   */
  async getScreenshot(
    fileKey: string,
    nodeId: string,
    scale: number = 2,
  ): Promise<Buffer | null> {
    try {
      // URL-encode the node ID (Figma uses "123:456" format)
      const encodedId = encodeURIComponent(nodeId);
      const url = `${this.baseUrl}/images/${fileKey}?ids=${encodedId}&format=png&scale=${scale}`;

      const response = await fetch(url, {
        headers: { 'X-Figma-Token': this.token },
      });

      if (!response.ok) {
        console.warn(`Figma API error: ${response.status} ${response.statusText}`);
        return null;
      }

      const data = await response.json() as { images?: Record<string, string | null> };
      const imageUrl = data.images?.[nodeId];

      if (!imageUrl) {
        console.warn(`No image URL returned for node ${nodeId}`);
        return null;
      }

      // Fetch the actual image
      const imgResponse = await fetch(imageUrl);
      if (!imgResponse.ok) return null;

      const arrayBuffer = await imgResponse.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (err) {
      console.warn('Figma API request failed:', err);
      return null;
    }
  }

  /**
   * Fetch multiple node images in a single request.
   * Returns a map of nodeId → PNG buffer.
   */
  async getScreenshots(
    fileKey: string,
    nodeIds: string[],
    scale: number = 2,
  ): Promise<Map<string, Buffer>> {
    const results = new Map<string, Buffer>();

    try {
      const encodedIds = nodeIds.map(encodeURIComponent).join(',');
      const url = `${this.baseUrl}/images/${fileKey}?ids=${encodedIds}&format=png&scale=${scale}`;

      const response = await fetch(url, {
        headers: { 'X-Figma-Token': this.token },
      });

      if (!response.ok) {
        console.warn(`Figma API error: ${response.status} ${response.statusText}`);
        return results;
      }

      const data = await response.json() as { images?: Record<string, string | null> };

      // Fetch each image in parallel
      const fetchPromises = Object.entries(data.images ?? {})
        .filter((entry): entry is [string, string] => entry[1] !== null)
        .map(async ([id, imageUrl]) => {
          try {
            const imgResponse = await fetch(imageUrl);
            if (imgResponse.ok) {
              const arrayBuffer = await imgResponse.arrayBuffer();
              results.set(id, Buffer.from(arrayBuffer));
            }
          } catch {
            // Skip failed image fetches
          }
        });

      await Promise.all(fetchPromises);
    } catch (err) {
      console.warn('Figma API request failed:', err);
    }

    return results;
  }
}