export interface FuzzyMatchResult {
  path: string;
  fileName: string;
  directory: string;
  score: number;
  matchedIndices: number[]; // Character indices for highlighting in path
}

/**
 * Splits a file path into fileName and directory.
 * Preserves trailing slash in directory if non-empty.
 */
export function splitPath(path: string): { fileName: string; directory: string } {
  const normalized = path.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  if (lastSlash === -1) {
    return { fileName: normalized, directory: '' };
  }
  return {
    fileName: normalized.slice(lastSlash + 1),
    directory: normalized.slice(0, lastSlash + 1),
  };
}

/**
 * Checks if a character index in path is at a word boundary:
 * - Start of string
 * - Start of filename (after the last slash)
 * - Following a separator: /, \, ., _, -, space
 * - CamelCase / PascalCase boundary: uppercase preceded by lowercase
 */
export function isWordBoundary(path: string, index: number, fileNameOffset: number): boolean {
  if (index === 0 || index === fileNameOffset) return true;
  if (index < 0 || index >= path.length) return false;

  const prevChar = path[index - 1];
  const currChar = path[index];

  // Separator boundary
  if (
    prevChar === '/' ||
    prevChar === '\\' ||
    prevChar === '.' ||
    prevChar === '_' ||
    prevChar === '-' ||
    prevChar === ' '
  ) {
    return true;
  }

  // CamelCase transition (e.g. AppLayout: L is preceded by p)
  if (/[A-Z]/.test(currChar) && /[a-z]/.test(prevChar)) {
    return true;
  }

  return false;
}

/**
 * Finds character matches of query in target string prioritizing:
 * - Word boundaries
 * - Basename matches
 * - Consecutive characters
 * - Compact span (minimal gap)
 */
function scoreAndCollectIndices(
  path: string,
  targetLower: string,
  queryLower: string,
  targetOffset: number,
  fileNameOffset: number
): { matchedIndices: number[]; score: number } | null {
  const qLen = queryLower.length;
  const tLen = targetLower.length;

  if (qLen === 0) return { matchedIndices: [], score: 0 };
  if (tLen < qLen) return null;

  // 1. Fast subsequence check
  let ti = 0;
  for (let qi = 0; qi < qLen; qi++) {
    const found = targetLower.indexOf(queryLower[qi], ti);
    if (found === -1) return null;
    ti = found + 1;
  }

  // 2. Backward search to find compact match
  // Starting from the end gives tighter groupings for sequential matches
  const backwardIndices: number[] = new Array(qLen);
  let bTi = tLen - 1;
  for (let qi = qLen - 1; qi >= 0; qi--) {
    const targetChar = queryLower[qi];
    const found = targetLower.lastIndexOf(targetChar, bTi);
    if (found === -1) return null;
    backwardIndices[qi] = found;
    bTi = found - 1;
  }

  // 3. Forward search preferring word boundaries
  const forwardIndices: number[] = new Array(qLen);
  let fTi = 0;
  for (let qi = 0; qi < qLen; qi++) {
    const targetChar = queryLower[qi];
    let nextIdx = targetLower.indexOf(targetChar, fTi);
    if (nextIdx === -1) {
      // Fallback to backward match if forward can't complete
      return calculateScore(path, backwardIndices.map((i) => i + targetOffset), fileNameOffset, queryLower);
    }

    // Lookahead for a word boundary occurrence if not already at one
    const pathIdx = nextIdx + targetOffset;
    if (!isWordBoundary(path, pathIdx, fileNameOffset)) {
      let lookahead = targetLower.indexOf(targetChar, nextIdx + 1);
      while (lookahead !== -1) {
        if (isWordBoundary(path, lookahead + targetOffset, fileNameOffset)) {
          // Check if remaining query can still match after lookahead
          let testTi = lookahead + 1;
          let canMatchRest = true;
          for (let restQi = qi + 1; restQi < qLen; restQi++) {
            const foundRest = targetLower.indexOf(queryLower[restQi], testTi);
            if (foundRest === -1) {
              canMatchRest = false;
              break;
            }
            testTi = foundRest + 1;
          }
          if (canMatchRest) {
            nextIdx = lookahead;
          }
          break;
        }
        lookahead = targetLower.indexOf(targetChar, lookahead + 1);
      }
    }

    forwardIndices[qi] = nextIdx;
    fTi = nextIdx + 1;
  }

  const scoreFwd = calculateScore(path, forwardIndices.map((i) => i + targetOffset), fileNameOffset, queryLower);
  const scoreBwd = calculateScore(path, backwardIndices.map((i) => i + targetOffset), fileNameOffset, queryLower);

  return scoreFwd.score >= scoreBwd.score ? scoreFwd : scoreBwd;
}

function calculateScore(
  path: string,
  matchedIndices: number[],
  fileNameOffset: number,
  queryLower: string
): { matchedIndices: number[]; score: number } {
  let score = 0;
  const fileName = path.slice(fileNameOffset);
  const fileNameLower = fileName.toLowerCase();
  const pathLower = path.toLowerCase();

  // Exact match boosts
  if (fileNameLower === queryLower) {
    score += 1200;
  } else if (pathLower === queryLower) {
    score += 900;
  } else if (fileNameLower.startsWith(queryLower)) {
    score += 400;
  } else if (pathLower.startsWith(queryLower)) {
    score += 200;
  }

  let prevIdx: number | null = null;
  for (let i = 0; i < matchedIndices.length; i++) {
    const idx = matchedIndices[i];
    score += 10; // Base match

    // Basename boost
    if (idx >= fileNameOffset) {
      score += 35;
    }

    // Word boundary boost
    if (isWordBoundary(path, idx, fileNameOffset)) {
      score += 40;
    }

    // Consecutive match bonus & gap penalty
    if (prevIdx !== null) {
      if (idx === prevIdx + 1) {
        score += 25; // Consecutive bonus
      } else {
        const gap = idx - prevIdx - 1;
        score -= Math.min(gap * 2, 20); // Penalty for gaps
      }
    }

    prevIdx = idx;
  }

  // Slight length penalty to favor concise matches
  score -= path.length * 0.1;

  return { matchedIndices, score };
}

/**
 * Fuzzy filters an array of file paths against a query string.
 * When query is empty:
 *  - Prioritizes currently open files
 *  - Followed by workspace files sorted alphabetically
 * When query is non-empty:
 *  - Scores files based on fuzzy character sequence matching
 *  - Ranks higher for word boundaries, basename matches, and consecutive characters
 */
export function fuzzyFilterFiles(
  files: string[],
  query: string,
  openFiles?: string[]
): FuzzyMatchResult[] {
  const cleanQuery = query.trim();

  // 1. Empty query behavior: Prioritize open files, then alphabetical
  if (!cleanQuery) {
    const openSet = new Set(openFiles || []);
    const results: FuzzyMatchResult[] = files.map((path) => {
      const { fileName, directory } = splitPath(path);
      const isOpen = openSet.has(path);
      const openIndex = openFiles ? openFiles.indexOf(path) : -1;
      // High score for open files based on recency / tab index
      const score = isOpen ? 10000 - (openIndex >= 0 ? openIndex : 999) : 0;
      return {
        path,
        fileName,
        directory,
        score,
        matchedIndices: [],
      };
    });

    results.sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return a.path.localeCompare(b.path);
    });

    return results;
  }

  const queryLower = cleanQuery.toLowerCase();
  const openSet = new Set(openFiles || []);
  const results: FuzzyMatchResult[] = [];

  for (const path of files) {
    const { fileName, directory } = splitPath(path);
    const fileNameOffset = directory.length;
    const pathLower = path.toLowerCase();
    const fileNameLower = fileName.toLowerCase();

    let bestMatch: { matchedIndices: number[]; score: number } | null = null;

    // A) If query doesn't contain path separators, try matching in fileName first
    if (!queryLower.includes('/') && !queryLower.includes('\\')) {
      const fileMatch = scoreAndCollectIndices(
        path,
        fileNameLower,
        queryLower,
        fileNameOffset,
        fileNameOffset
      );
      if (fileMatch) {
        bestMatch = fileMatch;
      }
    }

    // B) Also try matching full path if no match yet or to check path-level query
    const pathMatch = scoreAndCollectIndices(
      path,
      pathLower,
      queryLower,
      0,
      fileNameOffset
    );

    if (pathMatch) {
      if (!bestMatch || pathMatch.score > bestMatch.score) {
        bestMatch = pathMatch;
      }
    }

    if (bestMatch) {
      // Bonus if file is currently open
      let totalScore = bestMatch.score;
      if (openSet.has(path)) {
        totalScore += 50;
      }

      results.push({
        path,
        fileName,
        directory,
        score: totalScore,
        matchedIndices: bestMatch.matchedIndices,
      });
    }
  }

  // Sort by score descending; tie-break alphabetically
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.path.localeCompare(b.path);
  });

  return results;
}
