import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runRepairLoop, RepairLoopOptions } from '../src/repair.js';
import { AgentStateMachine } from '../src/state-machine.js';
import { ContextRetriever } from '@co-vibe/context';
import { AIProvider } from '../src/model/interface.js';
import { ToolRegistry } from '../src/tools/registry.js';
import { TestResult } from '../src/validation.js';

describe('Repair Loop', () => {
  let stateMachine: AgentStateMachine;
  let contextRetriever: ContextRetriever;
  let provider: AIProvider;
  let toolRegistry: ToolRegistry;
  let workspaceFiles: Map<string, string>;
  
  beforeEach(() => {
    stateMachine = new AgentStateMachine('validating');
    contextRetriever = new ContextRetriever();
    provider = {
      generate: vi.fn()
    } as any;
    toolRegistry = new ToolRegistry();
    workspaceFiles = new Map();
  });

  it('should successfully repair tests on the first attempt', async () => {
    const validateTask = vi.fn()
      .mockResolvedValueOnce({ passed: true, failedSpecs: [] } as TestResult);
      
    provider.generate = vi.fn().mockResolvedValue({
      message: { role: 'assistant', content: 'Here is the fix.' },
      finishReason: 'stop'
    });

    const options: RepairLoopOptions = {
      stateMachine,
      contextRetriever,
      provider,
      toolRegistry,
      workspaceFiles,
      validateTask,
      maxAttempts: 3
    };

    const initialFailure: TestResult = {
      passed: false,
      failedSpecs: [{ name: 'Test 1', message: 'Expected true to be false' }]
    };

    const result = await runRepairLoop(options, initialFailure, []);
    
    expect(result).toBe('Here is the fix.');
    expect(stateMachine.state).toBe('validating');
    expect(validateTask).toHaveBeenCalledTimes(1);
  });

  it('should transition to needs_fix and then validating on each attempt', async () => {
    // Fails attempt 1, passes attempt 2
    const validateTask = vi.fn()
      .mockResolvedValueOnce({ passed: false, failedSpecs: [{ name: 'Test 1', message: 'Fail' }] } as TestResult)
      .mockResolvedValueOnce({ passed: true, failedSpecs: [] } as TestResult);
      
    provider.generate = vi.fn().mockResolvedValue({
      message: { role: 'assistant', content: 'Fix.' },
      finishReason: 'stop'
    });

    const options: RepairLoopOptions = {
      stateMachine,
      contextRetriever,
      provider,
      toolRegistry,
      workspaceFiles,
      validateTask,
      maxAttempts: 3
    };

    const initialFailure: TestResult = {
      passed: false,
      failedSpecs: [{ name: 'Test 1', message: 'Fail' }]
    };

    const result = await runRepairLoop(options, initialFailure, []);
    
    expect(result).toBe('Fix.');
    expect(stateMachine.state).toBe('validating');
    expect(validateTask).toHaveBeenCalledTimes(2);
    expect(provider.generate).toHaveBeenCalledTimes(2);
  });

  it('should throw an error and transition to failed if tests fail after max attempts', async () => {
    const validateTask = vi.fn()
      .mockResolvedValue({ passed: false, failedSpecs: [{ name: 'Test 1', message: 'Persistently fails' }] } as TestResult);
      
    provider.generate = vi.fn().mockResolvedValue({
      message: { role: 'assistant', content: 'Fix.' },
      finishReason: 'stop'
    });

    const options: RepairLoopOptions = {
      stateMachine,
      contextRetriever,
      provider,
      toolRegistry,
      workspaceFiles,
      validateTask,
      maxAttempts: 3
    };

    const initialFailure: TestResult = {
      passed: false,
      failedSpecs: [{ name: 'Test 1', message: 'Persistently fails' }]
    };

    await expect(runRepairLoop(options, initialFailure, [])).rejects.toThrow('Failed to repair tests after 3 attempts.');
    
    expect(stateMachine.state).toBe('failed');
    expect(validateTask).toHaveBeenCalledTimes(3);
    expect(provider.generate).toHaveBeenCalledTimes(3);
  });
});
