import { createHash } from 'crypto';

export class LexicalIndex {
  private fileHashes: Map<string, string> = new Map();
  private fileContents: Map<string, string> = new Map();

  addFile(filePath: string, content: string) {
    const hash = createHash('sha256').update(content).digest('hex');
    this.fileHashes.set(filePath, hash);
    this.fileContents.set(filePath, content);
  }

  removeFile(filePath: string) {
    this.fileHashes.delete(filePath);
    this.fileContents.delete(filePath);
  }

  getFileHash(filePath: string): string | undefined {
    return this.fileHashes.get(filePath);
  }

  search(query: string): string[] {
    const results: string[] = [];
    for (const [filePath, content] of this.fileContents.entries()) {
      if (content.includes(query)) {
        results.push(filePath);
      }
    }
    return results;
  }
}
