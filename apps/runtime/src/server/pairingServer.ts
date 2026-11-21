import http from 'node:http';
import fs from 'node:fs/promises';
import syncFs from 'node:fs';
import path from 'node:path';
import { spawn, ChildProcess } from 'node:child_process';
import crypto from 'node:crypto';
import { PairingVerifySchema, type AgentTaskProgressPayload } from '@co-vibe/protocol';
import { TokenManager } from '../auth/tokenManager.js';
import { assertWorkspacePath } from '@co-vibe/security';
import {
  AgentOrchestrator,
  AgentStateMachine,
  ToolRegistry,
  readFileTool,
  writeFileTool,
  listDirTool,
  runCommandTool,
  runTestsTool,
  createAIProvider,
} from '@co-vibe/agent';
import { ContextRetriever } from '@co-vibe/context';

const activeProcesses = new Map<string, ChildProcess>();

export interface PendingChangeSet {
  id: string;
  filePath: string;
  originalContent: string;
  modifiedContent: string;
  workspaceRoot: string;
  createdAt: number;
}

export const pendingChangeSets = new Map<string, PendingChangeSet>();

function loadEnvConfig() {
  const envPaths = [
    path.resolve(process.cwd(), 'apps/runtime/.env'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../.env'),
    path.resolve(process.cwd(), '../../.env'),
  ];
  for (const envPath of envPaths) {
    if (syncFs.existsSync(envPath)) {
      if (typeof process.loadEnvFile === 'function') {
        try {
          process.loadEnvFile(envPath);
        } catch {
          // Ignore
        }
      }
      try {
        const content = syncFs.readFileSync(envPath, 'utf8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const idx = trimmed.indexOf('=');
          if (idx > 0) {
            const key = trimmed.slice(0, idx).trim();
            const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
            if (!process.env[key] || process.env[key] === '') {
              process.env[key] = val;
            }
          }
        }
      } catch {
        // Ignore read error
      }
    }
  }
}

function getWorkspaceRoot(req?: http.IncomingMessage) {
  const currentRoot = process.env.BASE_WORKSPACE_ROOT || process.env.WORKSPACE_ROOT || process.cwd();
  if (req) {
    const workspaceId = req.headers['x-workspace-id'];
    if (workspaceId && typeof workspaceId === 'string' && workspaceId.trim()) {
      const cleanWsId = workspaceId.trim();
      const wsSegment = path.join('.workspaces', cleanWsId);
      if (currentRoot.includes(wsSegment)) {
        return currentRoot;
      }
      const workspacesIdx = currentRoot.indexOf('.workspaces');
      const baseDir = workspacesIdx !== -1 ? currentRoot.slice(0, workspacesIdx).replace(/[\\/]+$/, '') : currentRoot;
      return path.join(baseDir, '.workspaces', cleanWsId);
    }
  }
  return currentRoot;
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

    if (pathname === '/api/v1/agent/info' && method === 'GET') {
      loadEnvConfig();
      const hasGemini = Boolean(process.env.GEMINI_API_KEY);
      const provider = hasGemini ? 'Gemini' : 'Ollama';
      const model = hasGemini
        ? (process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite')
        : (process.env.OLLAMA_MODEL || 'qwen3.5:4b');
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, provider, model }));
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
        shell: isWin && actualCmd.endsWith('.cmd'),      // require shell for .cmd files on Windows to avoid EINVAL (CVE-2024-27980)
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

    // -------------------------------------------------------------------------
    // POST /api/v1/agent/run — Autonomous AI Agent Task Execution (NDJSON Stream)
    // -------------------------------------------------------------------------
    if ((pathname === '/api/v1/agent/run' || pathname === '/api/v1/agent/task') && method === 'POST') {
      const body = await parseJsonBody<{ prompt?: string }>(req);
      if (!body || typeof body.prompt !== 'string' || !body.prompt.trim()) {
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false, error: 'Missing required field: prompt' }));
        return;
      }

      const workspaceRoot = getWorkspaceRoot(req);
      await fs.mkdir(workspaceRoot, { recursive: true });

      // Stream progress events as NDJSON
      res.setHeader('Content-Type', 'application/x-ndjson');
      res.setHeader('Transfer-Encoding', 'chunked');
      res.writeHead(200);

      const taskId = crypto.randomUUID();
      const runId = crypto.randomUUID();

      const writeProgress = (payload: AgentTaskProgressPayload) => {
        try {
          res.write(JSON.stringify(payload) + '\n');
        } catch {
          // Client stream connection closed or write error
        }
      };

      try {
        // Collect existing workspace files for context retrieval
        const workspaceFiles = new Map<string, string>();
        const readFilesRecursively = async (dir: string, relative: string) => {
          try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
              if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.workspaces') continue;
              const fullPath = path.join(dir, entry.name);
              const relPath = relative ? `${relative}/${entry.name}` : entry.name;
              if (entry.isDirectory()) {
                await readFilesRecursively(fullPath, relPath);
              } else if (entry.isFile()) {
                try {
                  const content = await fs.readFile(fullPath, 'utf8');
                  workspaceFiles.set(relPath, content);
                } catch {
                  // Ignore unreadable binary or permission-restricted files
                }
              }
            }
          } catch {
            // Ignore unreadable directory
          }
        };

        await readFilesRecursively(workspaceRoot, '');

        // Initialize tool registry with filesystem & shell execution tools
        const stagingWriteFileTool = {
          ...writeFileTool,
          execute: async ({ path: targetPath, content }: { path: string; content: string }) => {
            const safePath = assertWorkspacePath(workspaceRoot, targetPath);
            let originalContent = '';
            try {
              originalContent = await fs.readFile(safePath, 'utf8');
            } catch {
              originalContent = '';
            }

            const changeSetId = crypto.randomUUID();
            pendingChangeSets.set(changeSetId, {
              id: changeSetId,
              filePath: targetPath,
              originalContent,
              modifiedContent: content,
              workspaceRoot,
              createdAt: Date.now(),
            });

            writeProgress({
              taskId,
              runId,
              state: 'AWAITING_APPROVAL',
              stepName: 'Diff Review',
              message: `Proposed modifications to ${targetPath}`,
              percentage: 70,
              diffData: {
                changeSetId,
                filePath: targetPath,
                originalContent,
                modifiedContent: content,
              },
            });

            return `File modification staged for ${targetPath}. Side-by-side diff awaiting human review before saving to disk.`;
          },
        };

        const toolRegistry = new ToolRegistry();
        toolRegistry.register(readFileTool);
        toolRegistry.register(stagingWriteFileTool);
        toolRegistry.register(listDirTool);
        toolRegistry.register(runCommandTool);
        toolRegistry.register(runTestsTool);

        // Configure workspace root for filesystem tools
        process.env.BASE_WORKSPACE_ROOT = process.env.BASE_WORKSPACE_ROOT || process.env.WORKSPACE_ROOT || process.cwd();
        process.env.WORKSPACE_ROOT = workspaceRoot;

        // Ensure .env is loaded
        loadEnvConfig();

        // Create configured AI provider (Gemini or Ollama)
        const provider = createAIProvider();

        const orchestrator = new AgentOrchestrator({
          provider,
          toolRegistry,
          stateMachine: new AgentStateMachine('created'),
          contextRetriever: new ContextRetriever(),
          taskId,
          runId,
          workspaceFiles,
          onProgress: writeProgress,
        });

        const result = await orchestrator.executeTask(body.prompt);

        writeProgress({
          taskId,
          runId,
          state: 'SUCCESS',
          stepName: 'Task Complete',
          message: result || 'Agent completed task successfully.',
          percentage: 100,
        });
      } catch (err: any) {
        writeProgress({
          taskId,
          runId,
          state: 'FAILED',
          stepName: 'Execution Error',
          message: err?.message || String(err),
          percentage: 100,
        });
      } finally {
        res.end();
      }
      return;
    }

    // -------------------------------------------------------------------------
    // ChangeSet Endpoints: Accept & Reject Human Review Gate
    // -------------------------------------------------------------------------
    if (pathname.startsWith('/api/v1/changesets/')) {
      if (pathname.endsWith('/accept') && method === 'POST') {
        const id = pathname.slice('/api/v1/changesets/'.length, -'/accept'.length);
        const pending = pendingChangeSets.get(id);
        if (pending) {
          const safePath = assertWorkspacePath(pending.workspaceRoot, pending.filePath);
          await fs.mkdir(path.dirname(safePath), { recursive: true });
          await fs.writeFile(safePath, pending.modifiedContent, 'utf8');
          pendingChangeSets.delete(id);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, success: true, status: 'accepted', filePath: pending.filePath }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, success: true, status: 'accepted' }));
        return;
      }

      if (pathname.endsWith('/reject') && method === 'POST') {
        const id = pathname.slice('/api/v1/changesets/'.length, -'/reject'.length);
        pendingChangeSets.delete(id);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, success: true, status: 'rejected' }));
        return;
      }

      if (method === 'GET') {
        const id = pathname.slice('/api/v1/changesets/'.length);
        const pending = pendingChangeSets.get(id);
        if (!pending) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'ChangeSet not found' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, changeset: pending }));
        return;
      }
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
          await fs.mkdir(safePath, { recursive: true });

          // Seed real starter files if newly initialized workspace directory
          const workspaceId = req.headers['x-workspace-id'];
          if (workspaceId && typeof workspaceId === 'string') {
            const workspaceRoot = getWorkspaceRoot(req);
            const initMarker = path.join(workspaceRoot, '.initialized');
            let isInitialized = false;
            try {
              await fs.access(initMarker);
              isInitialized = true;
            } catch {
              isInitialized = false;
            }

            if (!isInitialized) {
              try {
                const existing = await fs.readdir(workspaceRoot);
                if (existing.length === 0) {
                  await fs.writeFile(
                    path.join(workspaceRoot, 'README.md'),
                    '# Workspace\n\nWelcome to your collaborative workspace.\n',
                    'utf8'
                  );
                  await fs.writeFile(
                    path.join(workspaceRoot, 'package.json'),
                    JSON.stringify({ name: 'workspace', version: '1.0.0', type: 'module' }, null, 2),
                    'utf8'
                  );
                  await fs.mkdir(path.join(workspaceRoot, 'src'), { recursive: true });
                  await fs.writeFile(
                    path.join(workspaceRoot, 'src', 'index.js'),
                    "console.log('Hello from Co-Vibe!');\n",
                    'utf8'
                  );
                }
                await fs.writeFile(initMarker, new Date().toISOString(), 'utf8');
              } catch {
                // Ignore seeding errors in constrained environments
              }
            }
          }

          const buildTree = async (currentPath: string, relativePath: string): Promise<any[]> => {
            const items = await fs.readdir(currentPath, { withFileTypes: true });
            const result = [];
            for (const item of items) {
              if (item.name === 'node_modules' || item.name === '.git' || item.name === '.initialized') continue;
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
          await fs.mkdir(path.dirname(safePath), { recursive: true });
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
