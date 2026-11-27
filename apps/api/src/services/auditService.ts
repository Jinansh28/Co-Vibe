import crypto from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../middleware/auth.js';
import { isValidUuid } from './projectService.js';

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function isTableMissingError(err: any): boolean {
  if (!err) return false;
  return (
    err.code === 'PGRST205' ||
    (typeof err.message === 'string' &&
      (err.message.includes('PGRST205') || err.message.includes('Could not find the table')))
  );
}

export interface AuditLogEvent {
  id: string;
  projectId?: string;
  workspaceId?: string;
  userId?: string;
  eventType: string;
  targetType: string;
  targetId?: string;
  metadata: Record<string, any>;
  createdAt: string;
}

export interface IAuditService {
  reset(): void;
  logEvent(event: Omit<AuditLogEvent, 'id' | 'createdAt'>): Promise<AuditLogEvent>;
  getLogs(): AuditLogEvent[];
}

export class InMemoryAuditService implements IAuditService {
  private logs: AuditLogEvent[] = [];

  public async logEvent(
    event: Omit<AuditLogEvent, 'id' | 'createdAt'>
  ): Promise<AuditLogEvent> {
    const log: AuditLogEvent = {
      ...event,
      id: generateUUID(),
      createdAt: new Date().toISOString(),
    };
    this.logs.push(log);
    return log;
  }

  public getLogs(): AuditLogEvent[] {
    return this.logs;
  }

  public reset(): void {
    this.logs = [];
  }
}

export class SupabaseAuditService implements IAuditService {
  private fallback: InMemoryAuditService = inMemoryAuditService;

  constructor(private client: SupabaseClient) {}

  public reset(): void {
    this.fallback.reset();
  }

  public getLogs(): AuditLogEvent[] {
    return this.fallback.getLogs();
  }

  public async logEvent(
    event: Omit<AuditLogEvent, 'id' | 'createdAt'>
  ): Promise<AuditLogEvent> {
    const id = generateUUID();
    const createdAt = new Date().toISOString();

    let resolvedUserId: string | null = null;
    if (event.userId && isValidUuid(event.userId)) {
      const { data: userRow, error: userErr } = await this.client
        .from('users')
        .select('id')
        .eq('auth_user_id', event.userId)
        .maybeSingle();

      if (isTableMissingError(userErr)) {
        return this.fallback.logEvent(event);
      }
      if (userRow?.id) {
        resolvedUserId = userRow.id;
      }
    }

    const projectId =
      event.projectId && isValidUuid(event.projectId) ? event.projectId : null;
    const workspaceId =
      event.workspaceId && isValidUuid(event.workspaceId) ? event.workspaceId : null;

    const { error } = await this.client.from('audit_logs').insert({
      id,
      project_id: projectId,
      workspace_id: workspaceId,
      user_id: resolvedUserId,
      event_type: event.eventType,
      target_type: event.targetType,
      target_id: event.targetId ?? null,
      metadata: event.metadata ?? {},
      created_at: createdAt,
    });

    if (isTableMissingError(error)) {
      return this.fallback.logEvent(event);
    }

    if (error) {
      console.error('[audit] Failed to insert audit log into Postgres:', {
        code: error.code,
        message: error.message,
        eventType: event.eventType,
      });
      throw new Error(`Failed to persist audit event: ${error.message}`);
    }

    return {
      ...event,
      id,
      createdAt,
    };
  }
}

export const AuditService = InMemoryAuditService;
export const inMemoryAuditService = new InMemoryAuditService();
export const auditService = inMemoryAuditService;

let cachedClient: SupabaseClient | null = null;
let cachedKey = '';

export function getAuditService(env?: Env['Bindings']): IAuditService {
  const supabaseUrl =
    env?.SUPABASE_URL ||
    (typeof process !== 'undefined' ? process.env?.SUPABASE_URL : undefined);
  const serviceRoleKey =
    env?.SUPABASE_SERVICE_ROLE_KEY ||
    (typeof process !== 'undefined' ? process.env?.SUPABASE_SERVICE_ROLE_KEY : undefined);

  if (supabaseUrl && serviceRoleKey) {
    const keyPair = `${supabaseUrl}::${serviceRoleKey}`;
    if (!cachedClient || cachedKey !== keyPair) {
      cachedClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      cachedKey = keyPair;
    }
    return new SupabaseAuditService(cachedClient);
  }

  return inMemoryAuditService;
}
