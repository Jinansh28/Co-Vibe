export interface ParsedDiff {
  files: Array<{
    oldName: string;
    newName: string;
    patch: string;
  }>;
}

export function parseDiff(diffString: string): ParsedDiff {
  const result: ParsedDiff = { files: [] };
  if (!diffString) return result;

  const fileDiffs = diffString.split(/^diff --git/m).filter(Boolean);

  for (const diffBlock of fileDiffs) {
    const lines = diffBlock.split('\n');
    let oldName = '';
    let newName = '';
    
    // Simple naive parser
    for (const line of lines) {
      if (line.startsWith('--- a/')) oldName = line.substring(6);
      else if (line.startsWith('+++ b/')) newName = line.substring(6);
    }
    
    result.files.push({
      oldName,
      newName,
      patch: 'diff --git' + diffBlock
    });
  }

  return result;
}
