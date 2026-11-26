import { z } from 'zod';
import { ToolDefinition } from './registry.js';
import { redactSecrets, validateCommandPolicy } from '@co-vibe/security';

export interface ShellExecOptions {
  cwd?: string;
  timeoutMs?: number;
}

export interface ShellExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type ShellCommandExecutor = (
  command: string,
  args: string[],
  opts?: ShellExecOptions
) => Promise<ShellExecResult>;

export interface CreateShellToolsOptions {
  workspaceRoot?: string;
  executor?: ShellCommandExecutor;
}

export function createShellTools(
  workspaceRootOrOptions?: string | CreateShellToolsOptions
) {
  const options: CreateShellToolsOptions =
    typeof workspaceRootOrOptions === 'string'
      ? { workspaceRoot: workspaceRootOrOptions }
      : workspaceRootOrOptions ?? {};

  const { workspaceRoot, executor } = options;

  const executeSandboxed = async (
    label: string,
    command: string,
    args: string[]
  ): Promise<string> => {
    const cmdArray = [command, ...args];
    try {
      validateCommandPolicy(cmdArray);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return `${label} failed: ${msg}`;
    }

    if (!executor) {
      return `${label} failed: SANDBOX_REQUIRED: No sandboxed command executor configured`;
    }

    try {
      const result = await executor(command, args, {
        cwd: workspaceRoot,
        timeoutMs: 60000,
      });
      const combined = redactSecrets(
        [result.stdout, result.stderr].filter(Boolean).join('\n')
      );
      if (result.exitCode !== 0) {
        return combined
          ? `${label} failed with exit code ${result.exitCode}\n${combined}`
          : `${label} failed with exit code ${result.exitCode}`;
      }
      return combined;
    } catch (error: unknown) {
      const msg = redactSecrets(error instanceof Error ? error.message : String(error));
      return `${label} failed: ${msg}`;
    }
  };

  const runCommand: ToolDefinition = {
    name: 'run_command',
    description:
      'Runs an allowlisted command inside the workspace sandbox without a shell. args are passed as an array.',
    schema: z.object({
      command: z.string().describe('The binary to execute (must be in the allowlist)'),
      args: z.array(z.string()).optional().describe('Arguments for the command'),
    }),
    timeoutMs: 60000,
    execute: async ({ command, args }) => {
      return executeSandboxed('Command', command, args || []);
    },
  };

  const runTests: ToolDefinition = {
    name: 'run_tests',
    description: 'Runs the test suite inside the workspace sandbox using an allowed test runner binary.',
    schema: z.object({
      testBinary: z.string().optional().describe('Test runner binary (default: "npm"). Must be in allowlist.'),
      testArgs: z.array(z.string()).optional().describe('Arguments for the test runner (default: ["test"]).'),
    }),
    timeoutMs: 60000,
    execute: async ({ testBinary, testArgs }) => {
      const binary = testBinary || 'npm';
      const binaryArgs = testArgs || ['test'];
      return executeSandboxed('Tests', binary, binaryArgs);
    },
  };

  return { runCommandTool: runCommand, runTestsTool: runTests };
}

const defaultShellTools = createShellTools();
export const runCommandTool = defaultShellTools.runCommandTool;
export const runTestsTool = defaultShellTools.runTestsTool;
