import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OllamaProvider } from '../src/model/ollama.js';
import { MockAIProvider } from '../src/model/mock.js';

describe('OllamaProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('generates a response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        message: { role: 'assistant', content: 'Hello!' },
        done_reason: 'stop'
      })
    });

    const provider = new OllamaProvider('http://localhost:11434');
    const response = await provider.generate({
      model: 'llama3',
      messages: [{ role: 'user', content: 'Hi' }]
    });

    expect(response.message.content).toBe('Hello!');
    expect(response.finishReason).toBe('stop');
  });

  it('streams a response', async () => {
    const encoder = new TextEncoder();
    const chunks = [
      JSON.stringify({ message: { content: 'Hello ' }, done: false }) + '\n',
      JSON.stringify({ message: { content: 'World!' }, done: true }) + '\n'
    ];
    
    let chunkIndex = 0;
    const mockReader = {
      read: async () => {
        if (chunkIndex < chunks.length) {
          return { done: false, value: encoder.encode(chunks[chunkIndex++]) };
        }
        return { done: true, value: undefined };
      }
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: { getReader: () => mockReader }
    });

    const provider = new OllamaProvider('http://localhost:11434');
    const stream = provider.stream({
      model: 'llama3',
      messages: [{ role: 'user', content: 'Hi' }]
    });

    let result = '';
    for await (const chunk of stream) {
      result += chunk;
    }

    expect(result).toBe('Hello World!');
  });
});

describe('MockAIProvider', () => {
  it('returns mock responses', async () => {
    const provider = new MockAIProvider();
    provider.setMockResponse(['Test 1']);
    
    const response = await provider.generate({
      model: 'mock',
      messages: []
    });
    
    expect(response.message.content).toBe('Test 1');
  });

  it('streams mock responses', async () => {
    const provider = new MockAIProvider();
    provider.setMockResponse(['Chunk1 Chunk2']);
    
    const stream = provider.stream({
      model: 'mock',
      messages: []
    });
    
    let result = '';
    for await (const chunk of stream) {
      result += chunk;
    }
    
    expect(result).toBe('Chunk1 Chunk2 ');
  });
});
