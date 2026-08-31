import { z } from 'zod';

export const WsEnvelopeSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  version: z.literal(1),
  workspaceId: z.string().uuid(),
  clientId: z.string(),
  timestamp: z.number().int().positive(),
  sequence: z.number().int().nonnegative().optional(),
  payload: z.unknown(),
});

export type WsEnvelope<T = unknown> = z.infer<typeof WsEnvelopeSchema> & {
  payload: T;
};

export const HealthCheckResponseSchema = z.object({
  service: z.string(),
  status: z.enum(['ok', 'degraded', 'down']),
  timestamp: z.number(),
  version: z.string(),
});

export type HealthCheckResponse = z.infer<typeof HealthCheckResponseSchema>;
