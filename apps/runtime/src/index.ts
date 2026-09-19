import type { Server } from 'node:http';
import { TokenManager } from './auth/tokenManager.js';
import { createPairingServer } from './server/pairingServer.js';

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

export function createRuntimeServer(tokenManager?: TokenManager): Server {
  const manager = tokenManager || new TokenManager();
  return createPairingServer(manager);
}

if (process.env.NODE_ENV !== 'test') {
  const tokenManager = new TokenManager();
  const server = createPairingServer(tokenManager);

  server.listen(PORT, '127.0.0.1', () => {
    const pairingInfo = tokenManager.getPairingCode();
    console.log(`[Runtime Daemon] Listening on http://127.0.0.1:${PORT}`);
    console.log(`[Runtime Daemon] Runtime ID: ${tokenManager.getRuntimeId()}`);
    console.log(`[Runtime Daemon] Pairing Code: ${pairingInfo.code}`);
  });
}
