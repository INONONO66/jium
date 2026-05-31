import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

export interface MigrateUserContextDatabaseOptions {
  readonly databaseUrl?: string;
  readonly schema?: string;
  readonly migrationsDir?: string;
}

export interface AppliedMigration {
  readonly filename: string;
  readonly applied: boolean;
}

const DEFAULT_SCHEMA = 'public';
const MIGRATION_FILE_PATTERN = /^\d+_[\w-]+\.sql$/;

export async function migrateUserContextDatabase(
  options: MigrateUserContextDatabaseOptions = {},
): Promise<AppliedMigration[]> {
  const databaseUrl = options.databaseUrl ?? process.env.USER_CONTEXT_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('USER_CONTEXT_DATABASE_URL is required to run user-context migrations.');
  }

  const schema = options.schema ?? process.env.USER_CONTEXT_DATABASE_SCHEMA ?? DEFAULT_SCHEMA;
  const migrationsDir = options.migrationsDir ?? getDefaultMigrationsDir();
  const migrationFiles = await listMigrationFiles(migrationsDir);
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const applied: AppliedMigration[] = [];

    for (const filename of migrationFiles) {
      const sql = await readFile(join(migrationsDir, filename), 'utf8');
      const client = await pool.connect();

      try {
        await client.query('BEGIN');
        await client.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(schema)}`);
        await client.query(`SET LOCAL search_path TO ${quoteIdentifier(schema)}`);
        await client.query(`
          CREATE TABLE IF NOT EXISTS schema_migrations (
            filename text PRIMARY KEY,
            applied_at timestamptz NOT NULL DEFAULT now()
          )
        `);

        const existing = await client.query<{ filename: string }>(
          'SELECT filename FROM schema_migrations WHERE filename = $1',
          [filename],
        );

        if (existing.rowCount === 0) {
          await client.query(sql);
          await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
          applied.push({ filename, applied: true });
        } else {
          applied.push({ filename, applied: false });
        }

        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }

    return applied;
  } finally {
    await pool.end();
  }
}

async function listMigrationFiles(migrationsDir: string): Promise<string[]> {
  const entries = await readdir(migrationsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && MIGRATION_FILE_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

function getDefaultMigrationsDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
}

function quoteIdentifier(identifier: string): string {
  if (identifier.length === 0) throw new Error('Database schema name cannot be empty.');
  return `"${identifier.replaceAll('"', '""')}"`;
}

function getCliOption(name: string): string | undefined {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match?.slice(prefix.length);
}

async function runCli(): Promise<void> {
  const applied = await migrateUserContextDatabase({
    databaseUrl: getCliOption('database-url'),
    schema: getCliOption('schema'),
  });

  for (const migration of applied) {
    const status = migration.applied ? 'applied' : 'skipped';
    console.log(`${status} ${migration.filename}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
