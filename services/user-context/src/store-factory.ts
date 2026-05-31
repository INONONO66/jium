import { Pool } from 'pg';
import { createPostgresUserContextStore } from './postgres-store.js';
import { createUserContextStore, type UserContextStore } from './store.js';
import { migrateUserContextDatabase } from './migrate.js';

export interface StoreFactoryEnv {
  readonly USER_CONTEXT_DATABASE_URL?: string;
  readonly USER_CONTEXT_DATABASE_SCHEMA?: string;
}

export interface StoreFactoryOptions {
  readonly env?: StoreFactoryEnv;
}

export async function createConfiguredUserContextStore(
  options: StoreFactoryOptions = {},
): Promise<UserContextStore> {
  const env = options.env ?? process.env;
  const databaseUrl = env.USER_CONTEXT_DATABASE_URL;
  if (!databaseUrl) return createUserContextStore();

  await migrateUserContextDatabase({
    databaseUrl,
    schema: env.USER_CONTEXT_DATABASE_SCHEMA,
  });

  const pool = new Pool({
    connectionString: databaseUrl,
    ...(env.USER_CONTEXT_DATABASE_SCHEMA
      ? { options: `-c search_path=${env.USER_CONTEXT_DATABASE_SCHEMA}` }
      : {}),
  });

  return createPostgresUserContextStore(pool);
}
