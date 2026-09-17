import { describe, it, expect } from 'vitest';
import {
  WsEnvelopeSchema,
  PresenceUpdatedPayloadSchema,
  FileUpdatedPayloadSchema,
  TerminalOutputPayloadSchema,
  AgentTaskProgressPayloadSchema,
  PreviewUpdatedPayloadSchema,
  HealthCheckResponseSchema,
} from '../src/index.js';

describe('Protocol Envelope Schemas', () => {
  it('validates a correct WsEnvelope object', () => {
    const validEnvelope = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      type: 'cursor.updated',
      version: 1,
      workspaceId: '123e4567-e89b-12d3-a456-426614174001',
      clientId: 'cli_dev1',
      timestamp: 1750000000000,
      sequence: 42,
      payload: { path: 'src/App.tsx', line: 10, column: 5 },
    };

    const parsed = WsEnvelopeSchema.parse(validEnvelope);
    expect(parsed.type).toBe('cursor.updated');
    expect(parsed.version).toBe(1);
    expect(parsed.sequence).toBe(42);
  });

  it('fails when workspaceId is missing or invalid UUID', () => {
    const invalidEnvelope = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      type: 'cursor.updated',
      version: 1,
      workspaceId: 'invalid-uuid-string',
      clientId: 'cli_dev1',
      timestamp: 1750000000000,
      payload: {},
    };

    expect(() => WsEnvelopeSchema.parse(invalidEnvelope)).toThrow();
  });

  it('fails when timestamp is missing or non-positive', () => {
    const invalidEnvelope = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      type: 'cursor.updated',
      version: 1,
      workspaceId: '123e4567-e89b-12d3-a456-426614174001',
      clientId: 'cli_dev1',
      timestamp: -100,
      payload: {},
    };

    expect(() => WsEnvelopeSchema.parse(invalidEnvelope)).toThrow();
  });

  it('validates PresenceUpdatedPayloadSchema', () => {
    const payload = {
      userId: '123e4567-e89b-12d3-a456-426614174000',
      displayName: 'Alice',
      status: 'online' as const,
      cursor: { path: 'src/index.ts', line: 12, column: 1 },
    };

    const parsed = PresenceUpdatedPayloadSchema.parse(payload);
    expect(parsed.displayName).toBe('Alice');
    expect(parsed.cursor?.line).toBe(12);
  });

  it('validates FileUpdatedPayloadSchema', () => {
    const payload = {
      path: 'src/main.ts',
      content: 'console.log("hello");',
      origin: 'monaco_local',
      updatedAt: Date.now(),
    };

    const parsed = FileUpdatedPayloadSchema.parse(payload);
    expect(parsed.path).toBe('src/main.ts');
  });

  it('validates TerminalOutputPayloadSchema', () => {
    const payload = {
      processId: 'proc_123',
      data: 'Build successful\n',
      stream: 'stdout' as const,
      timestamp: Date.now(),
    };

    const parsed = TerminalOutputPayloadSchema.parse(payload);
    expect(parsed.stream).toBe('stdout');
  });

  it('validates AgentTaskProgressPayloadSchema', () => {
    const payload = {
      taskId: '123e4567-e89b-12d3-a456-426614174000',
      runId: '123e4567-e89b-12d3-a456-426614174001',
      state: 'EXECUTING' as const,
      stepName: 'npm_test',
      message: 'Running vitest unit tests',
      percentage: 50,
    };

    const parsed = AgentTaskProgressPayloadSchema.parse(payload);
    expect(parsed.state).toBe('EXECUTING');
    expect(parsed.percentage).toBe(50);
  });

  it('validates HealthCheckResponseSchema', () => {
    const parsed = HealthCheckResponseSchema.parse({
      service: 'api-worker',
      status: 'ok',
      timestamp: Date.now(),
      version: '0.1.0',
    });

    expect(parsed.service).toBe('api-worker');
    expect(() =>
      HealthCheckResponseSchema.parse({
        service: '',
        status: 'ok',
        timestamp: Date.now(),
        version: '0.1.0',
      }),
    ).toThrow();
  });

  it('validates PreviewUpdatedPayloadSchema', () => {
    const payload = {
      port: 5173,
      url: 'http://localhost:5173',
      status: 'ready' as const,
    };

    const parsed = PreviewUpdatedPayloadSchema.parse(payload);
    expect(parsed.port).toBe(5173);
    expect(parsed.status).toBe('ready');
  });
});
