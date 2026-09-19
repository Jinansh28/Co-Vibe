import { randomUUID } from 'node:crypto';
import type { TerminalOutputPayload, WsEnvelope } from '@co-vibe/protocol';

export interface StreamBufferOptions {
  processId: string;
  stream: 'stdout' | 'stderr';
  workspaceId?: string;
  clientId?: string;
  /** Max bytes allowed in sliding window (default: 1 MiB = 1,048,576 bytes) */
  maxBytesPerMinute?: number;
  /** Sliding window duration in milliseconds (default: 60,000 ms) */
  windowDurationMs?: number;
  /** Callback for formatted protocol envelope */
  onEnvelope?: (envelope: WsEnvelope<TerminalOutputPayload>) => void;
  /** Callback for raw payload */
  onPayload?: (payload: TerminalOutputPayload) => void;
  /** Callback for raw string chunk */
  onChunk?: (chunk: string) => void;
}

export class StreamBuffer {
  private processId: string;
  private stream: 'stdout' | 'stderr';
  private workspaceId: string;
  private clientId: string;
  private maxBytesPerMinute: number;
  private windowDurationMs: number;

  private onEnvelope?: (envelope: WsEnvelope<TerminalOutputPayload>) => void;
  private onPayload?: (payload: TerminalOutputPayload) => void;
  private onChunk?: (chunk: string) => void;

  private windowRecords: Array<{ timestamp: number; bytes: number }> = [];
  private fullBuffer: string = '';
  private throttled: boolean = false;
  private totalBytesReceived: number = 0;

  constructor(options: StreamBufferOptions) {
    this.processId = options.processId;
    this.stream = options.stream;
    this.workspaceId = options.workspaceId || '00000000-0000-0000-0000-000000000000';
    this.clientId = options.clientId || 'daemon';
    this.maxBytesPerMinute = options.maxBytesPerMinute ?? 1024 * 1024; // 1 MiB
    this.windowDurationMs = options.windowDurationMs ?? 60000; // 1 minute
    this.onEnvelope = options.onEnvelope;
    this.onPayload = options.onPayload;
    this.onChunk = options.onChunk;
  }

  public write(chunk: Buffer | string): void {
    const text = typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
    const bytes = Buffer.byteLength(text, 'utf-8');
    const now = Date.now();

    this.totalBytesReceived += bytes;
    this.fullBuffer += text;

    // Prune sliding window
    this.pruneWindow(now);

    const currentWindowBytes = this.getWindowBytes();

    if (currentWindowBytes + bytes > this.maxBytesPerMinute) {
      if (!this.throttled) {
        this.throttled = true;
        const throttleNotice = `\n[Stream throttled: output exceeded ${this.maxBytesPerMinute} bytes/min limit]\n`;
        this.emitChunk(throttleNotice, now);
      }
      return;
    }

    this.throttled = false;
    this.windowRecords.push({ timestamp: now, bytes });
    this.emitChunk(text, now);
  }

  public flush(): void {
    // Passthrough buffer emits chunks immediately in current implementation
  }

  public end(): void {
    this.flush();
  }

  public getBufferedContent(): string {
    return this.fullBuffer;
  }

  public getTotalBytes(): number {
    return this.totalBytesReceived;
  }

  public isThrottled(): boolean {
    return this.throttled;
  }

  public reset(): void {
    this.windowRecords = [];
    this.fullBuffer = '';
    this.throttled = false;
    this.totalBytesReceived = 0;
  }

  private pruneWindow(now: number): void {
    const cutoff = now - this.windowDurationMs;
    while (this.windowRecords.length > 0 && this.windowRecords[0].timestamp < cutoff) {
      this.windowRecords.shift();
    }
  }

  private getWindowBytes(): number {
    return this.windowRecords.reduce((sum, rec) => sum + rec.bytes, 0);
  }

  private emitChunk(text: string, timestamp: number): void {
    if (this.onChunk) {
      this.onChunk(text);
    }

    const payload: TerminalOutputPayload = {
      processId: this.processId,
      data: text,
      stream: this.stream,
      timestamp,
    };

    if (this.onPayload) {
      this.onPayload(payload);
    }

    if (this.onEnvelope) {
      const envelope: WsEnvelope<TerminalOutputPayload> = {
        id: randomUUID(),
        type: 'terminal.output',
        version: 1,
        workspaceId: this.workspaceId,
        clientId: this.clientId,
        timestamp,
        payload,
      };
      this.onEnvelope(envelope);
    }
  }
}
