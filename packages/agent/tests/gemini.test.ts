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

  it('captures and preserves thoughtSignature during multi-turn tool calling', async () => {
    const mockResponseWithSignature = {
      candidates: [
        {
          content: {
            parts: [
              {
                functionCall: {
                  name: 'list_dir',
                  args: { path: '.' },
                },
                thoughtSignature: 'encrypted_opaque_thought_token_123',
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
      json: async () => mockResponseWithSignature,
    });

    const provider = new GeminiProvider('test-api-key', 'gemini-3.5-flash-lite', 'https://mock.api');
    const response = await provider.generate({
      model: 'default',
      messages: [{ role: 'user', content: 'List files' }],
      tools: [
        {
          type: 'function',
          function: {
            name: 'list_dir',
            description: 'List directory',
            parameters: { type: 'object', properties: {} },
          },
        },
      ],
    });

    expect(response.message.tool_calls).toBeDefined();
    expect(response.message.tool_calls![0].thoughtSignature).toBe('encrypted_opaque_thought_token_123');

    // Test turn 2: Echoing assistant message and tool response back to Gemini
    let sentPayload: any;
    (global.fetch as any).mockImplementation(async (_url: string, init: any) => {
      sentPayload = JSON.parse(init.body);
      return {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: 'Found files: src, package.json' }],
                role: 'model',
              },
              finishReason: 'STOP',
            },
          ],
        }),
      };
    });

    const turn2Response = await provider.generate({
      model: 'default',
      messages: [
        { role: 'user', content: 'List files' },
        response.message,
        {
          role: 'tool',
          name: 'list_dir',
          content: JSON.stringify({ files: ['src', 'package.json'] }),
          tool_call_id: response.message.tool_calls![0].id,
        },
      ],
    });

    expect(turn2Response.message.content).toBe('Found files: src, package.json');
    // Verify that the assistant message payload included thoughtSignature
    const modelTurn = sentPayload.contents.find((c: any) => c.role === 'model');
    expect(modelTurn).toBeDefined();
    expect(modelTurn.parts[0].thoughtSignature).toBe('encrypted_opaque_thought_token_123');

    // Verify tool turn payload has valid JSON object in functionResponse
    const toolTurn = sentPayload.contents.find((c: any) => c.role === 'user' && c.parts[0].functionResponse);
    expect(toolTurn).toBeDefined();
    expect(toolTurn.parts[0].functionResponse.name).toBe('list_dir');
    expect(toolTurn.parts[0].functionResponse.response).toEqual({ files: ['src', 'package.json'] });
  });

  it('uses skip_thought_signature_validator fallback when thoughtSignature is absent', async () => {
    let sentPayload: any;
    global.fetch = vi.fn().mockImplementation(async (_url: string, init: any) => {
      sentPayload = JSON.parse(init.body);
      return {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: { parts: [{ text: 'Done' }], role: 'model' },
              finishReason: 'STOP',
            },
          ],
        }),
      };
    });

    const provider = new GeminiProvider('test-api-key', 'gemini-3.5-flash-lite', 'https://mock.api');
    await provider.generate({
      model: 'default',
      messages: [
        { role: 'user', content: 'Do task' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'run_tests', arguments: '{}' },
              // No thoughtSignature provided
            },
          ],
        },
        {
          role: 'tool',
          name: 'run_tests',
          content: 'All tests passed',
          tool_call_id: 'call_1',
        },
      ],
    });

    const modelTurn = sentPayload.contents.find((c: any) => c.role === 'model');
    expect(modelTurn.parts[0].thoughtSignature).toBe('skip_thought_signature_validator');
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
