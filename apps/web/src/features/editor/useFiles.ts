import { useState, useCallback } from 'react';
import type { FileItem } from './FileTree.js';

const RUNTIME_URL = 'http://127.0.0.1:7890';

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
      
      const res = await fetch(`${RUNTIME_URL}/api/v1/files`, { headers });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to fetch files');
      setFileTree(data.files || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getFileContent = useCallback(async (path: string): Promise<string> => {
    const headers: Record<string, string> = {};
    if (workspaceId) headers['X-Workspace-Id'] = workspaceId;

    const res = await fetch(`${RUNTIME_URL}/api/v1/files/content?path=${encodeURIComponent(path)}`, { headers });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to read file');
    return data.content;
  }, []);

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
  }, []);

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
  }, [fetchTree]);

  return {
    fileTree,
    isLoading,
    error,
    fetchTree,
    getFileContent,
    saveFileContent,
    createFileOrFolder
  };
}
