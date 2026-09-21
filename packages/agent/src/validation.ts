export interface FailedSpec {
  name: string;
  message: string;
  file?: string;
  line?: number;
}

export interface TestResult {
  passed: boolean;
  failedSpecs: FailedSpec[];
}

export function formatTestFailures(result: TestResult): string {
  if (result.passed) {
    return 'All tests passed successfully.';
  }

  const lines: string[] = ['Test validation failed. The following tests did not pass:'];
  
  result.failedSpecs.forEach((spec, index) => {
    lines.push(`\n${index + 1}. ${spec.name}`);
    if (spec.file) {
      lines.push(`   File: ${spec.file}${spec.line ? `:${spec.line}` : ''}`);
    }
    lines.push(`   Error: ${spec.message.trim().split('\n').map(l => '      ' + l).join('\n').trimStart()}`);
  });

  return lines.join('\n');
}
