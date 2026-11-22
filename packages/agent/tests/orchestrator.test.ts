import { describe, it, expect, vi } from 'vitest';
import { AgentOrchestrator } from '../src/orchestrator.js';
import { AIProvider } from '../src/model/interface.js';
import { ToolRegistry } from '../src/tools/registry.js';
import { AgentStateMachine } from '../src/state-machine.js';
import { ContextRetriever } from '@co-vibe/context';
import { z } from 'zod';

describe('AgentOrchestrator', () => {
  it('should execute end-to-end task loop streaming step updates', async () => {
    const mockProvider: AIProvider = {
      supportsToolCalling: true,
      generate: vi.fn().mockResolvedValue({
        message: { role: 'assistant', content: 'Mock response' },
        finishReason: 'stop'
      }),
      stream: vi.fn()
    };

    const toolRegistry = new ToolRegistry();
    toolRegistry.register({
      name: 'test_tool',
      description: 'A test tool',
      schema: z.object({ arg: z.string() }),
      timeoutMs: 1000,
      execute: async () => 'Tool result'
    });

    const stateMachine = new AgentStateMachine();
    const contextRetriever = new ContextRetriever();
    const onProgress = vi.fn();
    const workspaceFiles = new Map([['test.ts', 'const a = 1;']]);

    const orchestrator = new AgentOrchestrator({
      provider: mockProvider,
      toolRegistry,
      stateMachine,
      contextRetriever,
      onProgress,
      taskId: 'task-1',
      runId: 'run-1',
      workspaceFiles
    });

    const result = await orchestrator.executeTask('test prompt');
    
    expect(result).toBe('Mock response');
    expect(stateMachine.state).toBe('awaiting_review');
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      state: 'PLANNING',
      stepName: 'Gather Context'
    }));
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      state: 'SUCCESS',
      stepName: 'Task Completed'
    }));
  });

  it('should inject attached visual snapshot image into initial user message', async () => {
    let capturedMessages: any[] = [];
    const mockProvider: AIProvider = {
      supportsToolCalling: true,
      generate: vi.fn().mockImplementation(async (options) => {
        capturedMessages = options.messages;
        return {
          message: { role: 'assistant', content: 'Inspected visual layout' },
          finishReason: 'stop',
        };
      }),
      stream: vi.fn(),
    };

    const toolRegistry = new ToolRegistry();
    const stateMachine = new AgentStateMachine();
    const contextRetriever = new ContextRetriever();
    const workspaceFiles = new Map([['index.html', '<h1>Navbar</h1>']]);

    const orchestrator = new AgentOrchestrator({
      provider: mockProvider,
      toolRegistry,
      stateMachine,
      contextRetriever,
      taskId: 'task-vision-1',
      runId: 'run-vision-1',
      workspaceFiles,
    });

    const result = await orchestrator.runTask('Align navbar button', {
      mimeType: 'image/png',
      data: 'base64EncodedSnapshot==',
    });

    expect(result).toBe('Inspected visual layout');
    const userMsg = capturedMessages.find((m) => m.role === 'user');
    expect(userMsg).toBeDefined();
    expect(userMsg.images).toEqual([
      {
        mimeType: 'image/png',
        data: 'base64EncodedSnapshot==',
      },
    ]);
  });
});
