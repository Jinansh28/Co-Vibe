import { useState, useCallback } from 'react';
import type { FileItem } from './FileTree.js';

const RUNTIME_URL = 'http://127.0.0.1:7890';

export const DEFAULT_STARTER_FILES: FileItem[] = [];

export function useFiles(workspaceId?: string | null) {
  const [fileTree, setFileTree] = useState<FileItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTree = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const headers: Record<string, string> = {};
      if (workspaceId) headers['X-Workspace-Id'] = workspaceId;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const res = await fetch(`${RUNTIME_URL}/api/v1/files`, { headers, signal: controller.signal });
      clearTimeout(timeoutId);
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to fetch files');
      setFileTree(Array.isArray(data.files) ? data.files : []);
    } catch (err: any) {
      setError(err.message);
      setFileTree((prev) => prev);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  const getFileContent = useCallback(async (path: string): Promise<string> => {
    const headers: Record<string, string> = {};
    if (workspaceId) headers['X-Workspace-Id'] = workspaceId;

    const res = await fetch(`${RUNTIME_URL}/api/v1/files/content?path=${encodeURIComponent(path)}`, { headers });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to read file');
    return data.content;
  }, [workspaceId]);

  const saveFileContent = useCallback(async (path: string, content: string): Promise<void> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (workspaceId) headers['X-Workspace-Id'] = workspaceId;

    const res = await fetch(`${RUNTIME_URL}/api/v1/files/content?path=${encodeURIComponent(path)}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ content }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to write file');
  }, [workspaceId]);

  const createFileOrFolder = useCallback(async (path: string, type: 'file' | 'folder'): Promise<void> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (workspaceId) headers['X-Workspace-Id'] = workspaceId;

    const res = await fetch(`${RUNTIME_URL}/api/v1/files?path=${encodeURIComponent(path)}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ type }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to create file/folder');
    await fetchTree(); // Refresh tree
  }, [fetchTree, workspaceId]);

  const deleteFileOrFolder = useCallback(async (path: string): Promise<void> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (workspaceId) headers['X-Workspace-Id'] = workspaceId;

    const res = await fetch(`${RUNTIME_URL}/api/v1/files?path=${encodeURIComponent(path)}`, {
      method: 'DELETE',
      headers,
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to delete file/folder');

    // Immediately update local state
    const filterOutPath = (items: FileItem[], target: string): FileItem[] => {
      return items
        .filter((item) => item.id !== target && !item.id.startsWith(target + '/'))
        .map((item) => ({
          ...item,
          children: item.children ? filterOutPath(item.children, target) : undefined,
        }));
    };
    setFileTree((prev) => filterOutPath(prev, path));

    await fetchTree(); // Refresh tree
  }, [fetchTree, workspaceId]);

  return {
    fileTree,
    isLoading,
    error,
    fetchTree,
    getFileContent,
    saveFileContent,
    createFileOrFolder,
    deleteFileOrFolder
  };
}

/**
 * Recursively flattens a hierarchical FileItem tree into an array of relative file paths.
 * Directories (type === 'folder') are omitted from the returned paths.
 */
export function flattenFileTree(items: FileItem[]): string[] {
  const result: string[] = [];

  function traverse(list: FileItem[]) {
    for (const item of list) {
      if (item.type === 'file') {
        result.push(item.id);
      }
      if (item.children && Array.isArray(item.children)) {
        traverse(item.children);
      }
    }
  }

  traverse(items);
  return result;
}
