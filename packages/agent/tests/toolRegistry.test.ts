import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ToolRegistry } from '../src/tools/registry.js';
import { readFileTool, writeFileTool } from '../src/tools/filesystem.js';
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
});
