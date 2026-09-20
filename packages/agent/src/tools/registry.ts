import { z } from 'zod';

export interface ToolDefinition<T extends z.ZodTypeAny = any> {
  name: string;
  description: string;
  schema: T;
  timeoutMs: number;
  execute: (args: z.infer<T>) => Promise<string>;
}

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  register(tool: ToolDefinition) {
    this.tools.set(tool.name, tool);
  }

  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  async executeTool(name: string, args: unknown): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) {
      return `Error: Tool ${name} not found in registry.`;
    }

    const validationResult = tool.schema.safeParse(args);
    if (!validationResult.success) {
      return `Error: Tool input validation failed.\n${validationResult.error.message}`;
    }

    return new Promise((resolve) => {
      let isSettled = false;

      const timer = setTimeout(() => {
        if (!isSettled) {
          isSettled = true;
          resolve(`Error: Tool execution exceeded timeout of ${tool.timeoutMs}ms.`);
        }
      }, tool.timeoutMs);

      tool.execute(validationResult.data).then(
        (result) => {
          if (!isSettled) {
            isSettled = true;
            clearTimeout(timer);
            resolve(result);
          }
        },
        (error) => {
          if (!isSettled) {
            isSettled = true;
            clearTimeout(timer);
            resolve(`Error: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      );
    });
  }
}
