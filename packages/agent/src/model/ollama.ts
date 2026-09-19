import { AIProvider, GenerateOptions, GenerateResponse } from './interface.js';

export class OllamaProvider implements AIProvider {
  public supportsToolCalling = true;
  private baseUrl: string;

  constructor(baseUrl: string = 'http://127.0.0.1:11434') {
    this.baseUrl = baseUrl;
  }

  async generate(options: GenerateOptions): Promise<GenerateResponse> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        tools: options.tools,
        stream: false,
        options: {
          temperature: options.temperature,
          num_predict: options.maxTokens,
        }
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return {
      message: data.message,
      finishReason: data.done_reason || (data.message.tool_calls ? 'tool_calls' : 'stop'),
    };
  }

  async *stream(options: GenerateOptions): AsyncGenerator<string, void, unknown> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        tools: options.tools,
        stream: true,
        options: {
          temperature: options.temperature,
          num_predict: options.maxTokens,
        }
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');

    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.message?.content) {
            yield parsed.message.content;
          }
        } catch (e) {
          console.error('Error parsing Ollama stream chunk:', e);
        }
      }
    }
  }
}
