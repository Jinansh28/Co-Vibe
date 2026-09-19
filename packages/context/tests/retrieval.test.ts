import { describe, it, expect } from 'vitest';
import { ContextRetriever } from '../src/retrieval.js';

describe('ContextRetriever', () => {
  it('retrieves files based on symbol query and fits within budget', () => {
    const retriever = new ContextRetriever(100); // Small budget of 100 tokens ~ 400 chars
    const fileContents = new Map<string, string>();
    
    fileContents.set('apps/api/src/middleware/auth.ts', `
      export class AuthMiddleware {
        handle() {}
      }
    `);
    
    fileContents.set('apps/api/src/other.ts', `
      export class OtherClass {
        // Lots of content to test budget
        // ...
        // ...
      }
    `.repeat(10));
    
    const results = retriever.query('AuthMiddleware', fileContents);
    
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].file).toBe('apps/api/src/middleware/auth.ts');
    
    // Check budget constraint
    const totalChars = results.reduce((acc, chunk) => acc + chunk.content.length, 0);
    expect(totalChars).toBeLessThanOrEqual(400); // 100 tokens * 4 chars
  });
  
  it('ranks stack trace files higher', () => {
    const retriever = new ContextRetriever();
    const fileContents = new Map<string, string>();
    
    fileContents.set('/src/errorFile.ts', `
      export function throwError() {
        throw new Error('Test');
      }
    `);
    
    fileContents.set('/src/other.ts', `
      export function somethingElse() {
        console.log('hi');
      }
    `);
    
    const stackTrace = `
      Error: Test
        at throwError (/src/errorFile.ts:3:15)
        at main (/src/main.ts:10:5)
    `;
    
    // Both files get processed, but errorFile.ts should have high relevance due to stack trace
    const results = retriever.query('throwError', fileContents, stackTrace);
    
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].file).toBe('/src/errorFile.ts');
    expect(results[0].relevance).toBeGreaterThanOrEqual(10);
  });
});
