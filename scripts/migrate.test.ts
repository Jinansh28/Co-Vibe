import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  loadMigrationFiles,
  runMigrations,
  getAppliedMigrations,
  DatabaseExecutor,
} from './migrate';

const __filename = fileURLToPath(import.meta.url);
const migrationsDir = path.resolve(path.dirname(__filename), '../infrastructure/db/migrations');

describe('Database Initial Migration (TASK-006)', () => {
  it('001_initial_schema.sql migration file exists in infrastructure/db/migrations', () => {
    const migrationPath = path.join(migrationsDir, '001_initial_schema.sql');
    expect(fs.existsSync(migrationPath)).toBe(true);
  });

  it('001_initial_schema.sql contains DDL for users, projects, and project_members tables', () => {
    const migrationPath = path.join(migrationsDir, '001_initial_schema.sql');
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    // Verify auth.users link and schemas
    expect(sql).toContain('CREATE SCHEMA IF NOT EXISTS auth;');
    expect(sql).toContain('auth.users');

    // Verify public.users table
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.users');
    expect(sql).toContain('auth_user_id');
    expect(sql).toContain('REFERENCES auth.users(id)');

    // Verify public.projects table
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.projects');
    expect(sql).toContain('owner_id');
    expect(sql).toContain('REFERENCES public.users(id)');

    // Verify public.project_members table & check constraint
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.project_members');
    expect(sql).toContain("role IN ('owner', 'editor', 'viewer')");
    expect(sql).toContain('uq_project_members_project_user');
  });

  describe('Workspaces & Repositories Migration (TASK-009)', () => {
    it('002_workspaces_repos.sql migration file exists in infrastructure/db/migrations', () => {
      const migrationPath = path.join(migrationsDir, '002_workspaces_repos.sql');
      expect(fs.existsSync(migrationPath)).toBe(true);
    });

    it('002_workspaces_repos.sql contains DDL for workspaces and repositories tables', () => {
      const migrationPath = path.join(migrationsDir, '002_workspaces_repos.sql');
      const sql = fs.readFileSync(migrationPath, 'utf-8');

      // Verify public.workspaces table
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.workspaces');
      expect(sql).toContain('REFERENCES public.projects(id) ON DELETE CASCADE');

      // Verify public.repositories table
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.repositories');
      expect(sql).toContain('uq_repositories_project_owner_repo UNIQUE (project_id, owner_name, repo_name)');
    });
  });


  describe('Migration Runner (scripts/migrate.ts)', () => {
    let executedQueries: string[];
    let appliedMigrations: Set<string>;
    let mockDb: DatabaseExecutor;

    beforeEach(() => {
      executedQueries = [];
      appliedMigrations = new Set();

      mockDb = {
        query: async (sql: string) => {
          executedQueries.push(sql);

          if (sql.includes('SELECT name FROM public.schema_migrations')) {
            return Array.from(appliedMigrations).map((name) => ({ name }));
          }

          if (sql.includes('INSERT INTO public.schema_migrations')) {
            const match = sql.match(/VALUES \('([^']+)'\)/);
            if (match && match[1]) {
              appliedMigrations.add(match[1]);
            }
          }

          return { rows: [] };
        },
      };
    });

    it('loads migration files successfully', () => {
      const files = loadMigrationFiles(migrationsDir);
      expect(files.length).toBeGreaterThan(0);
      expect(files[0]?.name).toBe('001_initial_schema.sql');
    });

    it('executes unapplied migrations and tracks them in schema_migrations', async () => {
      const result = await runMigrations(mockDb, migrationsDir);

      expect(result.applied).toContain('001_initial_schema.sql');
      expect(result.applied).toContain('002_workspaces_repos.sql');
      expect(result.skipped).toHaveLength(0);

      const currentApplied = await getAppliedMigrations(mockDb);
      expect(currentApplied.has('001_initial_schema.sql')).toBe(true);
      expect(currentApplied.has('002_workspaces_repos.sql')).toBe(true);
    });

    it('skips already applied migrations on subsequent runs', async () => {
      // First run
      await runMigrations(mockDb, migrationsDir);

      // Second run
      const result2 = await runMigrations(mockDb, migrationsDir);
      expect(result2.applied).toHaveLength(0);
      expect(result2.skipped).toContain('001_initial_schema.sql');
      expect(result2.skipped).toContain('002_workspaces_repos.sql');
    });
  });
});
