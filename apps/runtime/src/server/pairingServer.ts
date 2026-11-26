import http from 'node:http';
import fs from 'node:fs/promises';
import syncFs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { PairingVerifySchema, type AgentTaskProgressPayload } from '@co-vibe/protocol';
import { TokenManager, type JwtPayload } from '../auth/tokenManager.js';
import { DockerManager } from '../docker/DockerManager.js';
import { ProcessManager } from '../process/ProcessManager.js';
import { assertWorkspacePath, redactSecrets, validateCommandPolicy } from '@co-vibe/security';
import {
  AgentOrchestrator,
  AgentStateMachine,
  ToolRegistry,
  createFilesystemTools,
  createShellTools,
  createAIProvider,
  type ShellCommandExecutor,
} from '@co-vibe/agent';
import { ContextRetriever } from '@co-vibe/context';

const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

export function getAllowedOrigins(): string[] {
  const raw = process.env.RUNTIME_ALLOWED_ORIGINS || process.env.ALLOWED_ORIGINS;
  const configured = raw
    ? raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  return configured.length > 0 ? configured : [...DEFAULT_ALLOWED_ORIGINS];
}

export interface PairingServerDependencies {
  dockerManager?: DockerManager;
  processManager?: ProcessManager;
}

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

export class InvalidWorkspaceIdError extends Error {
  constructor(message = 'Invalid workspace identifier') {
    super(message);
    this.name = 'InvalidWorkspaceIdError';
  }
}

const SAFE_WORKSPACE_ID_REGEX = /^[a-zA-Z0-9._-]+$/;

function validateWorkspaceId(rawWorkspaceId: string): string {
  const cleanWsId = rawWorkspaceId.trim();
  if (
    !cleanWsId ||
    cleanWsId === '.' ||
    cleanWsId === '..' ||
    cleanWsId.includes('..') ||
    cleanWsId.includes('/') ||
    cleanWsId.includes('\\') ||
    cleanWsId.includes('\0') ||
    !SAFE_WORKSPACE_ID_REGEX.test(cleanWsId)
  ) {
    throw new InvalidWorkspaceIdError();
  }
  return cleanWsId;
}

function getWorkspaceRoot(req?: http.IncomingMessage) {
  const currentRoot = process.env.BASE_WORKSPACE_ROOT || process.env.WORKSPACE_ROOT || process.cwd();
  if (req) {
    const workspaceId = req.headers['x-workspace-id'];
    if (workspaceId !== undefined) {
      if (typeof workspaceId !== 'string') {
        throw new InvalidWorkspaceIdError();
      }
      if (workspaceId.trim()) {
        const cleanWsId = validateWorkspaceId(workspaceId);
        const wsSegment = path.join('.workspaces', cleanWsId);
        if (currentRoot.includes(wsSegment)) {
          return currentRoot;
        }
        const workspacesIdx = currentRoot.indexOf('.workspaces');
        const baseDir =
          workspacesIdx !== -1 ? currentRoot.slice(0, workspacesIdx).replace(/[\\/]+$/, '') : currentRoot;
        const workspacesRoot = path.join(baseDir, '.workspaces');
        return assertWorkspacePath(workspacesRoot, cleanWsId);
      }
    }
  }
  return currentRoot;
}

function getWorkspaceKey(req?: http.IncomingMessage): string {
  const raw = req?.headers['x-workspace-id'];
  if (typeof raw === 'string' && raw.trim()) {
    return validateWorkspaceId(raw);
  }
  return 'default';
}

function toContainerCwd(workspaceRoot: string, safeCwd: string): string {
  const rel = path.relative(workspaceRoot, safeCwd).replace(/\\/g, '/');
  if (!rel || rel === '.') {
    return '/workspace';
  }
  return path.posix.join('/workspace', rel);
}

export function setCorsHeaders(res: http.ServerResponse, req?: http.IncomingMessage): boolean {
  res.setHeader('Vary', 'Origin');

  const origin = req?.headers?.origin;
  if (!origin) {
    return true;
  }

  const allowedOrigins = getAllowedOrigins();
  if (!allowedOrigins.includes(origin)) {
    return false;
  }

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Workspace-Id');
  return true;
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

function isProtectedRoute(pathname: string): boolean {
  return (
    pathname === '/api/v1/files' ||
    pathname.startsWith('/api/v1/files/') ||
    pathname === '/api/v1/exec' ||
    pathname.startsWith('/api/v1/exec/') ||
    pathname === '/api/v1/agent/run' ||
    pathname === '/api/v1/agent/task' ||
    pathname.startsWith('/api/v1/changesets/')
  );
}

function extractBearerToken(req: http.IncomingMessage): string | null {
  const authHeader = req.headers.authorization;
  if (typeof authHeader !== 'string') {
    return null;
  }
  const match = authHeader.match(/^Bearer\s+(.+)$/);
  if (!match) {
    return null;
  }
  const token = match[1].trim();
  return token.length > 0 ? token : null;
}

export function createPairingRequestHandler(
  tokenManager: TokenManager,
  deps?: PairingServerDependencies
) {
  const dockerManager = deps?.dockerManager ?? new DockerManager();
  const processManager = deps?.processManager ?? new ProcessManager(dockerManager);

  return async (req: http.IncomingMessage, res: http.ServerResponse) => {
    const originAllowed = setCorsHeaders(res, req);
    res.setHeader('Content-Type', 'application/json');

    if (!originAllowed) {
      res.writeHead(403);
      res.end(JSON.stringify({ ok: false, error: 'Origin not allowed' }));
      return;
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
    const pathname = url.pathname;
    const method = req.method?.toUpperCase();

    // Enforce runtime bearer auth on protected routes
    let verifiedClaims: JwtPayload | null = null;
    if (isProtectedRoute(pathname)) {
      const token = extractBearerToken(req);
      if (!token) {
        res.writeHead(401);
        res.end(JSON.stringify({ ok: false, error: 'Missing or malformed Authorization Bearer token' }));
        return;
      }

      try {
        verifiedClaims = tokenManager.verifyRuntimeToken(token);
      } catch (err) {
        res.writeHead(401);
        res.end(
          JSON.stringify({
            ok: false,
            error: err instanceof Error ? err.message : 'Invalid or expired runtime token',
          })
        );
        return;
      }
    }

    // Reject path-traversal or malformed X-Workspace-Id headers up front
    if (req.headers['x-workspace-id'] !== undefined) {
      try {
        getWorkspaceRoot(req);
      } catch (err) {
        res.writeHead(403);
        res.end(
          JSON.stringify({
            ok: false,
            error: err instanceof Error ? err.message : 'Invalid workspace identifier',
          })
        );
        return;
      }

      if (verifiedClaims?.workspaceId) {
        const headerWsId = getWorkspaceKey(req);
        if (verifiedClaims.workspaceId !== headerWsId) {
          res.writeHead(403);
          res.end(
            JSON.stringify({
              ok: false,
              error: 'Workspace ID mismatch for runtime token',
            })
          );
          return;
        }
      }
    }

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
    // POST /api/v1/exec — Run a command inside workspace sandbox & stream NDJSON
    // -------------------------------------------------------------------------
    if (pathname === '/api/v1/exec' && method === 'POST') {
      const body = await parseJsonBody<any>(req);
      if (!body || typeof body.cmd !== 'string' || !body.cmd.trim()) {
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false, error: 'Missing required field: cmd' }));
        return;
      }

      const cmd: string = body.cmd;
      const args: string[] = Array.isArray(body.args) ? body.args.map(String) : [];
      const rawCwd: string = typeof body.cwd === 'string' ? body.cwd : '.';

      // Security: unify validation through @co-vibe/security command policy
      try {
        validateCommandPolicy([cmd, ...args]);
      } catch (err) {
        res.writeHead(403);
        res.end(
          JSON.stringify({
            ok: false,
            error: err instanceof Error ? err.message : 'POLICY_VIOLATION',
          })
        );
        return;
      }

      const workspaceRoot = getWorkspaceRoot(req);
      const workspaceKey = getWorkspaceKey(req);

      // Security: validate cwd is within workspace root
      let safeCwd: string;
      try {
        safeCwd = assertWorkspacePath(workspaceRoot, rawCwd);
      } catch {
        res.writeHead(403);
        res.end(JSON.stringify({ ok: false, error: 'Working directory outside workspace root' }));
        return;
      }

      let containerId: string;
      try {
        await fs.mkdir(workspaceRoot, { recursive: true });
        containerId = await dockerManager.ensureWorkspaceContainer(workspaceKey, workspaceRoot);
      } catch (err) {
        res.writeHead(503);
        res.end(
          JSON.stringify({
            ok: false,
            error: redactSecrets(
              err instanceof Error ? err.message : 'Sandbox container unavailable'
            ),
          })
        );
        return;
      }

      const executionId = crypto.randomUUID();
      const containerCwd = toContainerCwd(workspaceRoot, safeCwd);
      const earlyChunks: string[] = [];
      let streamStarted = false;

      const safeWrite = (payload: string) => {
        if (!res.writableEnded && !res.destroyed) {
          try {
            res.write(payload);
          } catch {
            // Ignore write errors on closed response streams
          }
        }
      };

      const safeEnd = () => {
        if (!res.writableEnded && !res.destroyed) {
          try {
            res.end();
          } catch {
            // Ignore end errors on closed response streams
          }
        }
      };

      const emitLine = (obj: Record<string, unknown>) => {
        const line = JSON.stringify(obj) + '\n';
        if (!streamStarted) {
          earlyChunks.push(line);
        } else {
          safeWrite(line);
        }
      };

      let proc;
      try {
        proc = await processManager.spawnProcess(containerId, [cmd, ...args], {
          processId: executionId,
          workspaceId: workspaceKey,
          cwd: containerCwd,
          timeoutMs: 60000,
          attachStdin: true,
          onStdout: (chunk) => emitLine({ stream: 'stdout', chunk }),
          onStderr: (chunk) => emitLine({ stream: 'stderr', chunk }),
        });
      } catch (err) {
        res.writeHead(500);
        res.end(
          JSON.stringify({
            ok: false,
            error: redactSecrets(
              err instanceof Error ? err.message : 'Failed to start sandboxed process'
            ),
          })
        );
        return;
      }

      // Stream output as NDJSON lines: {"stream":"stdout","chunk":"..."} per line
      res.setHeader('Content-Type', 'application/x-ndjson');
      res.setHeader('Transfer-Encoding', 'chunked');
      res.writeHead(200);
      streamStarted = true;

      safeWrite(
        JSON.stringify({
          stream: 'system',
          executionId,
          chunk: `[System] Process started. Execution ID: ${executionId}\n`,
        }) + '\n'
      );
      for (const bufferedLine of earlyChunks) {
        safeWrite(bufferedLine);
      }

      res.on('close', () => {
        if (!res.writableEnded && processManager.getProcess(executionId)) {
          processManager.killProcess(executionId, 'SIGKILL').catch(() => {});
        }
      });

      proc
        .wait()
        .then((result) => {
          safeWrite(JSON.stringify({ stream: 'exit', exitCode: result.exitCode }) + '\n');
          safeEnd();
        })
        .catch((err: unknown) => {
          const msg = redactSecrets(err instanceof Error ? err.message : String(err));
          const code = (err as { code?: string })?.code;
          const prefix = code === 'TIMEOUT' ? '[Timeout]' : code === 'KILLED' ? '[Killed]' : '[Error]';
          safeWrite(JSON.stringify({ stream: 'system', chunk: `${prefix} ${msg}\n` }) + '\n');
          safeWrite(JSON.stringify({ stream: 'exit', exitCode: -1 }) + '\n');
          safeEnd();
        });

      return;
    }

    // POST /api/v1/exec/:id/kill — Terminate running sandbox process
    if (pathname.startsWith('/api/v1/exec/') && pathname.endsWith('/kill') && method === 'POST') {
      const parts = pathname.split('/');
      const executionId = parts.length === 6 ? parts[4] : '';
      const proc = executionId ? processManager.getProcess(executionId) : undefined;
      if (proc) {
        await processManager.killProcess(executionId, 'SIGKILL');
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, message: 'Process terminated' }));
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ ok: false, error: 'Process not found or already exited' }));
      }
      return;
    }

    if (pathname.startsWith('/api/v1/exec/') && pathname.endsWith('/stdin') && method === 'POST') {
      const parts = pathname.split('/');
      const executionId = parts.length === 6 ? parts[4] : '';
      const body = await parseJsonBody<any>(req);
      const input = typeof body?.input === 'string' ? body.input : '';

      const written = executionId ? processManager.writeStdin(executionId, input) : false;
      if (!written) {
        res.writeHead(404);
        res.end(JSON.stringify({ ok: false, error: 'Process not found or stdin closed' }));
        return;
      }

      res.writeHead(200);
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    // -------------------------------------------------------------------------
    // POST /api/v1/agent/run — Autonomous AI Agent Task Execution (NDJSON Stream)
    // -------------------------------------------------------------------------
    if ((pathname === '/api/v1/agent/run' || pathname === '/api/v1/agent/task') && method === 'POST') {
      const body = await parseJsonBody<{
        prompt?: string;
        taskId?: string;
        runId?: string;
        image?: { mimeType?: string; base64?: string; data?: string };
        images?: Array<{ mimeType?: string; base64?: string; data?: string }>;
      }>(req);
      if (!body || typeof body.prompt !== 'string' || !body.prompt.trim()) {
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false, error: 'Missing required field: prompt' }));
        return;
      }

      const rawImage = body.image || (body.images && body.images[0]);
      let attachedImage: { mimeType: string; data: string } | undefined;
      if (rawImage) {
        const rawData = rawImage.data || rawImage.base64 || '';
        if (rawData) {
          attachedImage = {
            mimeType: rawImage.mimeType || 'image/png',
            data: rawData.replace(/^data:[^;]+;base64,/, ''),
          };
        }
      }

      const workspaceRoot = getWorkspaceRoot(req);
      await fs.mkdir(workspaceRoot, { recursive: true });

      // Stream progress events as NDJSON
      res.setHeader('Content-Type', 'application/x-ndjson');
      res.setHeader('Transfer-Encoding', 'chunked');
      res.writeHead(200);

      const taskId = body.taskId || crypto.randomUUID();
      const runId = body.runId || crypto.randomUUID();

      const writeProgress = (payload: AgentTaskProgressPayload) => {
        try {
          res.write(JSON.stringify(payload) + '\n');
        } catch {
          // Client stream connection closed or write error
        }
      };

      if (attachedImage) {
        writeProgress({
          taskId,
          runId,
          state: 'PLANNING',
          stepName: 'Visual Context',
          message: 'Visual snapshot attached to AI context',
          percentage: 15,
          image: {
            mimeType: attachedImage.mimeType,
            base64: attachedImage.data,
          },
        });
      }

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

        // Initialize tool registry with workspace-scoped filesystem & sandboxed shell execution tools
        const workspaceKey = getWorkspaceKey(req);
        const sandboxExecutor: ShellCommandExecutor = async (command, args, opts) => {
          const containerId = await dockerManager.ensureWorkspaceContainer(workspaceKey, workspaceRoot);
          const requestedCwd = opts?.cwd ? assertWorkspacePath(workspaceRoot, opts.cwd) : workspaceRoot;
          const containerCwd = toContainerCwd(workspaceRoot, requestedCwd);
          const execResult = await processManager.execCommand(containerId, [command, ...args], {
            workspaceId: workspaceKey,
            cwd: containerCwd,
            timeoutMs: opts?.timeoutMs ?? 60000,
          });
          return {
            stdout: execResult.stdout,
            stderr: execResult.stderr,
            exitCode: execResult.exitCode,
          };
        };

        const { readFileTool, writeFileTool, listDirTool } = createFilesystemTools(workspaceRoot);
        const { runCommandTool, runTestsTool } = createShellTools({
          workspaceRoot,
          executor: sandboxExecutor,
        });

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

        const result = await orchestrator.runTask(body.prompt, attachedImage);

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
          message: redactSecrets(err?.message || String(err)),
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

export function createPairingServer(
  tokenManager: TokenManager = new TokenManager(),
  deps?: PairingServerDependencies
): http.Server {
  const handler = createPairingRequestHandler(tokenManager, deps);
  return http.createServer(handler);
}
