import { describe, it, expect } from 'vitest';
import { parseDiff, extractPatchHunkIds, filterPatchByHunks, GitManager } from '../src/index.js';

const MULTI_HUNK_PATCH = [
  'diff --git a/src/math.ts b/src/math.ts',
  'index 1111111..2222222 100644',
  '--- a/src/math.ts',
  '+++ b/src/math.ts',
  '@@ -1,3 +1,3 @@',
  ' export function add(a: number, b: number) {',
  '-  return a - b;',
  '+  return a + b;',
  ' }',
  '@@ -10,3 +10,3 @@',
  ' export function mul(a: number, b: number) {',
  '-  return a + b;',
  '+  return a * b;',
  ' }',
  '',
].join('\n');

describe('diffParser & GitManager safety', () => {
  it('parses unified diff hunks and extracts deterministic hunk IDs', () => {
    const parsed = parseDiff(MULTI_HUNK_PATCH);
    expect(parsed.files).toHaveLength(1);
    expect(parsed.files[0].oldName).toBe('src/math.ts');
    expect(parsed.files[0].newName).toBe('src/math.ts');
    expect(parsed.files[0].hunks).toHaveLength(2);
    expect(parsed.files[0].hunks[0].header).toBe('@@ -1,3 +1,3 @@');
    expect(parsed.files[0].hunks[1].header).toBe('@@ -10,3 +10,3 @@');

    const ids = extractPatchHunkIds(MULTI_HUNK_PATCH);
    expect(ids).toEqual([
      'src/math.ts #1 @@ -1,3 +1,3 @@',
      'src/math.ts #2 @@ -10,3 +10,3 @@',
    ]);
  });

  it('filters unified diff patch to only selected hunks', () => {
    const ids = extractPatchHunkIds(MULTI_HUNK_PATCH);
    const filtered = filterPatchByHunks(MULTI_HUNK_PATCH, [ids[0]]);
    expect(filtered).toContain('return a + b;');
    expect(filtered).not.toContain('return a * b;');

    const empty = filterPatchByHunks(MULTI_HUNK_PATCH, []);
    expect(empty).toBe('');
  });

  it('rejects non-HTTPS or credential-embedded clone URLs and redacts tokens on error', async () => {
    const gm = new GitManager(process.cwd());
    await expect(gm.clone('file:///tmp/repo')).rejects.toThrow('Only clean HTTPS');
    await expect(gm.clone('https://user:pass@github.com/org/repo')).rejects.toThrow(
      'Only clean HTTPS'
    );
  });
});
