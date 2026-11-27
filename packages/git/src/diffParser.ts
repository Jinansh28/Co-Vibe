export interface DiffHunk {
  id: string;
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
  content: string;
}

export interface ParsedFileDiff {
  oldName: string;
  newName: string;
  headerLines: string[];
  hunks: DiffHunk[];
  patch: string;
}

export interface ParsedDiff {
  files: ParsedFileDiff[];
}

const HUNK_HEADER_REGEX = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

export function parseDiff(diffString: string): ParsedDiff {
  const result: ParsedDiff = { files: [] };
  if (!diffString || !diffString.trim()) return result;

  const normalized = diffString.replace(/\r\n/g, '\n');
  const fileDiffs = normalized.split(/^diff --git /m).filter((b) => b.trim().length > 0);

  for (const diffBlock of fileDiffs) {
    const rawLines = diffBlock.split('\n');
    // Remove trailing empty line produced by trailing newline split
    if (rawLines.length > 0 && rawLines[rawLines.length - 1] === '') {
      rawLines.pop();
    }

    let oldName = '';
    let newName = '';
    const headerLines: string[] = [];
    const hunks: DiffHunk[] = [];

    let currentHunk: {
      header: string;
      oldStart: number;
      oldLines: number;
      newStart: number;
      newLines: number;
      lines: string[];
    } | null = null;

    const flushHunk = () => {
      if (!currentHunk) return;
      const fileLabel = newName && newName !== '/dev/null' ? newName : oldName;
      const hunkIndex = hunks.length + 1;
      const id = fileLabel
        ? `${fileLabel} #${hunkIndex} ${currentHunk.header}`
        : `#${hunkIndex} ${currentHunk.header}`;
      hunks.push({
        id,
        header: currentHunk.header,
        oldStart: currentHunk.oldStart,
        oldLines: currentHunk.oldLines,
        newStart: currentHunk.newStart,
        newLines: currentHunk.newLines,
        lines: currentHunk.lines,
        content: [currentHunk.header, ...currentHunk.lines].join('\n'),
      });
      currentHunk = null;
    };

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      const hunkMatch = line.match(HUNK_HEADER_REGEX);
      if (hunkMatch) {
        flushHunk();
        currentHunk = {
          header: line,
          oldStart: Number(hunkMatch[1]),
          oldLines: hunkMatch[2] !== undefined ? Number(hunkMatch[2]) : 1,
          newStart: Number(hunkMatch[3]),
          newLines: hunkMatch[4] !== undefined ? Number(hunkMatch[4]) : 1,
          lines: [],
        };
        continue;
      }

      if (currentHunk) {
        currentHunk.lines.push(line);
      } else {
        if (line.startsWith('--- a/')) oldName = line.substring(6);
        else if (line.startsWith('--- ')) oldName = line.substring(4);
        else if (line.startsWith('+++ b/')) newName = line.substring(6);
        else if (line.startsWith('+++ ')) newName = line.substring(4);

        headerLines.push(i === 0 ? `diff --git ${line}` : line);
      }
    }

    flushHunk();

    result.files.push({
      oldName,
      newName,
      headerLines,
      hunks,
      patch: `diff --git ${diffBlock}`,
    });
  }

  return result;
}

export function extractPatchHunkIds(diffString: string): string[] {
  const parsed = parseDiff(diffString);
  return parsed.files.flatMap((f) => f.hunks.map((h) => h.id));
}

export function filterPatchByHunks(diffString: string, acceptedHunks: string[]): string {
  if (!diffString || acceptedHunks.length === 0) {
    return '';
  }

  const parsed = parseDiff(diffString);
  if (parsed.files.length === 0) {
    return '';
  }

  const acceptedSet = new Set(acceptedHunks);
  const allHunks = parsed.files.flatMap((f) => f.hunks);

  const selectedFilePatches: string[] = [];

  for (const file of parsed.files) {
    if (file.hunks.length === 0) {
      // Binary or mode-only file change
      if (acceptedSet.has(file.newName) || acceptedSet.has(file.oldName)) {
        selectedFilePatches.push(file.headerLines.join('\n'));
      }
      continue;
    }

    const keptHunks = file.hunks.filter((hunk) => {
      if (acceptedSet.has(hunk.id) || acceptedSet.has(hunk.header)) {
        return true;
      }
      const globalIdx = allHunks.indexOf(hunk) + 1;
      return acceptedSet.has(`Hunk ${globalIdx}`) || acceptedSet.has(`hunk_${globalIdx}`);
    });

    if (keptHunks.length === 0) {
      continue;
    }

    const parts = [...file.headerLines, ...keptHunks.map((h) => h.content)];
    selectedFilePatches.push(parts.join('\n'));
  }

  if (selectedFilePatches.length === 0) {
    return '';
  }

  return selectedFilePatches.join('\n') + '\n';
}
