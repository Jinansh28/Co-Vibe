import type { Server } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { TokenManager } from './auth/tokenManager.js';
import { createPairingServer, applyChangeSetInWorkspace } from './server/pairingServer.js';
import { WorkerClient } from './server/workerClient.js';
import { registerRuntimeRpcHandlers } from './server/runtimeRpcHandlers.js';
import { DockerManager } from './docker/DockerManager.js';
import { ProcessManager } from './process/ProcessManager.js';

// Automatically load runtime .env if present
for (const envPath of [
  path.resolve(process.cwd(), 'apps/runtime/.env'),
  path.resolve(process.cwd(), '.env'),
]) {
  if (fs.existsSync(envPath) && typeof process.loadEnvFile === 'function') {
    try {
      process.loadEnvFile(envPath);
      break;
    } catch {
      // Ignore env parsing error
    }
  }
}

export const PORT = Number(process.env.RUNTIME_PORT || 7890);

export { TokenManager };
export { createPairingServer, createPairingRequestHandler, applyChangeSetInWorkspace } from './server/pairingServer.js';
export {
  WorkerClient,
  RpcHandlerError,
  type WorkerClientOptions,
  type ConnectionState,
  type RpcHandler,
} from './server/workerClient.js';
export {
  registerRuntimeRpcHandlers,
  defaultResolveWorkspaceRoot,
  type RuntimeRpcDependencies,
} from './server/runtimeRpcHandlers.js';
export {
  DockerManager,
  type CreateContainerOptions,
  type ExecOptions,
  type ExecResult,
} from './docker/DockerManager.js';
export {
  ProcessManager,
  type IProcessManager,
  type ManagedProcess,
  type ProcessExecOptions,
  type ProcessExecResult,
} from './process/ProcessManager.js';
export {
  StreamBuffer,
  type StreamBufferOptions,
} from './process/streamBuffer.js';
export {
  TestRunner,
  type TestResult,
  type FailedSpec,
} from './process/TestRunner.js';

export function createRuntimeServer(tokenManager?: TokenManager): Server {
  const manager = tokenManager || new TokenManager();
  return createPairingServer(manager);
}

if (process.env.NODE_ENV !== 'test') {
  if (!process.env.RUNTIME_JWT_SECRET && !process.env.SUPABASE_JWT_SECRET) {
    console.warn(
      '[Runtime Daemon] Security Warning: RUNTIME_JWT_SECRET/SUPABASE_JWT_SECRET not set; using development fallback secret.'
    );
  }
  const tokenManager = new TokenManager();
  const dockerManager = new DockerManager();
  const processManager = new ProcessManager(dockerManager);
  const server = createPairingServer(tokenManager, { dockerManager, processManager });

  if (process.env.WORKER_WS_URL && typeof globalThis.WebSocket !== 'undefined') {
    const workerClient = new WorkerClient({
      workerUrl: process.env.WORKER_WS_URL,
      token: () => tokenManager.getActiveToken() ?? tokenManager.generateRuntimeToken(process.env.WORKSPACE_ID).token,
    });
    registerRuntimeRpcHandlers(workerClient, { dockerManager, processManager });
    workerClient.connect();
  }

  server.listen(PORT, '127.0.0.1', () => {
    const pairingInfo = tokenManager.getPairingCode();
    console.log(`[Runtime Daemon] Listening on http://127.0.0.1:${PORT}`);
    console.log(`[Runtime Daemon] Runtime ID: ${tokenManager.getRuntimeId()}`);
    console.log(`[Runtime Daemon] Pairing Code: ${pairingInfo.code}`);
  });
}
