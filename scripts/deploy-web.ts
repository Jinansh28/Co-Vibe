import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const apiDir = path.resolve(rootDir, 'apps/api');
const webDistDir = path.resolve(rootDir, 'apps/web/dist');
const projectName = process.env.CF_PAGES_PROJECT_NAME || 'co-vibe-web';

if (!fs.existsSync(webDistDir)) {
  console.error(`Error: Web build directory not found at ${webDistDir}. Run "pnpm --filter @co-vibe/web run build" first.`);
  process.exit(1);
}

console.log(`Deploying static frontend from ${webDistDir} to Cloudflare Pages (${projectName})...`);

const extraArgs = process.argv.slice(2);
const result = spawnSync(
  'npx',
  ['wrangler', 'pages', 'deploy', webDistDir, `--project-name=${projectName}`, ...extraArgs],
  {
    cwd: apiDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  }
);

if (result.error) {
  console.error('Failed to spawn wrangler pages deploy:', result.error);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`wrangler pages deploy exited with code ${result.status}`);
  process.exit(result.status ?? 1);
}

console.log('Cloudflare Pages deployment successful.');
