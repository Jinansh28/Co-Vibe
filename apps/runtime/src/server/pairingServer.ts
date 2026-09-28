import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, ChildProcess } from 'node:child_process';
import crypto from 'node:crypto';
import { PairingVerifySchema } from '@co-vibe/protocol';
import { TokenManager } from '../auth/tokenManager.js';
import { assertWorkspacePath } from '@co-vibe/security';

const activeProcesses = new Map<string, ChildProcess>();

function getWorkspaceRoot(req?: http.IncomingMessage) {
  const baseRoot = process.env.WORKSPACE_ROOT || process.cwd();
  if (req) {
    const workspaceId = req.headers['x-workspace-id'];
    if (workspaceId && typeof workspaceId === 'string') {
      return path.join(baseRoot, '.workspaces', workspaceId);
    }
  }
  return baseRoot;
}

export function setCorsHeaders(res: http.ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Workspace-Id');
}

export async function parseJsonBody<T>(req: http.IncomingMessage): Promise<T | null> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(body ? (JSON.parse(body) as T) : null);
      } catch (_e) {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });
}

// Allowed binaries for the host exec endpoint (security allowlist)
const EXEC_ALLOWLIST = new Set([
  'npm', 'npx', 'pnpm', 'node', 'yarn', 'python', 'python3', 'bash', 'sh', 'go', 'cargo',
  'tsc', 'vitest', 'vite',
  'git', 'gcc', 'g++', 'clang', 'clang++', 'make', 'a.exe', 'main.exe', './a.out', './main', './main.exe'
]);

export function createPairingRequestHandler(tokenManager: TokenManager) {
  return async (req: http.IncomingMessage, res: http.ServerResponse) => {
    setCorsHeaders(res);
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
    const pathname = url.pathname;
    const method = req.method?.toUpperCase();

    if (pathname === '/health' && method === 'GET') {
      res.writeHead(200);
      res.end(
        JSON.stringify({
          service: 'local-runtime',
          status: 'ok',
          timestamp: Date.now(),
          version: '0.1.0',
        })
      );
      return;
    }

    if (pathname === '/' && method === 'GET') {
      res.writeHead(200);
      res.end(
        JSON.stringify({
          name: 'Co-Vibe Runtime Daemon',
          status: 'active',
          runtimeId: tokenManager.getRuntimeId(),
        })
      );
      return;
    }

    if (
      (pathname === '/api/v1/pairing/code' || pathname === '/pairing/code') &&
      method === 'GET'
    ) {
      const codeInfo = tokenManager.getPairingCode();
      res.writeHead(200);
      res.end(
        JSON.stringify({
          ok: true,
          code: codeInfo.code,
          expiresAt: codeInfo.expiresAt,
        })
      );
      return;
    }

    if (
      (pathname === '/api/v1/pairing/verify' ||
        pathname === '/pairing/verify' ||
        pathname === '/pair') &&
      method === 'POST'
    ) {
      const body = await parseJsonBody<any>(req);
      const parsed = PairingVerifySchema.safeParse(body);

      if (!parsed.success) {
        res.writeHead(400);
        res.end(
          JSON.stringify({
            ok: false,
            error: 'Invalid request payload: 6-digit code required',
            details: parsed.error.issues,
          })
        );
        return;
      }

      const isValid = tokenManager.verifyPairingCode(parsed.data.code);

      if (!isValid) {
        res.writeHead(401);
        res.end(
          JSON.stringify({
            ok: false,
            error: 'Invalid or expired pairing code',
          })
        );
        return;
      }

      const tokenInfo = tokenManager.generateRuntimeToken(parsed.data.workspaceId);
      res.writeHead(200);
      res.end(
        JSON.stringify({
          ok: true,
          token: tokenInfo.token,
          runtimeId: tokenInfo.runtimeId,
          expiresAt: tokenInfo.expiresAt,
        })
      );
      return;
    }

    if (
      (pathname === '/api/v1/pairing/status' || pathname === '/pairing/status') &&
      method === 'GET'
    ) {
      res.writeHead(200);
      res.end(
        JSON.stringify({
          ok: true,
          paired: Boolean(tokenManager.getActiveToken()),
          runtimeId: tokenManager.getRuntimeId(),
        })
      );
      return;
    }

    // -------------------------------------------------------------------------
    // POST /api/v1/exec — Run a command on the host and stream output as NDJSON
    // -------------------------------------------------------------------------
    if (pathname === '/api/v1/exec' && method === 'POST') {
      const body = await parseJsonBody<any>(req);
      if (!body || typeof body.cmd !== 'string') {
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false, error: 'Missing required field: cmd' }));
        return;
      }

      const cmd: string = body.cmd;
      const args: string[] = Array.isArray(body.args) ? body.args.map(String) : [];
      const rawCwd: string = typeof body.cwd === 'string' ? body.cwd : '.';

      // Security: validate binary against allowlist
      if (!EXEC_ALLOWLIST.has(cmd)) {
        res.writeHead(403);
        res.end(JSON.stringify({ ok: false, error: `Command not allowed: ${cmd}` }));
        return;
      }

      // Security: validate cwd is within workspace root
      let safeCwd: string;
      try {
        safeCwd = assertWorkspacePath(getWorkspaceRoot(req), rawCwd);
      } catch {
        res.writeHead(403);
        res.end(JSON.stringify({ ok: false, error: 'Working directory outside workspace root' }));
        return;
      }

      // Stream output as NDJSON lines: {"stream":"stdout","chunk":"..."} per line
      res.setHeader('Content-Type', 'application/x-ndjson');
      res.setHeader('Transfer-Encoding', 'chunked');
      res.writeHead(200);

      const isWin = process.platform === 'win32';
      const actualCmd = isWin && ['npm', 'npx', 'pnpm', 'yarn', 'tsc', 'vite', 'vitest'].includes(cmd) 
        ? `${cmd}.cmd` 
        : cmd;

      const child = spawn(actualCmd, args, {
        cwd: safeCwd,
        shell: false,      // no shell — args are passed as literal array
        env: { ...process.env },
      });

      const executionId = crypto.randomUUID();
      activeProcesses.set(executionId, child);
      res.write(JSON.stringify({ stream: 'system', executionId, chunk: `[System] Process started. Execution ID: ${executionId}\n` }) + '\n');

      const TIMEOUT_MS = 5 * 60 * 1000; // 5 minute hard limit for run commands
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        res.write(JSON.stringify({ stream: 'system', chunk: '[Timeout] Process killed after 5 minutes\n' }) + '\n');
      }, TIMEOUT_MS);

      child.stdout?.on('data', (data: Buffer) => {
        res.write(JSON.stringify({ stream: 'stdout', chunk: data.toString() }) + '\n');
      });

      child.stderr?.on('data', (data: Buffer) => {
        res.write(JSON.stringify({ stream: 'stderr', chunk: data.toString() }) + '\n');
      });

      child.on('close', (code) => {
        activeProcesses.delete(executionId);
        clearTimeout(timer);
        res.write(JSON.stringify({ stream: 'exit', exitCode: code ?? -1 }) + '\n');
        res.end();
      });

      child.on('error', (err) => {
        activeProcesses.delete(executionId);
        clearTimeout(timer);
        res.write(JSON.stringify({ stream: 'system', chunk: `[Error] ${err.message}\n` }) + '\n');
        res.write(JSON.stringify({ stream: 'exit', exitCode: -1 }) + '\n');
        res.end();
      });

      return;
    }

    if (pathname.startsWith('/api/v1/exec/') && pathname.endsWith('/stdin') && method === 'POST') {
      const parts = pathname.split('/');
      const executionId = parts[4];
      const body = await parseJsonBody<any>(req);
      const process = activeProcesses.get(executionId);

      if (!process || !process.stdin) {
        res.writeHead(404);
        res.end(JSON.stringify({ ok: false, error: 'Process not found or stdin closed' }));
        return;
      }
      
      const input = typeof body?.input === 'string' ? body.input : '';
      process.stdin.write(input + '\n');
      
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    // File System Endpoints
    if (pathname.startsWith('/api/v1/files')) {
      // Very basic token validation for files (in MVP, local is trusted if CORS allows)
      // For production we'd want to check tokenManager.getActiveToken() against req headers
      
      const targetPath = url.searchParams.get('path') || '.';
      let safePath: string;
      try {
        safePath = assertWorkspacePath(getWorkspaceRoot(req), targetPath);
      } catch (e: any) {
        res.writeHead(403);
        res.end(JSON.stringify({ ok: false, error: e.message || 'Path not allowed' }));
        return;
      }

      if (pathname === '/api/v1/files' && method === 'GET') {
        try {
          const buildTree = async (currentPath: string, relativePath: string): Promise<any[]> => {
            const items = await fs.readdir(currentPath, { withFileTypes: true });
            const result = [];
            for (const item of items) {
              if (item.name === 'node_modules' || item.name === '.git') continue;
              const itemRelativePath = relativePath === '.' ? item.name : `${relativePath}/${item.name}`;
              if (item.isDirectory()) {
                result.push({
                  id: itemRelativePath,
                  name: item.name,
                  type: 'folder',
                  children: await buildTree(path.join(currentPath, item.name), itemRelativePath)
                });
              } else {
                result.push({
                  id: itemRelativePath,
                  name: item.name,
                  type: 'file'
                });
              }
            }
            return result.sort((a, b) => {
              if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
              return a.name.localeCompare(b.name);
            });
          };

          const tree = await buildTree(safePath, targetPath);
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true, files: tree }));
        } catch (e: any) {
          res.writeHead(500);
          res.end(JSON.stringify({ ok: false, error: e.message }));
        }
        return;
      }

      if (pathname === '/api/v1/files/content' && method === 'GET') {
        try {
          const content = await fs.readFile(safePath, 'utf8');
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true, content }));
        } catch (e: any) {
          res.writeHead(500);
          res.end(JSON.stringify({ ok: false, error: e.message }));
        }
        return;
      }

      if (pathname === '/api/v1/files/content' && method === 'PUT') {
        try {
          const body = await parseJsonBody<any>(req);
          if (!body || typeof body.content !== 'string') {
            res.writeHead(400);
            res.end(JSON.stringify({ ok: false, error: 'Invalid content' }));
            return;
          }
          await fs.writeFile(safePath, body.content, 'utf8');
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true }));
        } catch (e: any) {
          res.writeHead(500);
          res.end(JSON.stringify({ ok: false, error: e.message }));
        }
        return;
      }

      if (pathname === '/api/v1/files' && method === 'POST') {
        try {
          const body = await parseJsonBody<any>(req);
          if (!body || !body.type || !['file', 'folder'].includes(body.type)) {
            res.writeHead(400);
            res.end(JSON.stringify({ ok: false, error: 'Invalid type' }));
            return;
          }
          if (body.type === 'folder') {
            await fs.mkdir(safePath, { recursive: true });
          } else {
            // Check if directory exists, if not create it
            await fs.mkdir(path.dirname(safePath), { recursive: true });
            await fs.writeFile(safePath, '', 'utf8');
          }
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true }));
        } catch (e: any) {
          res.writeHead(500);
          res.end(JSON.stringify({ ok: false, error: e.message }));
        }
        return;
      }

      if (pathname === '/api/v1/files' && method === 'DELETE') {
        try {
          // Remove the file or directory recursively
          await fs.rm(safePath, { recursive: true, force: true });
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true }));
        } catch (e: any) {
          res.writeHead(500);
          res.end(JSON.stringify({ ok: false, error: e.message }));
        }
        return;
      }
    }

    res.writeHead(404);
    res.end(JSON.stringify({ ok: false, error: 'Not Found' }));
  };
}

export function createPairingServer(tokenManager: TokenManager = new TokenManager()): http.Server {
  const handler = createPairingRequestHandler(tokenManager);
  return http.createServer(handler);
}
