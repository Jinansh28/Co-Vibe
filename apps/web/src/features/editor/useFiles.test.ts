// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFiles, flattenFileTree } from './useFiles.js';
import type { FileItem } from './FileTree.js';

describe('useFiles Hook', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes with an empty fileTree and does not hardcode React starter files', () => {
    const { result } = renderHook(() => useFiles('ws-test'));
    expect(result.current.fileTree).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('fetches real file tree from runtime and updates state', async () => {
    const mockFiles = [
      { id: 'README.md', name: 'README.md', type: 'file' as const },
      { id: 'index.js', name: 'index.js', type: 'file' as const },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, files: mockFiles }),
    } as any);

    const { result } = renderHook(() => useFiles('ws-test'));

    await act(async () => {
      await result.current.fetchTree();
    });

    expect(result.current.fileTree).toEqual(mockFiles);
  });

  it('optimistically removes deleted file and syncs with runtime', async () => {
    const mockFiles = [
      { id: 'README.md', name: 'README.md', type: 'file' as const },
      { id: 'index.js', name: 'index.js', type: 'file' as const },
    ];

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, files: mockFiles }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, files: [{ id: 'index.js', name: 'index.js', type: 'file' }] }),
      } as any);

    const { result } = renderHook(() => useFiles('ws-test'));

    await act(async () => {
      await result.current.fetchTree();
    });

    expect(result.current.fileTree.length).toBe(2);

    await act(async () => {
      await result.current.deleteFileOrFolder('README.md');
    });

    expect(result.current.fileTree).toEqual([
      { id: 'index.js', name: 'index.js', type: 'file' },
    ]);
  });

  describe('flattenFileTree helper', () => {
    it('returns empty array when given an empty item list', () => {
      expect(flattenFileTree([])).toEqual([]);
    });

    it('recursively extracts file paths and ignores folder nodes', () => {
      const tree: FileItem[] = [
        {
          id: 'src',
          name: 'src',
          type: 'folder',
          children: [
            {
              id: 'src/components',
              name: 'components',
              type: 'folder',
              children: [
                { id: 'src/components/Button.tsx', name: 'Button.tsx', type: 'file' },
              ],
            },
            { id: 'src/index.ts', name: 'index.ts', type: 'file' },
          ],
        },
        { id: 'README.md', name: 'README.md', type: 'file' },
      ];

      expect(flattenFileTree(tree)).toEqual([
        'src/components/Button.tsx',
        'src/index.ts',
        'README.md',
      ]);
    });
  });
});
