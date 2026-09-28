import { z } from 'zod';
import { ToolDefinition } from './registry.js';
import { validateCommandPolicy } from '@co-vibe/security';

import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export const runCommandTool: ToolDefinition = {
  name: 'run_command',
  description: 'Runs a command without a shell. command must be an allowed binary; args are passed as an array (no shell expansion).',
  schema: z.object({
    command: z.string().describe('The binary to execute (must be in the allowlist)'),
    args: z.array(z.string()).optional().describe('Arguments for the command'),
  }),
  timeoutMs: 60000,
  execute: async ({ command, args }) => {
    const cmdArray = [command, ...(args || [])];
    try {
      validateCommandPolicy(cmdArray);
    } catch (e: any) {
      return `Command failed: ${e.message}`;
    }
    try {
      // execFile does NOT spawn a shell, preventing shell injection via args
      const { stdout, stderr } = await execFileAsync(command, args || []);
      return [stdout, stderr].filter(Boolean).join('\n');
    } catch (error: any) {
      return `Command failed: ${error.message}\n${error.stdout || ''}\n${error.stderr || ''}`;
    }
  },
};

export const runTestsTool: ToolDefinition = {
  name: 'run_tests',
  description: 'Runs the test suite using an allowed test runner binary.',
  schema: z.object({
    testBinary: z.string().optional().describe('Test runner binary (default: "npm"). Must be in allowlist.'),
    testArgs: z.array(z.string()).optional().describe('Arguments for the test runner (default: ["test"]).'),
  }),
  timeoutMs: 60000,
  execute: async ({ testBinary, testArgs }) => {
    const binary = testBinary || 'npm';
    const binaryArgs = testArgs || ['test'];
    const cmdArray = [binary, ...binaryArgs];
    try {
      validateCommandPolicy(cmdArray);
    } catch (e: any) {
      return `Tests failed: ${e.message}`;
    }
    try {
      // execFile does NOT spawn a shell, preventing shell injection via args
      const { stdout, stderr } = await execFileAsync(binary, binaryArgs);
      return [stdout, stderr].filter(Boolean).join('\n');
    } catch (error: any) {
      return `Tests failed: ${error.message}\n${error.stdout || ''}\n${error.stderr || ''}`;
    }
  },
};
