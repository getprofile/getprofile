// Database client for GetProfile
// Drizzle ORM connection with PostgreSQL

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// Database connection singleton
let db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let client: postgres.Sql | null = null;

export interface DatabaseConfig {
  url: string;
  poolSize?: number;
  idle_timeout?: number;
  connect_timeout?: number;
}

/**
 * Initialize the database connection.
 * Should be called once at application startup.
 */
export function initDatabase(config: DatabaseConfig): ReturnType<typeof drizzle<typeof schema>> {
  if (db) {
    return db;
  }

  const connectionOptions = {
    max: config.poolSize ?? 10,
    idle_timeout: config.idle_timeout ?? 20,
    connect_timeout: config.connect_timeout ?? 10,
  };

  let newClient: postgres.Sql | null = null;
  try {
    newClient = postgres(config.url, connectionOptions);
    const newDb = drizzle(newClient, { schema });
    client = newClient;
    db = newDb;
    return db;
  } catch (error) {
    if (newClient) {
      // Best-effort cleanup if drizzle initialization fails after client creation
      void newClient.end().catch(() => undefined);
    }
    client = null;
    db = null;
    throw error;
  }
}

/**
 * Get the database instance.
 * Throws if database is not initialized.
 */
export function getDatabase(): ReturnType<typeof drizzle<typeof schema>> {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * Close the database connection.
 * Should be called when shutting down the application.
 */
export async function closeDatabase(): Promise<void> {
  if (!client) {
    db = null;
    return;
  }

  const currentClient = client;

  try {
    await currentClient.end();
  } finally {
    if (client === currentClient) {
      client = null;
    }
    db = null;
  }
}

// Export the type for use in other modules
export type Database = ReturnType<typeof drizzle<typeof schema>>;
