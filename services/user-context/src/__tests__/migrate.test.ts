import { describe, expect, it } from 'vitest';

const databaseUrl = process.env.USER_CONTEXT_DATABASE_URL;
const testSchema = 'user_context_migrate_test';
const expectedTables = [
  'ambient_context_events',
  'calendar_events',
  'preferences',
  'profiles',
  'schema_migrations',
  'sessions',
];

const runIfDatabase = databaseUrl ? it : it.skip;

describe('user context database migrations', () => {
  runIfDatabase('creates the initial user context tables', async () => {
    const { migrateUserContextDatabase } = await import('../migrate.js');
    const { Pool } = await import('pg');
    const adminPool = new Pool({ connectionString: databaseUrl });

    try {
      await adminPool.query(`DROP SCHEMA IF EXISTS ${testSchema} CASCADE`);

      await migrateUserContextDatabase({ databaseUrl, schema: testSchema });

      const result = await adminPool.query<{ table_name: string }>(
        `
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = $1
            AND table_type = 'BASE TABLE'
          ORDER BY table_name
        `,
        [testSchema],
      );

      expect(result.rows.map((row) => row.table_name)).toEqual(expectedTables);
    } finally {
      await adminPool.query(`DROP SCHEMA IF EXISTS ${testSchema} CASCADE`);
      await adminPool.end();
    }
  });
});
