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
