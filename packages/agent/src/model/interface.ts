export interface AIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface AITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: any; // JSON schema
  };
}

export interface GenerateOptions {
  model: string;
  messages: AIMessage[];
  tools?: AITool[];
  temperature?: number;
  maxTokens?: number;
}

export interface GenerateResponse {
  message: AIMessage;
  finishReason: 'stop' | 'tool_calls' | 'length' | string;
}

export interface AIProvider {
  supportsToolCalling: boolean;
  generate(options: GenerateOptions): Promise<GenerateResponse>;
  stream(options: GenerateOptions): AsyncGenerator<string, void, unknown>;
}
