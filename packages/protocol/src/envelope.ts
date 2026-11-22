import { z } from 'zod';

export const WsEnvelopeSchema = z.object({
  id: z.string().uuid(),
  type: z.string().min(1),
  version: z.literal(1),
  workspaceId: z.string().uuid(),
  clientId: z.string().min(1),
  timestamp: z.number().int().positive(),
  sequence: z.number().int().nonnegative().optional(),
  payload: z.unknown(),
});

export type WsEnvelope<T = unknown> = z.infer<typeof WsEnvelopeSchema> & {
  payload: T;
};

// Event Payload Schemas
export const CursorPositionSchema = z.object({
  path: z.string().min(1),
  line: z.number().int().positive(),
  column: z.number().int().positive(),
});

export type CursorPosition = z.infer<typeof CursorPositionSchema>;

export const PresenceUpdatedPayloadSchema = z.object({
  userId: z.string().uuid(),
  displayName: z.string().min(1),
  avatarUrl: z.string().url().optional(),
  status: z.enum(['online', 'idle', 'offline']),
  cursor: CursorPositionSchema.optional(),
});

export type PresenceUpdatedPayload = z.infer<typeof PresenceUpdatedPayloadSchema>;

export const FileUpdatedPayloadSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
  origin: z.string(),
  updatedAt: z.number().int().positive(),
});

export type FileUpdatedPayload = z.infer<typeof FileUpdatedPayloadSchema>;

export const TerminalOutputPayloadSchema = z.object({
  processId: z.string().min(1),
  data: z.string(),
  stream: z.enum(['stdout', 'stderr']),
  timestamp: z.number().int().positive(),
});

export type TerminalOutputPayload = z.infer<typeof TerminalOutputPayloadSchema>;

export const ImageAttachmentSchema = z.object({
  mimeType: z.string().default('image/png'),
  base64: z.string(), // Raw base64 data without data:image/png;base64 prefix
});

export type ImageAttachment = z.infer<typeof ImageAttachmentSchema>;

export const AgentTaskRequestSchema = z.object({
  prompt: z.string().min(1),
  image: ImageAttachmentSchema.optional(),
  images: z.array(ImageAttachmentSchema).optional(),
});

export type AgentTaskRequest = z.infer<typeof AgentTaskRequestSchema>;

export const AgentTaskProgressPayloadSchema = z.object({
  taskId: z.string().uuid(),
  runId: z.string().uuid(),
  state: z.enum([
    'PENDING',
    'PLANNING',
    'AWAITING_APPROVAL',
    'EXECUTING',
    'REPAIRING',
    'SUCCESS',
    'FAILED',
    'CANCELLED',
  ]),
  stepName: z.string(),
  message: z.string(),
  percentage: z.number().min(0).max(100).optional(),
  image: ImageAttachmentSchema.optional(),
  diffData: z
    .object({
      changeSetId: z.string(),
      filePath: z.string(),
      originalContent: z.string(),
      modifiedContent: z.string(),
    })
    .optional(),
});

export type AgentTaskProgressPayload = z.infer<typeof AgentTaskProgressPayloadSchema>;

export const PreviewUpdatedPayloadSchema = z.object({
  port: z.number().int().positive(),
  url: z.string().url(),
  status: z.enum(['starting', 'ready', 'stopped', 'error']),
});

export type PreviewUpdatedPayload = z.infer<typeof PreviewUpdatedPayloadSchema>;
