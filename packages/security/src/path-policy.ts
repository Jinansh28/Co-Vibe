import path from 'node:path/posix';

export function assertWorkspacePath(rootPath: string, requestedPath: string): string {
  if (requestedPath.indexOf('\0') !== -1) {
    throw new Error('PATH_NOT_ALLOWED');
  }

  // Canonicalize both paths
  const canonicalRoot = path.resolve(rootPath);
  const canonicalRequested = path.resolve(rootPath, requestedPath);

  // Ensure canonicalRequested starts with canonicalRoot + path.sep or is exactly canonicalRoot
  if (
    canonicalRequested !== canonicalRoot &&
    !canonicalRequested.startsWith(canonicalRoot + path.sep)
  ) {
    throw new Error('PATH_NOT_ALLOWED');
  }

  return canonicalRequested;
}
