import { AgentStateMachine } from './state-machine.js';
import { TestResult, formatTestFailures } from './validation.js';
import { ContextRetriever } from '@co-vibe/context';
import { AgentTaskProgressPayload } from '@co-vibe/protocol';
import { AIProvider, AIMessage } from './model/interface.js';
import { ToolRegistry } from './tools/registry.js';

export interface RepairLoopOptions {
  stateMachine: AgentStateMachine;
  contextRetriever: ContextRetriever;
  provider: AIProvider;
  toolRegistry: ToolRegistry;
  workspaceFiles: Map<string, string>;
  validateTask: () => Promise<TestResult>;
  onProgress?: (state: AgentTaskProgressPayload['state'], stepName: string, message: string, percentage?: number) => void;
  maxAttempts?: number;
}

export async function runRepairLoop(
  options: RepairLoopOptions,
  initialFailure: TestResult,
  previousMessages: AIMessage[]
): Promise<string> {
  const maxAttempts = options.maxAttempts || 3;
  let currentFailure = initialFailure;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await options.stateMachine.transition('needs_fix');
    
    if (options.onProgress) {
      options.onProgress('REPAIRING', 'Test Repair', `Attempting test repair ${attempt}/${maxAttempts}`, 60);
    }

    const failureMessage = formatTestFailures(currentFailure);
    const repairPrompt = `The previous code changes resulted in test failures. Please fix the following issues:\n\n${failureMessage}\n\nAnalyze the failures and modify the code to make the tests pass.`;

    const stackTrace = currentFailure.failedSpecs.map(s => s.message).join('\n');
    const contextChunks = options.contextRetriever.query(repairPrompt, options.workspaceFiles, stackTrace);
    const contextString = contextChunks.map(c => `File: ${c.file}\n${c.content}`).join('\n\n');

    const messages: AIMessage[] = [
      ...previousMessages,
      { role: 'user', content: repairPrompt },
      { role: 'system', content: `Updated Context for Repair:\n${contextString}` }
    ];

    const tools = options.toolRegistry.getTools().map(t => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: (t.schema as any).jsonSchema || { type: 'object', properties: {} }
        }
    }));

    await options.stateMachine.transition('executing');

    let loopCount = 0;
    const MAX_LOOPS = 5;

    while (loopCount < MAX_LOOPS) {
        loopCount++;
        
        const response = await options.provider.generate({
          model: 'default',
          messages,
          tools
        });

        messages.push(response.message);

        if (response.finishReason === 'tool_calls' && response.message.tool_calls) {
          for (const call of response.message.tool_calls) {
            if (options.onProgress) options.onProgress('EXECUTING', 'Execute Tool', `Executing tool ${call.function.name}`, 50);
            
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

            const toolResult = await options.toolRegistry.executeTool(call.function.name, args);
            
            messages.push({
              role: 'tool',
              content: toolResult,
              tool_call_id: call.id
            });
          }
        } else {
          break; 
        }
    }

    await options.stateMachine.transition('validating');
    currentFailure = await options.validateTask();

    if (currentFailure.passed) {
      if (options.onProgress) options.onProgress('SUCCESS', 'Repair Successful', 'Tests passed after repair', 100);
      return messages[messages.length - 1].content || 'Repair completed successfully.';
    }
  }

  await options.stateMachine.transition('failed');
  if (options.onProgress) options.onProgress('FAILED', 'Repair Failed', `Failed to repair tests after ${maxAttempts} attempts`, 100);
  throw new Error(`Failed to repair tests after ${maxAttempts} attempts.\n${formatTestFailures(currentFailure)}`);
}
