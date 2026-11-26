import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { ToolRegistry, zodSchemaToJsonSchema } from '../src/tools/registry.js';
import { createFilesystemTools, readFileTool, writeFileTool } from '../src/tools/filesystem.js';
import { runCommandTool } from '../src/tools/shell.js';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
    registry.register(readFileTool);
    registry.register(writeFileTool);
    registry.register(runCommandTool);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should register and retrieve tools', () => {
    expect(registry.getTool('read_file')).toBeDefined();
    expect(registry.getTools().length).toBeGreaterThan(0);
  });

  it('should fail validation with invalid arguments', async () => {
    const result = await registry.executeTool('write_file', {
      path: 123, // Invalid type
      content: 'test',
    });
    expect(result).toContain('Error: Tool input validation failed');
  });

  it('should execute tool successfully', async () => {
    // Mock the execute function for testing purposes
    const mockTool = {
      ...readFileTool,
      execute: vi.fn().mockResolvedValue('file content'),
    };
    registry.register(mockTool);

    const result = await registry.executeTool('read_file', {
      path: 'test.txt',
    });
    
    expect(result).toBe('file content');
    expect(mockTool.execute).toHaveBeenCalledWith({ path: 'test.txt' });
  });

  it('should enforce execution timeouts', async () => {
    const slowTool = {
      ...readFileTool,
      timeoutMs: 100, // Very short timeout
      execute: () => new Promise<string>((resolve) => setTimeout(() => resolve('done'), 500)),
    };
    registry.register(slowTool);

    const executePromise = registry.executeTool('read_file', { path: 'test.txt' });
    
    // Fast-forward timers
    vi.advanceTimersByTime(200);
    
    const result = await executePromise;
    expect(result).toContain('Error: Tool execution exceeded timeout');
  });

  it('should handle tool not found', async () => {
    const result = await registry.executeTool('non_existent', {});
    expect(result).toContain('Error: Tool non_existent not found');
  });

  it('should resolve namespaced tool calls (e.g. default_api:read_file)', async () => {
    const mockTool = {
      ...readFileTool,
      execute: vi.fn().mockResolvedValue('namespaced content'),
    };
    registry.register(mockTool);

    const result = await registry.executeTool('default_api:read_file', {
      path: 'test.txt',
    });

    expect(result).toBe('namespaced content');
    expect(mockTool.execute).toHaveBeenCalledWith({ path: 'test.txt' });
  });

  it('converts Zod object schemas into non-empty JSON Schema parameter declarations', () => {
    const aiTools = registry.toAITools();
    const writeDecl = aiTools.find((t) => t.function.name === 'write_file');
    expect(writeDecl).toBeDefined();
    expect(writeDecl?.function.parameters).toMatchObject({
      type: 'object',
      required: ['path', 'content'],
      properties: {
        path: { type: 'string' },
        content: { type: 'string' },
      },
    });

    const cmdDecl = aiTools.find((t) => t.function.name === 'run_command');
    expect(cmdDecl?.function.parameters).toMatchObject({
      type: 'object',
      required: ['command'],
      properties: {
        command: { type: 'string' },
        args: { type: 'array', items: { type: 'string' } },
      },
    });
    expect(zodSchemaToJsonSchema(runCommandTool.schema)).toBeDefined();
  });

  it('blocks disallowed binaries and shell metacharacter commands via policy', async () => {
    const shResult = await registry.executeTool('run_command', {
      command: 'sh',
      args: ['-c', 'echo pwned'],
    });
    expect(shResult).toContain('POLICY_VIOLATION');

    const nodeResult = await registry.executeTool('run_command', {
      command: 'node',
      args: ['-e', 'console.log(process.argv[1])', 'safe; echo not-executed'],
    });
    expect(nodeResult.trim()).toBe('safe; echo not-executed');
  });

  it('scopes createFilesystemTools to explicit workspace root without mutating process.env', async () => {
    vi.useRealTimers();
    const prevEnv = process.env.WORKSPACE_ROOT;
    const tempWs = await fs.mkdtemp(path.join(os.tmpdir(), 'covibe-fs-tool-'));
    try {
      const scopedTools = createFilesystemTools(tempWs);
      const localReg = new ToolRegistry();
      localReg.register(scopedTools.writeFileTool);
      localReg.register(scopedTools.readFileTool);

      await localReg.executeTool('write_file', {
        path: 'hello.txt',
        content: 'isolated content',
      });
      const readBack = await localReg.executeTool('read_file', { path: 'hello.txt' });
      expect(readBack).toBe('isolated content');
      expect(process.env.WORKSPACE_ROOT).toBe(prevEnv);
    } finally {
      await fs.rm(tempWs, { recursive: true, force: true });
    }
  });
});
