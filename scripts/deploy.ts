import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const apiDir = path.resolve(rootDir, 'apps/api');
const wranglerToml = path.resolve(rootDir, 'infrastructure/cloudflare/wrangler.toml');

console.log(`Deploying Cloudflare Worker from ${apiDir}...`);

const result = spawnSync('npx', ['wrangler', 'deploy', '-c', wranglerToml], {
  cwd: apiDir,
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

if (result.error) {
  console.error('Failed to spawn wrangler deploy:', result.error);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`wrangler deploy exited with code ${result.status}`);
  process.exit(result.status ?? 1);
}

console.log('Deployment successful.');
