import { AIProvider, GenerateOptions, GenerateResponse, AIMessage, ToolCall } from './interface.js';

export interface GeminiProviderConfig {
  apiKey: string;
  defaultModel?: string;
  baseUrl?: string;
}

export class GeminiProvider implements AIProvider {
  public supportsToolCalling = true;
  private apiKey: string;
  private defaultModel: string;
  private baseUrl: string;

  constructor(apiKey: string, defaultModel: string = 'gemini-3.5-flash-lite', baseUrl?: string) {
    if (!apiKey) {
      throw new Error('Gemini API key is required');
    }
    this.apiKey = apiKey;
    this.defaultModel = defaultModel;
    this.baseUrl = baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
  }

  private formatPayload(options: GenerateOptions) {
    let systemInstruction: string | undefined;
    const contents: Array<{ role: 'user' | 'model'; parts: any[] }> = [];
    const toolCallNameMap = new Map<string, string>();

    for (const msg of options.messages) {
      if (msg.role === 'system') {
        systemInstruction = (systemInstruction ? systemInstruction + '\n' : '') + msg.content;
      } else if (msg.role === 'user') {
        contents.push({
          role: 'user',
          parts: [{ text: msg.content }],
        });
      } else if (msg.role === 'assistant') {
        const parts: any[] = [];
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          for (const tc of msg.tool_calls) {
            if (tc.id && tc.function?.name) {
              toolCallNameMap.set(tc.id, tc.function.name);
            }
          }
        }

        if (msg.rawParts && msg.rawParts.length > 0) {
          for (const rawPart of msg.rawParts) {
            if (rawPart.functionCall) {
              const sig =
                rawPart.thoughtSignature ||
                rawPart.thought_signature ||
                'skip_thought_signature_validator';
              parts.push({
                ...rawPart,
                thoughtSignature: sig,
              });
            } else {
              parts.push(rawPart);
            }
          }
        } else {
          if (msg.content) {
            parts.push({ text: msg.content });
          }
          if (msg.tool_calls && msg.tool_calls.length > 0) {
            for (const tc of msg.tool_calls) {
              let parsedArgs = {};
              try {
                parsedArgs = JSON.parse(tc.function.arguments || '{}');
              } catch {
                parsedArgs = { raw: tc.function.arguments };
              }
              const sig = tc.thoughtSignature || 'skip_thought_signature_validator';
              parts.push({
                functionCall: {
                  name: tc.function.name,
                  args: parsedArgs,
                },
                thoughtSignature: sig,
              });
            }
          }
        }
        contents.push({
          role: 'model',
          parts,
        });
      } else if (msg.role === 'tool') {
        const functionName = msg.name || (msg.tool_call_id ? toolCallNameMap.get(msg.tool_call_id) : undefined) || 'tool_response';
        let parsedResponse: any;
        try {
          const parsed = JSON.parse(msg.content);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            parsedResponse = parsed;
          } else {
            parsedResponse = { output: msg.content };
          }
        } catch {
          parsedResponse = { output: msg.content };
        }
        contents.push({
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: functionName,
                response: parsedResponse,
              },
            },
          ],
        });
      }
    }

    const tools =
      options.tools && options.tools.length > 0
        ? [
            {
              functionDeclarations: options.tools.map((t) => ({
                name: t.function.name,
                description: t.function.description,
                parameters: t.function.parameters,
              })),
            },
          ]
        : undefined;

    const generationConfig: Record<string, any> = {};
    if (options.temperature !== undefined) {
      generationConfig.temperature = options.temperature;
    }
    if (options.maxTokens !== undefined) {
      generationConfig.maxOutputTokens = options.maxTokens;
    }

    return {
      systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
      contents,
      tools,
      generationConfig: Object.keys(generationConfig).length > 0 ? generationConfig : undefined,
    };
  }

  async generate(options: GenerateOptions): Promise<GenerateResponse> {
    const model = options.model === 'default' ? this.defaultModel : options.model;
    const url = `${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`;
    const payload = this.formatPayload(options);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error (${response.status} ${response.statusText}): ${errorText}`);
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts || [];

    let textContent = '';
    const toolCalls: ToolCall[] = [];

    for (const part of parts) {
      if (part.text && !part.thought) {
        textContent += part.text;
      }
      if (part.functionCall) {
        const thoughtSig =
          part.thoughtSignature ||
          part.thought_signature ||
          part.functionCall?.thoughtSignature ||
          part.functionCall?.thought_signature;

        toolCalls.push({
          id: `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          type: 'function',
          function: {
            name: part.functionCall.name,
            arguments: typeof part.functionCall.args === 'string'
              ? part.functionCall.args
              : JSON.stringify(part.functionCall.args || {}),
          },
          thoughtSignature: thoughtSig,
        });
      }
    }

    const finishReason = toolCalls.length > 0
      ? 'tool_calls'
      : (candidate?.finishReason ? String(candidate.finishReason).toLowerCase() : 'stop');

    return {
      message: {
        role: 'assistant',
        content: textContent,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        rawParts: parts.length > 0 ? parts : undefined,
      },
      finishReason,
    };
  }

  async *stream(options: GenerateOptions): AsyncGenerator<string, void, unknown> {
    const model = options.model === 'default' ? this.defaultModel : options.model;
    const url = `${this.baseUrl}/models/${model}:streamGenerateContent?alt=sse&key=${this.apiKey}`;
    const payload = this.formatPayload(options);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini stream error (${response.status} ${response.statusText}): ${errorText}`);
    }

    if (!response.body) {
      throw new Error('No response body from Gemini stream');
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
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const jsonStr = trimmed.slice(6);
        try {
          const parsed = JSON.parse(jsonStr);
          const chunk = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
          if (chunk) {
            yield chunk;
          }
        } catch (e) {
          console.error('Error parsing Gemini stream chunk:', e);
        }
      }
    }
  }
}
