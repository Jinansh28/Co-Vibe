import crypto from 'node:crypto';

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

export class AuditService {
  private logs: AuditLogEvent[] = [];

  public logEvent(event: Omit<AuditLogEvent, 'id' | 'createdAt'>): AuditLogEvent {
    const log: AuditLogEvent = {
      ...event,
      id: generateUUID(),
      createdAt: new Date().toISOString()
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

export const auditService = new AuditService();
