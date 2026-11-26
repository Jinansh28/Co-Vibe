import fs from 'node:fs';
import path from 'node:path';

function findNearestExistingPath(targetPath: string): string | null {
  let current = targetPath;
  while (true) {
    if (fs.existsSync(current)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function isWithinRoot(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(root + path.sep);
}

export function assertWorkspacePath(rootPath: string, requestedPath: string): string {
  if (requestedPath.indexOf('\0') !== -1) {
    throw new Error('PATH_NOT_ALLOWED');
  }

  // Canonicalize both paths lexically first
  const canonicalRoot = path.resolve(rootPath);
  const canonicalRequested = path.resolve(rootPath, requestedPath);

  if (!isWithinRoot(canonicalRoot, canonicalRequested)) {
    throw new Error('PATH_NOT_ALLOWED');
  }

  // When workspace root exists on disk, resolve symlinks to prevent symlink escapes outside root
  if (fs.existsSync(canonicalRoot)) {
    const existingTarget = findNearestExistingPath(canonicalRequested);
    if (existingTarget) {
      const realRoot = fs.realpathSync(canonicalRoot);
      const realTarget = fs.realpathSync(existingTarget);
      if (!isWithinRoot(realRoot, realTarget)) {
        throw new Error('PATH_NOT_ALLOWED');
      }
    }
  }

  return canonicalRequested;
}
