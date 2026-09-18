import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface DatabaseExecutor {
  query: (sql: string) => Promise<unknown>;
}

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

/**
 * Ensures the `schema_migrations` table exists.
 */
export async function ensureMigrationTable(db: DatabaseExecutor): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

/**
 * Gets a set of already applied migration file names.
 */
export async function getAppliedMigrations(db: DatabaseExecutor): Promise<Set<string>> {
  await ensureMigrationTable(db);
  const result = (await db.query(
    'SELECT name FROM public.schema_migrations ORDER BY id ASC;'
  )) as { rows?: Array<{ name: string }> } | Array<{ name: string }>;

  const rows = Array.isArray(result) ? result : result?.rows ?? [];
  return new Set(rows.map((r) => r.name));
}

/**
 * Reads SQL migration files from the target migrations directory.
 */
export function loadMigrationFiles(migrationsDir: string): Array<{ name: string; sql: string }> {
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory does not exist: ${migrationsDir}`);
  }

  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

  return files.map((file) => {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf-8');
    return { name: file, sql };
  });
}

/**
 * Runs pending database migrations using the provided DatabaseExecutor.
 */
export async function runMigrations(
  db: DatabaseExecutor,
  migrationsDir: string
): Promise<MigrationResult> {
  const appliedSet = await getAppliedMigrations(db);
  const migrationFiles = loadMigrationFiles(migrationsDir);

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const { name, sql } of migrationFiles) {
    if (appliedSet.has(name)) {
      skipped.push(name);
      continue;
    }

    // Execute migration SQL inside a single statement/batch
    await db.query(sql);

    // Record applied migration
    await db.query(`INSERT INTO public.schema_migrations (name) VALUES ('${name}');`);
    applied.push(name);
  }

  return { applied, skipped };
}

// CLI Execution Entrypoint
const __filename = fileURLToPath(import.meta.url);
const isDirectExecution = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isDirectExecution) {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) {
    console.error('Error: DATABASE_URL or POSTGRES_URL environment variable is required to run migrations.');
    process.exit(1);
  }

  const defaultMigrationsDir = path.resolve(path.dirname(__filename), '../infrastructure/db/migrations');

  console.log(`Running migrations against database from directory: ${defaultMigrationsDir}`);

  // Dynamic import of pg for CLI execution
  import('pg')
    .then(async ({ Client }) => {
      const client = new Client({ connectionString });
      await client.connect();
      try {
        const result = await runMigrations({ query: (sql) => client.query(sql) }, defaultMigrationsDir);
        console.log(`Migrations complete. Applied: ${result.applied.join(', ') || 'none'}. Skipped: ${result.skipped.join(', ') || 'none'}.`);
      } finally {
        await client.end();
      }
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
