import { z } from 'zod';
import { ToolDefinition } from './registry.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const runCommandTool: ToolDefinition = {
  name: 'run_command',
  description: 'Runs a shell command.',
  schema: z.object({
    command: z.string().describe('The command to run'),
    args: z.array(z.string()).optional().describe('Arguments for the command'),
  }),
  timeoutMs: 60000,
  execute: async ({ command, args }) => {
    const fullCommand = args && args.length > 0 ? `${command} ${args.join(' ')}` : command;
    try {
        const { stdout, stderr } = await execAsync(fullCommand);
        return [stdout, stderr].filter(Boolean).join('\n');
    } catch (error: any) {
        return `Command failed: ${error.message}\n${error.stdout || ''}\n${error.stderr || ''}`;
    }
  },
};

export const runTestsTool: ToolDefinition = {
  name: 'run_tests',
  description: 'Runs the test suite.',
  schema: z.object({
    testCommand: z.string().optional().describe('Optional custom test command to run. Defaults to npm test.'),
  }),
  timeoutMs: 60000,
  execute: async ({ testCommand }) => {
    const cmd = testCommand || 'npm test';
    try {
        const { stdout, stderr } = await execAsync(cmd);
        return [stdout, stderr].filter(Boolean).join('\n');
    } catch (error: any) {
        return `Tests failed: ${error.message}\n${error.stdout || ''}\n${error.stderr || ''}`;
    }
  },
};
