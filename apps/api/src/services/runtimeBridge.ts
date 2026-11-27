import {
  RuntimeRpcRequestSchema,
  RuntimeRpcResponseSchema,
  type RuntimeRpcMethod,
} from '@co-vibe/protocol';

export interface RuntimeSocketLike {
  send(data: string): void;
  close?: (code?: number, reason?: string) => void;
  addEventListener?: (event: string, listener: (ev: any) => void) => void;
}

export class RuntimeOfflineError extends Error {
  public readonly status = 503;
  public readonly code = 'RUNTIME_OFFLINE';

  constructor(workspaceId: string) {
    super(`Runtime daemon offline for workspace ${workspaceId}`);
    this.name = 'RuntimeOfflineError';
  }
}

export class RuntimeTimeoutError extends Error {
  public readonly status = 504;
  public readonly code = 'RUNTIME_TIMEOUT';

  constructor(method: string, timeoutMs: number) {
    super(`Runtime RPC '${method}' timed out after ${timeoutMs}ms`);
    this.name = 'RuntimeTimeoutError';
  }
}

export class RuntimeRpcRemoteError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(code: string, message: string, status = 502) {
    super(message);
    this.name = 'RuntimeRpcRemoteError';
    this.code = code;
    this.status = status;
  }
}

interface ConnectionRecord {
  runtimeId: string;
  workspaceId?: string;
  socket: RuntimeSocketLike;
}

interface PendingRpc {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  timer: ReturnType<typeof setTimeout>;
  workspaceId: string;
  socket: RuntimeSocketLike;
}

class RuntimeBridge {
  private byWorkspace = new Map<string, ConnectionRecord>();
  private byRuntimeId = new Map<string, ConnectionRecord>();
  private pending = new Map<string, PendingRpc>();

  public registerConnection(record: ConnectionRecord): () => void {
    this.byRuntimeId.set(record.runtimeId, record);
    if (record.workspaceId) {
      this.byWorkspace.set(record.workspaceId, record);
    }

    let cleaned = false;
    return () => {
      if (cleaned) return;
      cleaned = true;

      const activeByRuntime = this.byRuntimeId.get(record.runtimeId);
      if (activeByRuntime?.socket === record.socket) {
        this.byRuntimeId.delete(record.runtimeId);
      }
      if (record.workspaceId) {
        const activeByWs = this.byWorkspace.get(record.workspaceId);
        if (activeByWs?.socket === record.socket) {
          this.byWorkspace.delete(record.workspaceId);
        }
      }

      for (const [reqId, entry] of this.pending.entries()) {
        if (entry.socket === record.socket) {
          clearTimeout(entry.timer);
          this.pending.delete(reqId);
          entry.reject(new RuntimeOfflineError(entry.workspaceId));
        }
      }
    };
  }

  public getConnection(workspaceId: string): ConnectionRecord | undefined {
    return this.byWorkspace.get(workspaceId);
  }

  public getConnectionByRuntimeId(runtimeId: string): ConnectionRecord | undefined {
    return this.byRuntimeId.get(runtimeId);
  }

  public hasConnection(workspaceId: string): boolean {
    return this.byWorkspace.has(workspaceId);
  }

  public handleIncomingMessage(raw: unknown): boolean {
    let msg: unknown = raw;
    if (typeof raw === 'string') {
      try {
        msg = JSON.parse(raw);
      } catch {
        return false;
      }
    }

    const parsed = RuntimeRpcResponseSchema.safeParse(msg);
    if (!parsed.success) {
      return false;
    }

    const pendingEntry = this.pending.get(parsed.data.requestId);
    if (!pendingEntry) {
      return true;
    }

    clearTimeout(pendingEntry.timer);
    this.pending.delete(parsed.data.requestId);

    if (parsed.data.ok) {
      pendingEntry.resolve(parsed.data.result);
    } else {
      const err = parsed.data.error;
      pendingEntry.reject(
        new RuntimeRpcRemoteError(
          err?.code || 'RUNTIME_RPC_ERROR',
          err?.message || 'Runtime RPC execution failed',
          err?.status ?? 502
        )
      );
    }
    return true;
  }

  public sendRpc<TResult = unknown>(
    workspaceId: string,
    method: RuntimeRpcMethod,
    params: Record<string, unknown> = {},
    timeoutMs = 15000
  ): Promise<TResult> {
    const conn = this.byWorkspace.get(workspaceId);
    if (!conn) {
      return Promise.reject(new RuntimeOfflineError(workspaceId));
    }

    const requestId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `rpc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const request = RuntimeRpcRequestSchema.parse({
      type: 'rpc.request',
      requestId,
      method,
      workspaceId,
      params,
    });

    return new Promise<TResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new RuntimeTimeoutError(method, timeoutMs));
      }, timeoutMs);

      this.pending.set(requestId, {
        resolve,
        reject,
        timer,
        workspaceId,
        socket: conn.socket,
      });

      try {
        conn.socket.send(JSON.stringify(request));
      } catch {
        clearTimeout(timer);
        this.pending.delete(requestId);
        this.byWorkspace.delete(workspaceId);
        reject(new RuntimeOfflineError(workspaceId));
      }
    });
  }

  public reset(): void {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new RuntimeOfflineError(entry.workspaceId));
    }
    this.pending.clear();
    this.byWorkspace.clear();
    this.byRuntimeId.clear();
  }
}

export const runtimeBridge = new RuntimeBridge();

export function sendRuntimeRpc<TResult = unknown>(
  workspaceId: string,
  method: RuntimeRpcMethod,
  params: Record<string, unknown> = {},
  timeoutMs = 15000
): Promise<TResult> {
  return runtimeBridge.sendRpc<TResult>(workspaceId, method, params, timeoutMs);
}
