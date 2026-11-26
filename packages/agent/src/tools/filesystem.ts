import { z } from 'zod';
import { ToolDefinition } from './registry.js';
import * as fs from 'fs/promises';
import { assertWorkspacePath } from '@co-vibe/security';

function getWorkspaceRoot() {
  return process.env.WORKSPACE_ROOT || process.cwd();
}

export function createFilesystemTools(workspaceRoot?: string) {
  const resolveRoot = () => workspaceRoot || getWorkspaceRoot();

  const readFile: ToolDefinition = {
    name: 'read_file',
    description: 'Reads the contents of a file.',
    schema: z.object({
      path: z.string().describe('The path to the file to read'),
    }),
    timeoutMs: 5000,
    execute: async ({ path }) => {
      const safePath = assertWorkspacePath(resolveRoot(), path);
      const content = await fs.readFile(safePath, 'utf8');
      return content;
    },
  };

  const writeFile: ToolDefinition = {
    name: 'write_file',
    description: 'Writes content to a file.',
    schema: z.object({
      path: z.string().describe('The path to the file to write'),
      content: z.string().describe('The content to write to the file'),
    }),
    timeoutMs: 10000,
    execute: async ({ path, content }) => {
      const safePath = assertWorkspacePath(resolveRoot(), path);
      await fs.writeFile(safePath, content, 'utf8');
      return `Successfully wrote to ${path}`;
    },
  };

  const listDir: ToolDefinition = {
    name: 'list_dir',
    description: 'Lists the contents of a directory.',
    schema: z.object({
      path: z.string().describe('The path to the directory to list'),
    }),
    timeoutMs: 5000,
    execute: async ({ path }) => {
      const safePath = assertWorkspacePath(resolveRoot(), path);
      const files = await fs.readdir(safePath);
      return files.join('\n');
    },
  };

  return { readFileTool: readFile, writeFileTool: writeFile, listDirTool: listDir };
}

const defaultTools = createFilesystemTools();
export const readFileTool = defaultTools.readFileTool;
export const writeFileTool = defaultTools.writeFileTool;
export const listDirTool = defaultTools.listDirTool;
