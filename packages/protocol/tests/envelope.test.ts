import { describe, it, expect } from 'vitest';
import { WsEnvelopeSchema, HealthCheckResponseSchema } from '../src/index.js';

describe('Protocol Package Zod Schemas', () => {
  it('should validate a valid WsEnvelope object', () => {
    const validEnvelope = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      type: 'ping',
      version: 1,
      workspaceId: '123e4567-e89b-12d3-a456-426614174001',
      clientId: 'client_1',
      timestamp: Date.now(),
      payload: { message: 'hello' },
    };

    const parsed = WsEnvelopeSchema.parse(validEnvelope);
    expect(parsed.type).toBe('ping');
    expect(parsed.version).toBe(1);
  });

  it('should reject malformed envelope missing required workspaceId', () => {
    const invalidEnvelope = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      type: 'ping',
      version: 1,
      clientId: 'client_1',
      timestamp: Date.now(),
      payload: {},
    };

    expect(() => WsEnvelopeSchema.parse(invalidEnvelope)).toThrow();
  });

  it('should validate a valid HealthCheckResponse object', () => {
    const health = {
      service: 'api-worker',
      status: 'ok',
      timestamp: Date.now(),
      version: '0.1.0',
    };

    const parsed = HealthCheckResponseSchema.parse(health);
    expect(parsed.service).toBe('api-worker');
    expect(parsed.status).toBe('ok');
  });
});
