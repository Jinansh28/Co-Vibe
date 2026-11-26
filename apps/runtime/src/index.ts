import type { Server } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { TokenManager } from './auth/tokenManager.js';
import { createPairingServer } from './server/pairingServer.js';

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
export { createPairingServer, createPairingRequestHandler } from './server/pairingServer.js';
export { WorkerClient, type WorkerClientOptions, type ConnectionState } from './server/workerClient.js';
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
  const server = createPairingServer(tokenManager);

  server.listen(PORT, '127.0.0.1', () => {
    const pairingInfo = tokenManager.getPairingCode();
    console.log(`[Runtime Daemon] Listening on http://127.0.0.1:${PORT}`);
    console.log(`[Runtime Daemon] Runtime ID: ${tokenManager.getRuntimeId()}`);
    console.log(`[Runtime Daemon] Pairing Code: ${pairingInfo.code}`);
  });
}
