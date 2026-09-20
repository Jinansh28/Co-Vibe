import { AIProvider, AIMessage } from './model/interface.js';
import { ToolRegistry } from './tools/registry.js';
import { AgentStateMachine } from './state-machine.js';
import { ContextRetriever } from '@co-vibe/context';
import { AgentTaskProgressPayload } from '@co-vibe/protocol';

export interface OrchestratorOptions {
  provider: AIProvider;
  toolRegistry: ToolRegistry;
  stateMachine: AgentStateMachine;
  contextRetriever: ContextRetriever;
  onProgress?: (progress: AgentTaskProgressPayload) => void;
  taskId: string;
  runId: string;
  workspaceFiles: Map<string, string>;
}

export class AgentOrchestrator {
  private provider: AIProvider;
  private toolRegistry: ToolRegistry;
  private stateMachine: AgentStateMachine;
  private contextRetriever: ContextRetriever;
  private onProgress?: (progress: AgentTaskProgressPayload) => void;
  private taskId: string;
  private runId: string;
  private workspaceFiles: Map<string, string>;

  constructor(options: OrchestratorOptions) {
    this.provider = options.provider;
    this.toolRegistry = options.toolRegistry;
    this.stateMachine = options.stateMachine;
    this.contextRetriever = options.contextRetriever;
    this.onProgress = options.onProgress;
    this.taskId = options.taskId;
    this.runId = options.runId;
    this.workspaceFiles = options.workspaceFiles;
  }

  private sendProgress(state: AgentTaskProgressPayload['state'], stepName: string, message: string, percentage?: number) {
    if (this.onProgress) {
      this.onProgress({
        taskId: this.taskId,
        runId: this.runId,
        state,
        stepName,
        message,
        percentage
      });
    }
  }

  async executeTask(prompt: string): Promise<string> {
    try {
      if (this.stateMachine.state === 'created') {
        await this.stateMachine.transition('planning');
      }

      this.sendProgress('PLANNING', 'Gather Context', 'Retrieving relevant context from workspace', 10);
      
      const contextChunks = this.contextRetriever.query(prompt, this.workspaceFiles);
      const contextString = contextChunks.map(c => `File: ${c.file}\n${c.content}`).join('\n\n');

      const messages: AIMessage[] = [
        { role: 'system', content: `You are an AI assistant. Here is some context:\n${contextString}` },
        { role: 'user', content: prompt }
      ];

      await this.stateMachine.transition('executing');
      
      const tools = this.toolRegistry.getTools().map(t => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: (t.schema as any).jsonSchema || { type: 'object', properties: {} }
        }
      }));

      this.sendProgress('EXECUTING', 'Model Query', 'Querying LLM with context and tools', 30);
      
      let loopCount = 0;
      const MAX_LOOPS = 5;

      while (loopCount < MAX_LOOPS) {
        loopCount++;
        
        const response = await this.provider.generate({
          model: 'default',
          messages,
          tools
        });

        messages.push(response.message);

        if (response.finishReason === 'tool_calls' && response.message.tool_calls) {
          for (const call of response.message.tool_calls) {
            this.sendProgress('EXECUTING', 'Execute Tool', `Executing tool ${call.function.name}`, 50);
            
            let args;
            try {
              args = JSON.parse(call.function.arguments);
            } catch (e) {
              messages.push({
                role: 'tool',
                content: `Error: Invalid JSON arguments: ${e}`,
                tool_call_id: call.id
              });
              continue;
            }

            const toolResult = await this.toolRegistry.executeTool(call.function.name, args);
            
            this.sendProgress('EXECUTING', 'Tool Result', `Tool ${call.function.name} finished`, 70);
            
            messages.push({
              role: 'tool',
              content: toolResult,
              tool_call_id: call.id
            });
          }
        } else {
          break; // Done with generation
        }
      }

      await this.stateMachine.transition('validating');
      this.sendProgress('SUCCESS', 'Task Completed', 'Task executed successfully', 100);
      
      await this.stateMachine.transition('awaiting_review');
      
      const lastMessage = messages[messages.length - 1];
      return lastMessage.content || 'Task completed with tool execution.';
      
    } catch (error) {
      await this.stateMachine.transition('failed');
      this.sendProgress('FAILED', 'Error', error instanceof Error ? error.message : String(error), 100);
      throw error;
    }
  }
}
