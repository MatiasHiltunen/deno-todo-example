import { migrate } from "drizzle-orm/postgres-js/migrator";
import { fileURLToPath } from "node:url";
import { readConfig } from "../config.ts";
import { createDatabase } from "./client.ts";

const { databaseUrl } = readConfig({
  DATABASE_URL: Deno.env.get("DATABASE_URL"),
});
// A single connection keeps the advisory lock on the same migration session.
const database = createDatabase(databaseUrl, 1);
let locked = false;

try {
  // Serializes concurrent migration containers for this application/database.
  await database.client`select pg_advisory_lock(708921734)`;
  locked = true;
  await migrate(database.db, {
    migrationsFolder: fileURLToPath(new URL("../../drizzle/", import.meta.url)),
  });
  console.log("Database migrations applied successfully.");
} finally {
  try {
    if (locked) await database.client`select pg_advisory_unlock(708921734)`;
  } finally {
    await database.close();
  }
}
