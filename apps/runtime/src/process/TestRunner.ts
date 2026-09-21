import { ProcessManager } from './ProcessManager.js';

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

export class TestRunner {
  constructor(private processManager: ProcessManager) {}

  public async runTests(containerId: string, cwd: string = '/workspace'): Promise<TestResult> {
    const pkgJsonResult = await this.processManager.execCommand(containerId, ['cat', 'package.json'], { cwd });
    let isVitest = false;
    let isJest = false;
    let isMocha = false;

    if (pkgJsonResult.exitCode === 0) {
      try {
        const pkg = JSON.parse(pkgJsonResult.stdout);
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (deps['vitest']) isVitest = true;
        else if (deps['jest']) isJest = true;
        else if (deps['mocha']) isMocha = true;
      } catch (e) {
        // ignore
      }
    }

    if (!isVitest && !isJest && !isMocha) {
      isVitest = true; // default
    }

    let cmd: string[];
    if (isVitest) {
      cmd = ['npx', 'vitest', 'run', '--reporter=json'];
    } else if (isJest) {
      cmd = ['npx', 'jest', '--json'];
    } else if (isMocha) {
      cmd = ['npx', 'mocha', '--reporter=json'];
    } else {
      cmd = ['npm', 'test', '--', '--reporter=json'];
    }

    const testResult = await this.processManager.execCommand(containerId, cmd, { cwd });
    
    return this.parseOutput(testResult.stdout, testResult.stderr, testResult.exitCode);
  }

  public parseOutput(stdout: string, stderr: string, exitCode: number): TestResult {
    const failedSpecs: FailedSpec[] = [];
    const combinedOutput = stdout + '\n' + stderr;
    
    let parsedJson: any = null;
    const match = combinedOutput.match(/\{[\s\S]*\}/);
    if (match) {
        try {
            parsedJson = JSON.parse(match[0]);
        } catch (e) {
            // failed to parse
        }
    }

    if (parsedJson) {
       const testResults = parsedJson.testResults || [];
       for (const tr of testResults) {
           const assertions = tr.assertionResults || [];
           for (const a of assertions) {
               if (a.status === 'failed') {
                   const message = a.failureMessages ? (Array.isArray(a.failureMessages) ? a.failureMessages.join('\n') : a.failureMessages) : '';
                   failedSpecs.push({
                       name: a.title || tr.name || 'Unknown test',
                       message,
                       file: tr.name,
                   });
               }
           }
           
           if (assertions.length === 0 && (tr.status === 'failed' || tr.message)) {
               failedSpecs.push({
                   name: tr.name || 'Unknown test',
                   message: tr.message || 'Test failed',
                   file: tr.name,
               });
           }
       }
    }

    if (!parsedJson && exitCode !== 0) {
        failedSpecs.push({
            name: 'Execution Failed',
            message: combinedOutput.substring(0, 1000).trim()
        });
    }

    return {
        passed: exitCode === 0 && failedSpecs.length === 0,
        failedSpecs
    };
  }
}
