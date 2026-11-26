import { useCallback } from 'react';
import { create } from 'zustand';
import type { FileItem } from './FileTree.js';
import { fetchRuntime } from '../../lib/runtimeConfig.js';

const EMPTY_TREE: FileItem[] = [];

export const DEFAULT_STARTER_FILES: FileItem[] = [];

interface FileTreeState {
  treesByWorkspace: Record<string, FileItem[]>;
  loadingByWorkspace: Record<string, boolean>;
  errorByWorkspace: Record<string, string | null>;
  setTree: (key: string, files: FileItem[] | ((prev: FileItem[]) => FileItem[])) => void;
  setLoading: (key: string, isLoading: boolean) => void;
  setError: (key: string, error: string | null) => void;
  reset: () => void;
}

export const useFileTreeStore = create<FileTreeState>((set) => ({
  treesByWorkspace: {},
  loadingByWorkspace: {},
  errorByWorkspace: {},
  setTree: (key, files) =>
    set((state) => {
      const prev = state.treesByWorkspace[key] ?? EMPTY_TREE;
      const next = typeof files === 'function' ? files(prev) : files;
      return {
        treesByWorkspace: {
          ...state.treesByWorkspace,
          [key]: next,
        },
      };
    }),
  setLoading: (key, isLoading) =>
    set((state) => ({
      loadingByWorkspace: {
        ...state.loadingByWorkspace,
        [key]: isLoading,
      },
    })),
  setError: (key, error) =>
    set((state) => ({
      errorByWorkspace: {
        ...state.errorByWorkspace,
        [key]: error,
      },
    })),
  reset: () =>
    set({
      treesByWorkspace: {},
      loadingByWorkspace: {},
      errorByWorkspace: {},
    }),
}));

export function useFiles(workspaceId?: string | null) {
  const workspaceKey = workspaceId || '__default__';
  const fileTree = useFileTreeStore((s) => s.treesByWorkspace[workspaceKey] ?? EMPTY_TREE);
  const isLoading = useFileTreeStore((s) => s.loadingByWorkspace[workspaceKey] ?? false);
  const error = useFileTreeStore((s) => s.errorByWorkspace[workspaceKey] ?? null);

  const fetchTree = useCallback(async () => {
    const store = useFileTreeStore.getState();
    store.setLoading(workspaceKey, true);
    store.setError(workspaceKey, null);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const res = await fetchRuntime(
        '/api/v1/files',
        { signal: controller.signal },
        workspaceId || undefined
      );
      clearTimeout(timeoutId);
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to fetch files');
      useFileTreeStore
        .getState()
        .setTree(workspaceKey, Array.isArray(data.files) ? data.files : []);
    } catch (err: any) {
      useFileTreeStore.getState().setError(workspaceKey, err.message);
    } finally {
      useFileTreeStore.getState().setLoading(workspaceKey, false);
    }
  }, [workspaceId, workspaceKey]);

  const getFileContent = useCallback(async (path: string): Promise<string> => {
    const res = await fetchRuntime(
      `/api/v1/files/content?path=${encodeURIComponent(path)}`,
      {},
      workspaceId || undefined
    );
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to read file');
    return data.content;
  }, [workspaceId]);

  const saveFileContent = useCallback(async (path: string, content: string): Promise<void> => {
    const res = await fetchRuntime(
      `/api/v1/files/content?path=${encodeURIComponent(path)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      },
      workspaceId || undefined
    );
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to write file');
  }, [workspaceId]);

  const createFileOrFolder = useCallback(async (path: string, type: 'file' | 'folder'): Promise<void> => {
    const res = await fetchRuntime(
      `/api/v1/files?path=${encodeURIComponent(path)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      },
      workspaceId || undefined
    );
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to create file/folder');
    await fetchTree(); // Refresh tree
  }, [fetchTree, workspaceId]);

  const deleteFileOrFolder = useCallback(async (path: string): Promise<void> => {
    const res = await fetchRuntime(
      `/api/v1/files?path=${encodeURIComponent(path)}`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      },
      workspaceId || undefined
    );
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
    useFileTreeStore.getState().setTree(workspaceKey, (prev) => filterOutPath(prev, path));

    await fetchTree(); // Refresh tree
  }, [fetchTree, workspaceId, workspaceKey]);

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
