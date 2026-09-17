import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import { createServer } from 'node:net';

export interface ViteServer {
  proc: ChildProcess;
  port: number;
  url: string;
}

/**
 * 找一个可用端口
 */
async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 5173;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

/**
 * 启动 Vite dev server
 */
export async function startViteServer(
  projectDir: string,
): Promise<ViteServer> {
  const port = await findFreePort();
  const proc = spawn('npx', ['vite', '--port', String(port), '--host'], {
    cwd: projectDir,
    stdio: 'pipe',
    env: { ...process.env, FORCE_COLOR: '0' },
  });

  // 收集 stdout/stderr 用于调试
  let stdout = '';
  let stderr = '';
  proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
  proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

  const url = `http://localhost:${port}`;

  return { proc, port, url };
}

/**
 * 等待 server 就绪（轮询 HTTP）
 */
export async function waitForServer(
  url: string,
  timeout = 30_000,
): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    try {
      await new Promise<void>((resolve, reject) => {
        const req = http.get(url, (res) => {
          res.resume();
          if (res.statusCode && res.statusCode < 500) {
            resolve();
          } else {
            reject(new Error(`Status ${res.statusCode}`));
          }
        });
        req.on('error', reject);
        req.setTimeout(2_000, () => {
          req.destroy();
          reject(new Error('timeout'));
        });
      });
      return; // server ready
    } catch {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  throw new Error(`Vite server not ready at ${url} after ${timeout}ms`);
}

/**
 * 停止 Vite dev server
 */
export async function stopViteServer(server: ViteServer): Promise<void> {
  return new Promise<void>((resolve) => {
    if (!server.proc || server.proc.killed) {
      resolve();
      return;
    }

    server.proc.on('exit', () => resolve());

    // SIGTERM 先尝试优雅退出
    server.proc.kill('SIGTERM');

    // 3s 后强杀
    setTimeout(() => {
      if (!server.proc.killed) {
        server.proc.kill('SIGKILL');
      }
      resolve();
    }, 3_000);
  });
}
