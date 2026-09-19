export interface StackFrame {
  file: string;
  line: number;
  column?: number;
}

export class StackTraceParser {
  parse(stackTrace: string): StackFrame[] {
    const frames: StackFrame[] = [];
    const lines = stackTrace.split('\n');

    // Example vitest/node stack trace line:
    // at Object.<anonymous> (/path/to/file.ts:10:5)
    // at /path/to/file.ts:10:5
    const regex = /at\s+(?:.*?\s+\()?(.*?):(\d+):(\d+)\)?/;

    for (const line of lines) {
      const match = line.match(regex);
      if (match) {
        frames.push({
          file: match[1],
          line: parseInt(match[2], 10),
          column: parseInt(match[3], 10),
        });
      }
    }

    return frames;
  }
}
