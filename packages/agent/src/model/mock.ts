import { AIProvider, GenerateOptions, GenerateResponse } from './interface.js';

export class MockAIProvider implements AIProvider {
  public supportsToolCalling = true;
  private mockResponses: string[] = [];
  private mockToolCalls: any[] = [];
  
  setMockResponse(responses: string[]) {
    this.mockResponses = responses;
  }
  
  setMockToolCalls(toolCalls: any[]) {
    this.mockToolCalls = toolCalls;
  }

  async generate(options: GenerateOptions): Promise<GenerateResponse> {
    const content = this.mockResponses.shift() || 'Mock response';
    const tool_calls = this.mockToolCalls.shift();
    
    return {
      message: {
        role: 'assistant',
        content,
        tool_calls
      },
      finishReason: tool_calls ? 'tool_calls' : 'stop'
    };
  }

  async *stream(options: GenerateOptions): AsyncGenerator<string, void, unknown> {
    const content = this.mockResponses.shift() || 'Mock stream response';
    const chunks = content.split(' ');
    for (const chunk of chunks) {
      yield chunk + ' ';
    }
  }
}
