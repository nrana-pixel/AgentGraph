import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

// Bounded pool with explicit timeouts so a slow query can't pin every
// connection indefinitely and a connection count per replica stays predictable.
const client = postgres(connectionString, {
  max: Number(process.env["DB_POOL_MAX"] ?? 10),
  idle_timeout: 30, // seconds an idle connection is kept
  connect_timeout: 10, // seconds to establish a connection
  // Server-side cap (Postgres connection param) so a runaway query is killed
  // rather than holding a pool slot indefinitely.
  connection: {
    statement_timeout: Number(process.env["DB_STATEMENT_TIMEOUT_MS"] ?? 30_000),
  },
});

export const db = drizzle(client, { schema });

export type Db = typeof db;

/** Close the pool for graceful shutdown. */
export async function closeDb(): Promise<void> {
  await client.end({ timeout: 5 });
}
