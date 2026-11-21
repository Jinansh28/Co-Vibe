import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiProvider } from '../src/model/gemini.js';
import { createAIProvider } from '../src/model/factory.js';
import { OllamaProvider } from '../src/model/ollama.js';
import { MockAIProvider } from '../src/model/mock.js';

describe('GeminiProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('throws error when initialized without API key', () => {
    expect(() => new GeminiProvider('')).toThrow('Gemini API key is required');
  });

  it('generates standard text response', async () => {
    const mockResponseData = {
      candidates: [
        {
          content: {
            parts: [{ text: 'Code generation completed.' }],
            role: 'model',
          },
          finishReason: 'STOP',
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponseData,
    });

    const provider = new GeminiProvider('test-api-key', 'gemini-2.0-flash', 'https://mock.api');
    const response = await provider.generate({
      model: 'default',
      messages: [
        { role: 'system', content: 'You are a coding assistant' },
        { role: 'user', content: 'Create a function' },
      ],
    });

    expect(response.message.content).toBe('Code generation completed.');
    expect(response.message.role).toBe('assistant');
    expect(response.finishReason).toBe('stop');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://mock.api/models/gemini-2.0-flash:generateContent?key=test-api-key',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });

  it('generates function tool calls when returned by model', async () => {
    const mockResponseData = {
      candidates: [
        {
          content: {
            parts: [
              {
                functionCall: {
                  name: 'write_file',
                  args: { path: 'src/index.ts', content: 'export const x = 1;' },
                },
              },
            ],
            role: 'model',
          },
          finishReason: 'STOP',
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponseData,
    });

    const provider = new GeminiProvider('test-api-key', 'gemini-2.0-flash', 'https://mock.api');
    const response = await provider.generate({
      model: 'gemini-1.5-pro',
      messages: [{ role: 'user', content: 'Write file' }],
      tools: [
        {
          type: 'function',
          function: {
            name: 'write_file',
            description: 'Write file to disk',
            parameters: { type: 'object', properties: {} },
          },
        },
      ],
    });

    expect(response.finishReason).toBe('tool_calls');
    expect(response.message.tool_calls).toBeDefined();
    expect(response.message.tool_calls![0].function.name).toBe('write_file');
  });

  it('throws descriptive error on API failure', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      text: async () => 'API key expired or invalid',
    });

    const provider = new GeminiProvider('bad-key', 'gemini-2.0-flash', 'https://mock.api');
    await expect(
      provider.generate({
        model: 'default',
        messages: [{ role: 'user', content: 'Hello' }],
      })
    ).rejects.toThrow('Gemini API error (403 Forbidden): API key expired or invalid');
  });

  it('streams response chunks via SSE', async () => {
    const encoder = new TextEncoder();
    const chunks = [
      'data: {"candidates": [{"content": {"parts": [{"text": "Hello "}]}}]}\n\n',
      'data: {"candidates": [{"content": {"parts": [{"text": "Gemini!"}]}}]}\n\n',
    ];

    let chunkIndex = 0;
    const mockReader = {
      read: async () => {
        if (chunkIndex < chunks.length) {
          return { done: false, value: encoder.encode(chunks[chunkIndex++]) };
        }
        return { done: true, value: undefined };
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: { getReader: () => mockReader },
    });

    const provider = new GeminiProvider('test-api-key', 'gemini-2.0-flash', 'https://mock.api');
    const stream = provider.stream({
      model: 'default',
      messages: [{ role: 'user', content: 'Hi' }],
    });

    let result = '';
    for await (const chunk of stream) {
      result += chunk;
    }

    expect(result).toBe('Hello Gemini!');
  });
});

describe('createAIProvider factory', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns OllamaProvider when GEMINI_API_KEY is not set', () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.AI_PROVIDER;

    const provider = createAIProvider();
    expect(provider).toBeInstanceOf(OllamaProvider);
  });

  it('returns GeminiProvider when GEMINI_API_KEY is set', () => {
    process.env.GEMINI_API_KEY = 'test-key';
    delete process.env.AI_PROVIDER;

    const provider = createAIProvider();
    expect(provider).toBeInstanceOf(GeminiProvider);
  });

  it('returns MockAIProvider when AI_PROVIDER is "mock"', () => {
    process.env.AI_PROVIDER = 'mock';

    const provider = createAIProvider();
    expect(provider).toBeInstanceOf(MockAIProvider);
  });
});
