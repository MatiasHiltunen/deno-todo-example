import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

/** Open a bounded connection pool. The caller owns closing it. */
export function createDatabase(databaseUrl: string, maxConnections = 10) {
  const client = postgres(databaseUrl, {
    max: maxConnections,
    idle_timeout: 20,
    connect_timeout: 10,
    connection: { statement_timeout: 10_000 },
    onnotice: () => {},
  });
  const db = drizzle(client, { schema });

  return {
    client,
    db,
    async close() {
      await client.end({ timeout: 5 });
    },
  };
}

export type Database = ReturnType<typeof createDatabase>["db"];
