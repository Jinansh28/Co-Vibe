import { describe, it, expect, vi } from 'vitest';
import { TestRunner } from '../src/process/TestRunner.js';
import { ProcessManager } from '../src/process/ProcessManager.js';

describe('TestRunner', () => {
  it('should parse failing test output correctly', () => {
    // Mock ProcessManager
    const processManager = new ProcessManager({} as any);
    const runner = new TestRunner(processManager);

    const vitestJsonOutput = JSON.stringify({
      success: false,
      testResults: [
        {
          name: 'src/app.test.ts',
          status: 'failed',
          assertionResults: [
            {
              title: 'should render correctly',
              status: 'failed',
              failureMessages: ['Expected true to be false']
            },
            {
              title: 'should compute value',
              status: 'passed',
              failureMessages: []
            }
          ]
        }
      ]
    });

    const result = runner.parseOutput(vitestJsonOutput, '', 1);

    expect(result.passed).toBe(false);
    expect(result.failedSpecs).toHaveLength(1);
    expect(result.failedSpecs[0]).toEqual({
      name: 'should render correctly',
      message: 'Expected true to be false',
      file: 'src/app.test.ts'
    });
  });

  it('should parse jest format failing output correctly', () => {
    const processManager = new ProcessManager({} as any);
    const runner = new TestRunner(processManager);

    const jestJsonOutput = JSON.stringify({
      success: false,
      testResults: [
        {
          name: '/workspace/src/utils.test.ts',
          status: 'failed',
          message: 'SyntaxError: Unexpected token',
          assertionResults: []
        }
      ]
    });

    const result = runner.parseOutput(jestJsonOutput, '', 1);

    expect(result.passed).toBe(false);
    expect(result.failedSpecs).toHaveLength(1);
    expect(result.failedSpecs[0]).toEqual({
      name: '/workspace/src/utils.test.ts',
      message: 'SyntaxError: Unexpected token',
      file: '/workspace/src/utils.test.ts'
    });
  });

  it('should fallback if no JSON is found', () => {
    const processManager = new ProcessManager({} as any);
    const runner = new TestRunner(processManager);

    const result = runner.parseOutput('Error running tests\nCommand failed', '', 1);

    expect(result.passed).toBe(false);
    expect(result.failedSpecs).toHaveLength(1);
    expect(result.failedSpecs[0].name).toBe('Execution Failed');
    expect(result.failedSpecs[0].message).toBe('Error running tests\nCommand failed');
  });

  it('should return passed true for successful tests', () => {
    const processManager = new ProcessManager({} as any);
    const runner = new TestRunner(processManager);

    const result = runner.parseOutput(JSON.stringify({ success: true, testResults: [] }), '', 0);

    expect(result.passed).toBe(true);
    expect(result.failedSpecs).toHaveLength(0);
  });
});
