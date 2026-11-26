import { z } from 'zod';
import type { AITool } from '../model/interface.js';

export interface ToolDefinition<T extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  schema: T;
  timeoutMs: number;
  execute: (args: z.infer<T>) => Promise<string>;
}

interface ZodDefLike {
  typeName?: string;
  description?: string;
  shape?: (() => Record<string, z.ZodTypeAny>) | Record<string, z.ZodTypeAny>;
  type?: z.ZodTypeAny;
  innerType?: z.ZodTypeAny;
  values?: readonly string[];
  value?: unknown;
}

function unwrapOptionalSchema(schema: z.ZodTypeAny): {
  inner: z.ZodTypeAny;
  optional: boolean;
  description?: string;
} {
  let current = schema;
  let optional = false;
  let description = current.description;

  while (current && typeof current === 'object') {
    const def = (current as unknown as { _def?: ZodDefLike })._def;
    if (!def) break;
    if (!description && def.description) {
      description = def.description;
    }
    if (def.typeName === 'ZodOptional' || def.typeName === 'ZodDefault') {
      optional = true;
      if (def.innerType) {
        current = def.innerType;
        continue;
      }
    } else if (def.typeName === 'ZodNullable' && def.innerType) {
      current = def.innerType;
      continue;
    }
    break;
  }

  return { inner: current, optional, description };
}

/**
 * Converts a Zod v3 schema into a plain JSON Schema object for LLM tool declarations.
 */
export function zodSchemaToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const customJsonSchema = (schema as unknown as { jsonSchema?: Record<string, unknown> }).jsonSchema;
  if (customJsonSchema && typeof customJsonSchema === 'object') {
    return customJsonSchema;
  }

  const { inner, description } = unwrapOptionalSchema(schema);
  const def = (inner as unknown as { _def?: ZodDefLike })._def;
  const result: Record<string, unknown> = {};

  switch (def?.typeName) {
    case 'ZodObject': {
      const rawShape =
        typeof def.shape === 'function' ? def.shape() : def.shape || {};
      const properties: Record<string, unknown> = {};
      const required: string[] = [];

      for (const [key, fieldSchema] of Object.entries(rawShape)) {
        const unwrapped = unwrapOptionalSchema(fieldSchema);
        properties[key] = zodSchemaToJsonSchema(fieldSchema);
        if (!unwrapped.optional) {
          required.push(key);
        }
      }

      result.type = 'object';
      result.properties = properties;
      if (required.length > 0) {
        result.required = required;
      }
      break;
    }
    case 'ZodString':
      result.type = 'string';
      break;
    case 'ZodNumber':
      result.type = 'number';
      break;
    case 'ZodBoolean':
      result.type = 'boolean';
      break;
    case 'ZodArray':
      result.type = 'array';
      result.items = def.type ? zodSchemaToJsonSchema(def.type) : {};
      break;
    case 'ZodEnum':
      result.type = 'string';
      if (Array.isArray(def.values)) {
        result.enum = [...def.values];
      }
      break;
    case 'ZodLiteral':
      result.type =
        typeof def.value === 'number'
          ? 'number'
          : typeof def.value === 'boolean'
            ? 'boolean'
            : 'string';
      result.enum = [def.value];
      break;
    default:
      result.type = 'object';
      result.properties = {};
      break;
  }

  if (description) {
    result.description = description;
  }

  return result;
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

  toAITools(): AITool[] {
    return this.getTools().map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: zodSchemaToJsonSchema(t.schema),
      },
    }));
  }

  async executeTool(name: string, args: unknown): Promise<string> {
    const cleanName = name.includes(':') ? name.split(':').pop()! : name;
    const tool = this.tools.get(name) || this.tools.get(cleanName);
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
