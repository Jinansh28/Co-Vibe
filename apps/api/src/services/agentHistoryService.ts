import crypto from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Env } from '../middleware/auth.js';

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

let lastTimestamp = 0;
function getMonotonicIsoString(): string {
  let now = Date.now();
  if (now <= lastTimestamp) {
    now = lastTimestamp + 1;
  }
  lastTimestamp = now;
  return new Date(now).toISOString();
}

function isTableMissingError(err: any): boolean {
  if (!err) return false;
  return (
    err.code === 'PGRST205' ||
    (typeof err.message === 'string' &&
      (err.message.includes('PGRST205') || err.message.includes('Could not find the table')))
  );
}

export interface AgentTaskSummary {
  id: string;
  workspaceId: string;
  prompt: string;
  status: string;
  createdAt: string;
  runCount: number;
  hasDiff: boolean;
  changedFiles?: string[];
}

export interface AgentTaskDetails extends AgentTaskSummary {
  runs: any[];
  toolCalls: any[];
  conversations: Array<{ role: string; content: string; tool_calls?: any }>;
  changeSet?: {
    id: string;
    patch: string;
    changedFiles: string[];
    status: string;
    diffData?: any;
  } | null;
}

export interface IAgentHistoryService {
  reset(): void;
  getTaskWorkspaceId(taskId: string): Promise<string | null>;
  listWorkspaceTasks(workspaceId: string): Promise<AgentTaskSummary[]>;
  getTaskDetails(taskId: string): Promise<AgentTaskDetails | null>;
  createTask(workspaceId: string, prompt: string): Promise<{ taskId: string; runId: string }>;
  addConversation(taskId: string, role: string, content: string, toolCalls?: any): Promise<void>;
  recordProgressEvent(taskId: string, runId: string, event: any): Promise<void>;
  saveChangeSet(taskId: string, runId: string, patch: string, changedFiles: string[], id?: string): Promise<string>;
  updateTaskStatus(taskId: string, status: string, error?: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Supabase PostgreSQL Service
// ---------------------------------------------------------------------------

export class SupabaseAgentHistoryService implements IAgentHistoryService {
  private fallback: InMemoryAgentHistoryService = inMemoryAgentHistoryService;

  constructor(private client: SupabaseClient) {}

  public reset(): void {
    this.fallback.reset();
  }

  public async getTaskWorkspaceId(taskId: string): Promise<string | null> {
    const { data: task, error } = await this.client
      .from('agent_tasks')
      .select('workspace_id')
      .eq('id', taskId)
      .maybeSingle();

    if (isTableMissingError(error)) {
      return this.fallback.getTaskWorkspaceId(taskId);
    }
    if (error || !task) {
      return null;
    }
    return task.workspace_id ?? null;
  }

  public async listWorkspaceTasks(workspaceId: string): Promise<AgentTaskSummary[]> {
    const { data: tasks, error } = await this.client
      .from('agent_tasks')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });

    if (isTableMissingError(error)) {
      return this.fallback.listWorkspaceTasks(workspaceId);
    }
    if (error || !tasks || tasks.length === 0) return [];

    const taskIds = tasks.map((t: any) => t.id);
    const { data: runs } = await this.client.from('agent_runs').select('id, task_id').in('task_id', taskIds);
    const { data: changeSets } = await this.client
      .from('change_sets')
      .select('id, task_id, patch, changed_files')
      .in('task_id', taskIds);

    return tasks.map((t: any) => {
      const taskRuns = (runs || []).filter((r: any) => r.task_id === t.id);
      const taskChanges = (changeSets || []).filter((cs: any) => cs.task_id === t.id);
      const allFiles = taskChanges.flatMap((cs: any) => {
        if (Array.isArray(cs.changed_files)) return cs.changed_files;
        if (typeof cs.changed_files === 'string') {
          try { return JSON.parse(cs.changed_files); } catch { return []; }
        }
        return [];
      });

      return {
        id: t.id,
        workspaceId: t.workspace_id,
        prompt: t.prompt,
        status: t.status,
        createdAt: t.created_at,
        runCount: taskRuns.length,
        hasDiff: taskChanges.length > 0 && taskChanges.some((cs: any) => Boolean(cs.patch || cs.changed_files?.length)),
        changedFiles: allFiles.length > 0 ? Array.from(new Set(allFiles)) : undefined,
      };
    });
  }

  public async getTaskDetails(taskId: string): Promise<AgentTaskDetails | null> {
    const { data: task, error: tErr } = await this.client
      .from('agent_tasks')
      .select('*')
      .eq('id', taskId)
      .maybeSingle();

    if (isTableMissingError(tErr)) return this.fallback.getTaskDetails(taskId);
    if (tErr || !task) return null;

    const { data: runs } = await this.client.from('agent_runs').select('*').eq('task_id', taskId).order('started_at');
    const runIds = (runs || []).map((r: any) => r.id);
    const { data: toolCalls } = runIds.length
      ? await this.client.from('tool_calls').select('*').in('run_id', runIds).order('started_at')
      : { data: [] };
    const { data: convos } = await this.client.from('ai_conversations').select('*').eq('task_id', taskId).order('created_at');
    const { data: changeSets } = await this.client.from('change_sets').select('*').eq('task_id', taskId).order('created_at', { ascending: false });

    const latestCS = changeSets?.[0] || null;
    let parsedDiffData: any = undefined;
    if (latestCS?.patch) {
      try {
        parsedDiffData = JSON.parse(latestCS.patch);
      } catch {
        parsedDiffData = undefined;
      }
    }

    const allFiles = (changeSets || []).flatMap((cs: any) => {
      if (Array.isArray(cs.changed_files)) return cs.changed_files;
      if (typeof cs.changed_files === 'string') {
        try { return JSON.parse(cs.changed_files); } catch { return []; }
      }
      return [];
    });

    return {
      id: task.id,
      workspaceId: task.workspace_id,
      prompt: task.prompt,
      status: task.status,
      createdAt: task.created_at,
      runCount: (runs || []).length,
      hasDiff: Boolean(latestCS && (latestCS.patch || latestCS.changed_files?.length)),
      changedFiles: allFiles.length > 0 ? Array.from(new Set(allFiles)) : undefined,
      runs: (runs || []).map((r: any) => ({
        id: r.id,
        taskId: r.task_id,
        status: r.status,
        startedAt: r.started_at,
        completedAt: r.completed_at,
        errorMessage: r.error_message,
      })),
      toolCalls: (toolCalls || []).map((tc: any) => ({
        id: tc.id,
        runId: tc.run_id,
        toolName: tc.tool_name,
        arguments: tc.arguments,
        result: tc.result,
        error: tc.error,
        startedAt: tc.started_at,
        completedAt: tc.completed_at,
      })),
      conversations: (convos || []).map((c: any) => ({
        role: c.role,
        content: c.content,
        tool_calls: c.tool_calls,
      })),
      changeSet: latestCS
        ? {
            id: latestCS.id,
            patch: latestCS.patch,
            changedFiles: Array.isArray(latestCS.changed_files)
              ? latestCS.changed_files
              : (typeof latestCS.changed_files === 'string' ? JSON.parse(latestCS.changed_files) : []),
            status: latestCS.status,
            diffData: parsedDiffData,
          }
        : null,
    };
  }

  public async createTask(workspaceId: string, prompt: string): Promise<{ taskId: string; runId: string }> {
    const taskId = generateUUID();
    const runId = generateUUID();
    const now = new Date().toISOString();

    const { error: tErr } = await this.client.from('agent_tasks').insert({
      id: taskId,
      workspace_id: workspaceId,
      prompt,
      status: 'planning',
      created_at: now,
      updated_at: now,
    });

    if (isTableMissingError(tErr)) {
      return this.fallback.createTask(workspaceId, prompt);
    }
    if (tErr) throw new Error(`Failed to create task: ${tErr.message}`);

    await this.client.from('agent_runs').insert({
      id: runId,
      task_id: taskId,
      status: 'running',
      started_at: now,
      created_at: now,
      updated_at: now,
    });

    await this.addConversation(taskId, 'user', prompt);

    return { taskId, runId };
  }

  public async addConversation(taskId: string, role: string, content: string, toolCalls?: any): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await this.client.from('ai_conversations').insert({
      id: generateUUID(),
      task_id: taskId,
      role,
      content,
      tool_calls: toolCalls || null,
      created_at: now,
      updated_at: now,
    });
    if (isTableMissingError(error)) {
      await this.fallback.addConversation(taskId, role, content, toolCalls);
    }
  }

  public async recordProgressEvent(taskId: string, runId: string, event: any): Promise<void> {
    const now = new Date().toISOString();

    if (event.diffData) {
      await this.saveChangeSet(
        taskId,
        runId,
        typeof event.diffData === 'string' ? event.diffData : JSON.stringify(event.diffData),
        [event.diffData.filePath],
        event.diffData.changeSetId
      );
    }

    if (event.stepName === 'Execute Tool' || event.stepName === 'Tool Result') {
      const match = event.message?.match(/tool\s+([a-zA-Z0-9_-]+)/i);
      const { error } = await this.client.from('tool_calls').insert({
        id: generateUUID(),
        run_id: runId,
        tool_name: match ? match[1] : event.stepName,
        arguments: {},
        result: event.stepName === 'Tool Result' ? event.message : null,
        started_at: now,
        completed_at: event.stepName === 'Tool Result' ? now : null,
        created_at: now,
        updated_at: now,
      });
      if (isTableMissingError(error)) {
        await this.fallback.recordProgressEvent(taskId, runId, event);
      }
    }

    if (event.state === 'SUCCESS') {
      await this.updateTaskStatus(taskId, 'completed');
      await this.addConversation(taskId, 'assistant', event.message || 'Task completed successfully.');
    } else if (event.state === 'FAILED') {
      await this.updateTaskStatus(taskId, 'failed', event.message);
      await this.addConversation(taskId, 'assistant', event.message || 'Task failed.');
    } else if (event.state === 'AWAITING_APPROVAL') {
      await this.updateTaskStatus(taskId, 'awaiting_review');
    } else if (event.state === 'PLANNING') {
      await this.updateTaskStatus(taskId, 'planning');
    } else if (event.state === 'EXECUTING') {
      await this.updateTaskStatus(taskId, 'executing');
    }
  }

  public async saveChangeSet(
    taskId: string,
    runId: string,
    patch: string,
    changedFiles: string[],
    id?: string
  ): Promise<string> {
    const changeSetId = id || generateUUID();
    const now = new Date().toISOString();

    const { error } = await this.client.from('change_sets').insert({
      id: changeSetId,
      task_id: taskId,
      run_id: runId,
      base_revision: 'HEAD',
      status: 'pending',
      patch,
      changed_files: changedFiles,
      created_at: now,
      updated_at: now,
    });

    if (isTableMissingError(error)) {
      return this.fallback.saveChangeSet(taskId, runId, patch, changedFiles, changeSetId);
    }
    return changeSetId;
  }

  public async updateTaskStatus(taskId: string, status: string, error?: string): Promise<void> {
    const now = new Date().toISOString();
    const { error: tErr } = await this.client
      .from('agent_tasks')
      .update({ status, updated_at: now })
      .eq('id', taskId);

    if (isTableMissingError(tErr)) {
      return this.fallback.updateTaskStatus(taskId, status, error);
    }

    if (status === 'completed' || status === 'failed' || status === 'accepted' || status === 'rejected') {
      const runStatus = status === 'completed' || status === 'accepted' ? 'completed' : 'failed';
      await this.client
        .from('agent_runs')
        .update({ status: runStatus, completed_at: now, error_message: error ?? null, updated_at: now })
        .eq('task_id', taskId)
        .is('completed_at', null);
    }
  }
}

// ---------------------------------------------------------------------------
// In-Memory Fallback Service
// ---------------------------------------------------------------------------

export class InMemoryAgentHistoryService implements IAgentHistoryService {
  private tasks = new Map<string, any>();
  private runs = new Map<string, any>();
  private toolCalls = new Map<string, any>();
  private changeSets = new Map<string, any>();
  private conversations = new Map<string, any[]>();

  public reset(): void {
    this.tasks.clear();
    this.runs.clear();
    this.toolCalls.clear();
    this.changeSets.clear();
    this.conversations.clear();
  }

  public async getTaskWorkspaceId(taskId: string): Promise<string | null> {
    const task = this.tasks.get(taskId);
    return task ? task.workspaceId : null;
  }

  public async listWorkspaceTasks(workspaceId: string): Promise<AgentTaskSummary[]> {
    const list = Array.from(this.tasks.values())
      .filter((t) => t.workspaceId === workspaceId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return list.map((t) => {
      const runs = Array.from(this.runs.values()).filter((r) => r.taskId === t.id);
      const changes = Array.from(this.changeSets.values()).filter((cs) => cs.taskId === t.id);
      const changedFiles = Array.from(new Set(changes.flatMap((cs) => cs.changedFiles || [])));

      return {
        id: t.id,
        workspaceId: t.workspaceId,
        prompt: t.prompt,
        status: t.status,
        createdAt: t.createdAt,
        runCount: runs.length,
        hasDiff: changes.some((cs) => Boolean(cs.patch || cs.changedFiles?.length)),
        changedFiles: changedFiles.length ? changedFiles : undefined,
      };
    });
  }

  public async getTaskDetails(taskId: string): Promise<AgentTaskDetails | null> {
    const task = this.tasks.get(taskId);
    if (!task) return null;

    const runs = Array.from(this.runs.values())
      .filter((r) => r.taskId === taskId)
      .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());

    const runIds = new Set(runs.map((r) => r.id));
    const toolCalls = Array.from(this.toolCalls.values())
      .filter((tc) => runIds.has(tc.runId))
      .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());

    const convos = (this.conversations.get(taskId) || []).slice();
    const changes = Array.from(this.changeSets.values())
      .filter((cs) => cs.taskId === taskId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const latestCS = changes[0] || null;
    let parsedDiffData: any = undefined;
    if (latestCS?.patch) {
      try {
        parsedDiffData = JSON.parse(latestCS.patch);
      } catch {
        parsedDiffData = undefined;
      }
    }
    const allFiles = Array.from(new Set(changes.flatMap((cs) => cs.changedFiles || [])));

    return {
      id: task.id,
      workspaceId: task.workspaceId,
      prompt: task.prompt,
      status: task.status,
      createdAt: task.createdAt,
      runCount: runs.length,
      hasDiff: Boolean(latestCS && (latestCS.patch || latestCS.changedFiles?.length)),
      changedFiles: allFiles.length ? allFiles : undefined,
      runs,
      toolCalls,
      conversations: convos,
      changeSet: latestCS
        ? {
            id: latestCS.id,
            patch: latestCS.patch,
            changedFiles: latestCS.changedFiles,
            status: latestCS.status,
            diffData: parsedDiffData,
          }
        : null,
    };
  }

  public async createTask(workspaceId: string, prompt: string): Promise<{ taskId: string; runId: string }> {
    const taskId = generateUUID();
    const runId = generateUUID();
    const now = getMonotonicIsoString();

    this.tasks.set(taskId, { id: taskId, workspaceId, prompt, status: 'planning', createdAt: now, updatedAt: now });
    this.runs.set(runId, { id: runId, taskId, status: 'running', startedAt: now, createdAt: now, updatedAt: now });

    await this.addConversation(taskId, 'user', prompt);

    return { taskId, runId };
  }

  public async addConversation(taskId: string, role: string, content: string, toolCalls?: any): Promise<void> {
    const now = getMonotonicIsoString();
    const convList = this.conversations.get(taskId) || [];
    convList.push({
      id: generateUUID(),
      taskId,
      role,
      content,
      tool_calls: toolCalls,
      createdAt: now,
      updatedAt: now,
    });
    this.conversations.set(taskId, convList);
  }

  public async recordProgressEvent(taskId: string, runId: string, event: any): Promise<void> {
    const now = new Date().toISOString();

    if (event.diffData) {
      await this.saveChangeSet(
        taskId,
        runId,
        typeof event.diffData === 'string' ? event.diffData : JSON.stringify(event.diffData),
        [event.diffData.filePath],
        event.diffData.changeSetId
      );
    }

    if (event.stepName === 'Execute Tool' || event.stepName === 'Tool Result') {
      const match = event.message?.match(/tool\s+([a-zA-Z0-9_-]+)/i);
      this.toolCalls.set(generateUUID(), {
        id: generateUUID(),
        runId,
        toolName: match ? match[1] : event.stepName,
        arguments: {},
        result: event.stepName === 'Tool Result' ? event.message : undefined,
        startedAt: now,
        completedAt: event.stepName === 'Tool Result' ? now : undefined,
        createdAt: now,
        updatedAt: now,
      });
    }

    if (event.state === 'SUCCESS') {
      await this.updateTaskStatus(taskId, 'completed');
      await this.addConversation(taskId, 'assistant', event.message || 'Task completed successfully.');
    } else if (event.state === 'FAILED') {
      await this.updateTaskStatus(taskId, 'failed', event.message);
      await this.addConversation(taskId, 'assistant', event.message || 'Task failed.');
    } else if (event.state === 'AWAITING_APPROVAL') {
      await this.updateTaskStatus(taskId, 'awaiting_review');
    } else if (event.state === 'PLANNING') {
      await this.updateTaskStatus(taskId, 'planning');
    } else if (event.state === 'EXECUTING') {
      await this.updateTaskStatus(taskId, 'executing');
    }
  }

  public async saveChangeSet(
    taskId: string,
    runId: string,
    patch: string,
    changedFiles: string[],
    id?: string
  ): Promise<string> {
    const changeSetId = id || generateUUID();
    const now = new Date().toISOString();
    this.changeSets.set(changeSetId, {
      id: changeSetId,
      taskId,
      runId,
      baseRevision: 'HEAD',
      status: 'pending',
      patch,
      changedFiles,
      createdAt: now,
      updatedAt: now,
    });
    return changeSetId;
  }

  public async updateTaskStatus(taskId: string, status: string, error?: string): Promise<void> {
    const task = this.tasks.get(taskId);
    const now = new Date().toISOString();
    if (task) {
      task.status = status;
      task.updatedAt = now;
    }

    if (status === 'completed' || status === 'failed' || status === 'accepted' || status === 'rejected') {
      const runStatus = status === 'completed' || status === 'accepted' ? 'completed' : 'failed';
      for (const r of this.runs.values()) {
        if (r.taskId === taskId && !r.completedAt) {
          r.status = runStatus;
          r.completedAt = now;
          if (error) r.errorMessage = error;
          r.updatedAt = now;
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton & Factory resolution
// ---------------------------------------------------------------------------

export const inMemoryAgentHistoryService = new InMemoryAgentHistoryService();
export const agentHistoryService = inMemoryAgentHistoryService;

let cachedClient: SupabaseClient | null = null;
let cachedKey = '';

export function getAgentHistoryService(env?: Env['Bindings']): IAgentHistoryService {
  const supabaseUrl = env?.SUPABASE_URL || (typeof process !== 'undefined' ? process.env?.SUPABASE_URL : undefined);
  const serviceRoleKey = (env as any)?.SUPABASE_SERVICE_ROLE_KEY || (typeof process !== 'undefined' ? process.env?.SUPABASE_SERVICE_ROLE_KEY : undefined);

  if (supabaseUrl && serviceRoleKey) {
    const keyPair = `${supabaseUrl}::${serviceRoleKey}`;
    if (!cachedClient || cachedKey !== keyPair) {
      cachedClient = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      cachedKey = keyPair;
    }
    return new SupabaseAgentHistoryService(cachedClient);
  }

  return inMemoryAgentHistoryService;
}
