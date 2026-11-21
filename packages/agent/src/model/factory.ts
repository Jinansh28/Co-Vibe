import { AIProvider } from './interface.js';
import { OllamaProvider } from './ollama.js';
import { GeminiProvider } from './gemini.js';
import { MockAIProvider } from './mock.js';

export function createAIProvider(): AIProvider {
  if (process.env.AI_PROVIDER === 'mock') {
    return new MockAIProvider();
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    return new GeminiProvider(geminiKey, process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite');
  }

  return new OllamaProvider(
    process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
    process.env.OLLAMA_MODEL || 'qwen3.5:4b'
  );
}
