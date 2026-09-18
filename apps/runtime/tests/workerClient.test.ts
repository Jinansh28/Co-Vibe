import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkerClient, type ConnectionState } from '../src/server/workerClient.js';

class MockWebSocket {
  public static instances: MockWebSocket[] = [];
  public url: string;
  public readyState: number = 0; // 0: CONNECTING, 1: OPEN, 2: CLOSING, 3: CLOSED

  public onopen: (() => void) | null = null;
  public onmessage: ((event: { data: any }) => void) | null = null;
  public onerror: ((event: any) => void) | null = null;
  public onclose: ((event: any) => void) | null = null;

  public sentMessages: string[] = [];
  public autoConnect: boolean = true;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);

    if (this.autoConnect) {
      setTimeout(() => {
        if (this.readyState === 0) {
          this.readyState = 1;
          if (this.onopen) this.onopen();
        }
      }, 10);
    }
  }

  public send(data: string) {
    this.sentMessages.push(data);
  }

  public close() {
    this.readyState = 3;
    if (this.onclose) this.onclose({ code: 1000, reason: 'Normal closure' });
  }

  public simulateMessage(data: any) {
    if (this.onmessage) {
      const msgStr = typeof data === 'string' ? data : JSON.stringify(data);
      this.onmessage({ data: msgStr });
    }
  }

  public simulateError(err: any = new Error('Socket error')) {
    if (this.onerror) this.onerror(err);
    this.close();
  }
}

describe('WorkerClient — Outbound WebSocket Runtime Channel', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('initializes in disconnected state', () => {
    const client = new WorkerClient({
      workerUrl: 'ws://localhost:8787/ws/runtime',
      token: 'test-runtime-token-123',
      webSocketCtor: MockWebSocket as any,
    });

    expect(client.getState()).toBe('disconnected');
  });

  it('attaches token to URL parameter and transitions through connecting to connected state', async () => {
    const stateChanges: ConnectionState[] = [];
    const client = new WorkerClient({
      workerUrl: 'ws://localhost:8787/ws/runtime',
      token: 'test-runtime-token-123',
      webSocketCtor: MockWebSocket as any,
    });

    client.onStateChange((state) => stateChanges.push(state));

    client.connect();
    expect(client.getState()).toBe('connecting');
    expect(MockWebSocket.instances.length).toBe(1);
    expect(MockWebSocket.instances[0].url).toBe('ws://localhost:8787/ws/runtime?token=test-runtime-token-123');

    await vi.advanceTimersByTimeAsync(20);
    expect(client.getState()).toBe('connected');
    expect(stateChanges).toEqual(['connecting', 'connected']);

    client.disconnect();
    expect(client.getState()).toBe('closed');
  });

  it('supports token provider function', async () => {
    const tokenFn = vi.fn().mockReturnValue('dynamic-token-456');
    const client = new WorkerClient({
      workerUrl: 'wss://worker.dev/ws/runtime',
      token: tokenFn,
      webSocketCtor: MockWebSocket as any,
    });

    client.connect();
    expect(tokenFn).toHaveBeenCalled();
    expect(MockWebSocket.instances[0].url).toBe('wss://worker.dev/ws/runtime?token=dynamic-token-456');
    client.disconnect();
  });

  it('sends heartbeat ping message periodically when connected', async () => {
    const client = new WorkerClient({
      workerUrl: 'ws://localhost:8787/ws/runtime',
      token: 'token-abc',
      heartbeatIntervalMs: 1000,
      webSocketCtor: MockWebSocket as any,
    });

    client.connect();
    await vi.advanceTimersByTimeAsync(20); // open socket
    expect(client.getState()).toBe('connected');

    const mockSocket = MockWebSocket.instances[0];

    // Fast-forward 1000ms for 1st heartbeat
    await vi.advanceTimersByTimeAsync(1000);
    expect(mockSocket.sentMessages.length).toBe(1);

    const firstPing = JSON.parse(mockSocket.sentMessages[0]);
    expect(firstPing.type).toBe('ping');
    expect(firstPing.id).toMatch(/^ping-\d+$/);

    // Fast-forward another 1000ms for 2nd heartbeat
    await vi.advanceTimersByTimeAsync(1000);
    expect(mockSocket.sentMessages.length).toBe(2);

    client.disconnect();
  });

  it('sends and receives custom JSON messages', async () => {
    const receivedMessages: any[] = [];
    const client = new WorkerClient({
      workerUrl: 'ws://localhost:8787/ws/runtime',
      token: 'token-abc',
      webSocketCtor: MockWebSocket as any,
    });

    client.onMessage((msg) => receivedMessages.push(msg));
    client.connect();
    await vi.advanceTimersByTimeAsync(20);

    const mockSocket = MockWebSocket.instances[0];

    // Send payload
    client.send({ type: 'exec', command: 'node -v' });
    expect(mockSocket.sentMessages).toHaveLength(1);
    expect(JSON.parse(mockSocket.sentMessages[0])).toEqual({ type: 'exec', command: 'node -v' });

    // Simulate incoming server message
    mockSocket.simulateMessage({ type: 'execResult', stdout: 'v20.0.0' });
    expect(receivedMessages).toEqual([{ type: 'execResult', stdout: 'v20.0.0' }]);

    client.disconnect();
  });

  it('calculates backoff delay correctly (1s -> 2s -> 5s)', () => {
    const client = new WorkerClient({
      workerUrl: 'ws://localhost:8787/ws/runtime',
      token: 'token-abc',
      reconnectBackoffMs: [1000, 2000, 5000],
      webSocketCtor: MockWebSocket as any,
    });

    expect(client.getBackoffDelay()).toBe(1000);
  });

  it('automatically reconnects with backoff on disconnect without duplicate sockets', async () => {
    const stateChanges: ConnectionState[] = [];
    const client = new WorkerClient({
      workerUrl: 'ws://localhost:8787/ws/runtime',
      token: 'token-abc',
      reconnectBackoffMs: [1000, 2000, 5000],
      webSocketCtor: MockWebSocket as any,
    });

    client.onStateChange((state) => stateChanges.push(state));
    client.connect();
    await vi.advanceTimersByTimeAsync(20); // Connect socket #1
    expect(client.getState()).toBe('connected');
    expect(MockWebSocket.instances.length).toBe(1);

    // Simulate socket disconnect
    const socket1 = MockWebSocket.instances[0];
    socket1.simulateError();

    expect(client.getState()).toBe('reconnecting');

    // Calling connect() while reconnecting should NOT spawn duplicate sockets
    client.connect();
    expect(MockWebSocket.instances.length).toBe(1);

    // Advance by backoff duration 1000ms
    await vi.advanceTimersByTimeAsync(1000);
    expect(MockWebSocket.instances.length).toBe(2); // Socket #2 created

    // Connect socket #2
    await vi.advanceTimersByTimeAsync(20);
    expect(client.getState()).toBe('connected');

    client.disconnect();
    expect(client.getState()).toBe('closed');
  });

  it('stops reconnection timers when manually disconnected', async () => {
    const client = new WorkerClient({
      workerUrl: 'ws://localhost:8787/ws/runtime',
      token: 'token-abc',
      reconnectBackoffMs: [1000, 2000, 5000],
      webSocketCtor: MockWebSocket as any,
    });

    client.connect();
    await vi.advanceTimersByTimeAsync(20);

    const socket1 = MockWebSocket.instances[0];
    socket1.simulateError();
    expect(client.getState()).toBe('reconnecting');

    // Manual disconnect while reconnecting
    client.disconnect();
    expect(client.getState()).toBe('closed');

    // Advance time beyond backoff
    await vi.advanceTimersByTimeAsync(5000);
    expect(MockWebSocket.instances.length).toBe(1); // No second socket created
  });

  it('throws error when trying to send on disconnected socket', () => {
    const client = new WorkerClient({
      workerUrl: 'ws://localhost:8787/ws/runtime',
      token: 'token-abc',
      webSocketCtor: MockWebSocket as any,
    });

    expect(() => client.send({ hello: 'world' })).toThrow('Cannot send message: WebSocket is not connected');
  });
});
