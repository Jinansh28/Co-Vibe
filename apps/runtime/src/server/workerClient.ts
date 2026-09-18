export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'closed';

export interface WorkerClientOptions {
  workerUrl: string;
  token: string | (() => string | null);
  heartbeatIntervalMs?: number;
  reconnectBackoffMs?: number[];
  webSocketCtor?: typeof WebSocket;
}

export type StateChangeListener = (state: ConnectionState) => void;
export type MessageListener = (data: unknown) => void;

export class WorkerClient {
  private workerUrl: string;
  private tokenProvider: string | (() => string | null);
  private heartbeatIntervalMs: number;
  private reconnectBackoffMs: number[];
  private WebSocketCtor: typeof WebSocket;

  private socket: WebSocket | null = null;
  private state: ConnectionState = 'disconnected';
  private reconnectAttempts: number = 0;

  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private stateListeners: Set<StateChangeListener> = new Set();
  private messageListeners: Set<MessageListener> = new Set();

  constructor(options: WorkerClientOptions) {
    this.workerUrl = options.workerUrl;
    this.tokenProvider = options.token;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 15000;
    this.reconnectBackoffMs = options.reconnectBackoffMs ?? [1000, 2000, 5000];
    this.WebSocketCtor = options.webSocketCtor || (globalThis as any).WebSocket;

    if (!this.WebSocketCtor) {
      throw new Error('WebSocket implementation is missing. Provide webSocketCtor in WorkerClientOptions.');
    }
  }

  public getState(): ConnectionState {
    return this.state;
  }

  public onStateChange(listener: StateChangeListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  public onMessage(listener: MessageListener): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  public getToken(): string | null {
    if (typeof this.tokenProvider === 'function') {
      return this.tokenProvider();
    }
    return this.tokenProvider;
  }

  public connect(): void {
    if (
      this.state === 'connected' ||
      this.state === 'connecting' ||
      (this.state === 'reconnecting' && this.reconnectTimer !== null)
    ) {
      return;
    }

    if (this.state === 'closed') {
      // Re-opening from closed state
      this.reconnectAttempts = 0;
    }

    const token = this.getToken();
    let targetUrl = this.workerUrl;

    if (token) {
      const urlObj = new URL(this.workerUrl);
      if (!urlObj.searchParams.has('token')) {
        urlObj.searchParams.set('token', token);
      }
      targetUrl = urlObj.toString();
    }

    const newState: ConnectionState = this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting';
    this.setState(newState);

    try {
      this.socket = new this.WebSocketCtor(targetUrl);
    } catch (err) {
      this.handleDisconnect();
      return;
    }

    this.socket.onopen = () => {
      this.reconnectAttempts = 0;
      this.setState('connected');
      this.startHeartbeat();
    };

    this.socket.onmessage = (event: MessageEvent) => {
      let data: unknown = event.data;
      if (typeof event.data === 'string') {
        try {
          data = JSON.parse(event.data);
        } catch (_e) {
          data = event.data;
        }
      }

      this.messageListeners.forEach((listener) => {
        try {
          listener(data);
        } catch (_err) {
          // Ignore listener execution errors
        }
      });
    };

    this.socket.onerror = () => {
      // socket.onclose will trigger reconnection logic
    };

    this.socket.onclose = () => {
      this.handleDisconnect();
    };
  }

  public send(payload: unknown): void {
    if (this.state !== 'connected' || !this.socket) {
      throw new Error('Cannot send message: WebSocket is not connected');
    }

    const messageStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
    this.socket.send(messageStr);
  }

  public disconnect(): void {
    this.setState('closed');
    this.stopHeartbeat();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      const sock = this.socket;
      this.socket = null;
      sock.onopen = null;
      sock.onmessage = null;
      sock.onerror = null;
      sock.onclose = null;
      try {
        sock.close();
      } catch (_e) {
        // Socket already closed or errored
      }
    }
  }

  public getBackoffDelay(): number {
    const idx = Math.min(this.reconnectAttempts, this.reconnectBackoffMs.length - 1);
    return this.reconnectBackoffMs[idx] ?? 5000;
  }

  private handleDisconnect(): void {
    this.stopHeartbeat();
    this.socket = null;

    if (this.state === 'closed') {
      return;
    }

    const delay = this.getBackoffDelay();
    this.reconnectAttempts++;
    this.setState('reconnecting');

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.state !== 'closed') {
        this.connect();
      }
    }, delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.state === 'connected' && this.socket) {
        try {
          this.send({
            id: `ping-${Date.now()}`,
            type: 'ping',
            timestamp: Date.now(),
          });
        } catch (_e) {
          // If sending fails, handleDisconnect will clean up
        }
      }
    }, this.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private setState(newState: ConnectionState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.stateListeners.forEach((listener) => {
        try {
          listener(newState);
        } catch (_err) {
          // Ignore listener execution errors
        }
      });
    }
  }
}
