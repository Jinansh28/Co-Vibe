import { LexicalIndex } from './lexical.js';
import { SymbolParser, SymbolInfo } from './symbols.js';
import { StackTraceParser, StackFrame } from './stackTrace.js';

export interface ContextChunk {
  file: string;
  content: string;
  relevance: number;
}

export class ContextRetriever {
  private lexicalIndex = new LexicalIndex();
  private symbolParser = new SymbolParser();
  private stackTraceParser = new StackTraceParser();
  
  // Enforce token budget allocation (40% context budget max)
  // Assuming total context window is ~8000 tokens for example, 40% is 3200 tokens
  private MAX_TOKENS = 3200; 
  private CHARS_PER_TOKEN = 4; // Standard approximation

  constructor(maxTokens?: number) {
    if (maxTokens) {
      this.MAX_TOKENS = maxTokens;
    }
  }

  addFile(filePath: string, content: string) {
    this.lexicalIndex.addFile(filePath, content);
  }

  removeFile(filePath: string) {
    this.lexicalIndex.removeFile(filePath);
  }

  query(queryStr: string, fileContents: Map<string, string>, stackTrace?: string): ContextChunk[] {
    const chunks: ContextChunk[] = [];
    
    for (const [file, content] of fileContents.entries()) {
      if (!this.lexicalIndex.getFileHash(file)) {
        this.addFile(file, content);
      }
    }
    
    const lexicalMatches = this.lexicalIndex.search(queryStr);
    
    for (const [file, content] of fileContents.entries()) {
      const symbols = this.symbolParser.parse(file, content);
      const matchedSymbol = symbols.find(s => queryStr.includes(s.name) || s.name.includes(queryStr));
      
      let relevance = 0;
      if (lexicalMatches.includes(file)) relevance += 1;
      if (matchedSymbol) relevance += 5;
      
      if (relevance > 0) {
        chunks.push({
          file,
          content,
          relevance
        });
      }
    }
    
    if (stackTrace) {
      const frames = this.stackTraceParser.parse(stackTrace);
      for (const frame of frames) {
        const file = frame.file;
        const content = fileContents.get(file);
        if (content) {
          const existing = chunks.find(c => c.file === file);
          if (existing) {
            existing.relevance += 10;
          } else {
            chunks.push({
              file,
              content,
              relevance: 10
            });
          }
        }
      }
    }
    
    chunks.sort((a, b) => b.relevance - a.relevance);
    
    return this.applyTokenBudget(chunks);
  }
  
  private applyTokenBudget(chunks: ContextChunk[]): ContextChunk[] {
    const budgetedChunks: ContextChunk[] = [];
    let currentChars = 0;
    const maxChars = this.MAX_TOKENS * this.CHARS_PER_TOKEN;
    
    for (const chunk of chunks) {
      if (currentChars + chunk.content.length <= maxChars) {
        budgetedChunks.push(chunk);
        currentChars += chunk.content.length;
      }
    }
    
    return budgetedChunks;
  }
}
