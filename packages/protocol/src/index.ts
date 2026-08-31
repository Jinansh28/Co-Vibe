import { z } from 'zod';

export * from './envelope.js';
export * from './runtime.js';

export const HealthCheckResponseSchema = z.object({
  service: z.string().min(1),
  status: z.enum(['ok', 'degraded', 'down']),
  timestamp: z.number().int().positive(),
  version: z.string().min(1),
});

export type HealthCheckResponse = z.infer<typeof HealthCheckResponseSchema>;
