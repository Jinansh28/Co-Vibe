import { describe, it, expect } from 'vitest';
import {
  fuzzyFilterFiles,
  splitPath,
  isWordBoundary,
} from './fuzzySearch.js';

describe('fuzzySearch Utility', () => {
  describe('splitPath', () => {
    it('splits a root file correctly', () => {
      expect(splitPath('README.md')).toEqual({
        fileName: 'README.md',
        directory: '',
      });
    });

    it('splits nested paths correctly and preserves trailing slash in directory', () => {
      expect(splitPath('apps/web/src/components/layout/AppLayout.tsx')).toEqual({
        fileName: 'AppLayout.tsx',
        directory: 'apps/web/src/components/layout/',
      });
    });

    it('handles Windows-style backslashes by normalizing them', () => {
      expect(splitPath('apps\\web\\src\\index.ts')).toEqual({
        fileName: 'index.ts',
        directory: 'apps/web/src/',
      });
    });
  });

  describe('isWordBoundary', () => {
    const path = 'apps/web/src/components/layout/AppLayout.tsx';
    const fileNameOffset = path.lastIndexOf('/') + 1; // 31 ('AppLayout.tsx')

    it('identifies index 0 as boundary', () => {
      expect(isWordBoundary(path, 0, fileNameOffset)).toBe(true);
    });

    it('identifies start of filename as boundary', () => {
      expect(isWordBoundary(path, fileNameOffset, fileNameOffset)).toBe(true);
    });

    it('identifies characters immediately following a slash as boundary', () => {
      // 'w' in 'web' is index 5, preceded by '/'
      expect(isWordBoundary(path, 5, fileNameOffset)).toBe(true);
    });

    it('identifies CamelCase transition as boundary', () => {
      // 'L' in 'AppLayout' (index 34), preceded by 'p'
      expect(isWordBoundary(path, 34, fileNameOffset)).toBe(true);
    });

    it('returns false for regular internal characters', () => {
      // 'p' in 'App' (index 32)
      expect(isWordBoundary(path, 32, fileNameOffset)).toBe(false);
    });
  });

  describe('fuzzyFilterFiles', () => {
    const sampleFiles = [
      'apps/web/src/components/layout/AppLayout.tsx',
      'apps/web/src/components/layout/TopBar.tsx',
      'apps/web/src/components/layout/Sidebar.tsx',
      'apps/web/src/features/editor/useFiles.ts',
      'apps/web/src/features/editor/MonacoEditor.tsx',
      'packages/shared/src/index.ts',
      'README.md',
      'package.json',
    ];

    it('returns all files with open files prioritized when query is empty', () => {
      const openFiles = ['apps/web/src/components/layout/TopBar.tsx', 'README.md'];
      const results = fuzzyFilterFiles(sampleFiles, '', openFiles);

      expect(results.length).toBe(sampleFiles.length);
      // First two must be open files in order
      expect(results[0].path).toBe('apps/web/src/components/layout/TopBar.tsx');
      expect(results[1].path).toBe('README.md');
      // The rest must be sorted alphabetically
      const remaining = results.slice(2).map((r) => r.path);
      const sortedRemaining = [...remaining].sort((a, b) => a.localeCompare(b));
      expect(remaining).toEqual(sortedRemaining);
      // Empty query has no matched indices
      expect(results[0].matchedIndices).toEqual([]);
    });

    it('matches fuzzy acronyms across basename (e.g. applay -> AppLayout.tsx)', () => {
      const results = fuzzyFilterFiles(sampleFiles, 'applay');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].path).toBe('apps/web/src/components/layout/AppLayout.tsx');
      expect(results[0].fileName).toBe('AppLayout.tsx');

      // Matched indices should all be in AppLayout.tsx (after directory offset)
      const dirOffset = results[0].directory.length;
      expect(results[0].matchedIndices.every((idx) => idx >= dirOffset)).toBe(true);
    });

    it('matches path-based query across directory and filename (e.g. layout/top)', () => {
      const results = fuzzyFilterFiles(sampleFiles, 'layout/top');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].path).toBe('apps/web/src/components/layout/TopBar.tsx');
      expect(results[0].matchedIndices.length).toBe('layout/top'.length);
    });

    it('ranks exact basename matches higher than partial or deep path matches', () => {
      const files = [
        'apps/web/src/package.json.bak',
        'package.json',
        'sub/package.json',
      ];
      const results = fuzzyFilterFiles(files, 'package.json');
      expect(results[0].path).toBe('package.json');
    });

    it('ranks prefix match on filename higher than arbitrary middle character match', () => {
      const files = [
        'src/components/TopBar.tsx',
        'src/features/desktop.ts',
        'src/tools/stop.ts',
      ];
      const results = fuzzyFilterFiles(files, 'top');
      expect(results[0].path).toBe('src/components/TopBar.tsx');
    });

    it('returns empty array when no files match query', () => {
      const results = fuzzyFilterFiles(sampleFiles, 'nonexistentxyz123');
      expect(results).toEqual([]);
    });

    it('gives bonus score to open files when matching query', () => {
      const files = ['src/utils/helpers.ts', 'src/tools/helpers.ts'];
      const resultsWithoutOpen = fuzzyFilterFiles(files, 'helpers');
      expect(resultsWithoutOpen[0].path).toBe('src/tools/helpers.ts'); // alphabetical tie-break with equal length

      const resultsWithOpen = fuzzyFilterFiles(files, 'helpers', ['src/utils/helpers.ts']);
      expect(resultsWithOpen[0].path).toBe('src/utils/helpers.ts'); // open file bonus elevates it
    });

    it('is case insensitive', () => {
      const lowerResults = fuzzyFilterFiles(sampleFiles, 'topbar');
      const upperResults = fuzzyFilterFiles(sampleFiles, 'TOPBAR');
      expect(lowerResults[0].path).toBe('apps/web/src/components/layout/TopBar.tsx');
      expect(upperResults[0].path).toBe('apps/web/src/components/layout/TopBar.tsx');
      expect(lowerResults[0].matchedIndices).toEqual(upperResults[0].matchedIndices);
    });
  });
});
