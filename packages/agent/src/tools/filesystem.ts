import { z } from 'zod';
import { ToolDefinition } from './registry.js';
import * as fs from 'fs/promises';
import { assertWorkspacePath } from '@co-vibe/security';

function getWorkspaceRoot() {
  return process.env.WORKSPACE_ROOT || process.cwd();
}

export const readFileTool: ToolDefinition = {
  name: 'read_file',
  description: 'Reads the contents of a file.',
  schema: z.object({
    path: z.string().describe('The path to the file to read'),
  }),
  timeoutMs: 5000,
  execute: async ({ path }) => {
    const safePath = assertWorkspacePath(getWorkspaceRoot(), path);
    const content = await fs.readFile(safePath, 'utf8');
    return content;
  },
};

export const writeFileTool: ToolDefinition = {
  name: 'write_file',
  description: 'Writes content to a file.',
  schema: z.object({
    path: z.string().describe('The path to the file to write'),
    content: z.string().describe('The content to write to the file'),
  }),
  timeoutMs: 10000,
  execute: async ({ path, content }) => {
    const safePath = assertWorkspacePath(getWorkspaceRoot(), path);
    await fs.writeFile(safePath, content, 'utf8');
    return `Successfully wrote to ${path}`;
  },
};

export const listDirTool: ToolDefinition = {
  name: 'list_dir',
  description: 'Lists the contents of a directory.',
  schema: z.object({
    path: z.string().describe('The path to the directory to list'),
  }),
  timeoutMs: 5000,
  execute: async ({ path }) => {
    const safePath = assertWorkspacePath(getWorkspaceRoot(), path);
    const files = await fs.readdir(safePath);
    return files.join('\n');
  },
};
