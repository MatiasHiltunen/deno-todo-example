import { defineConfig } from "drizzle-kit";

// Generating a migration only reads the schema and snapshots; it needs no database.
// Applying migrations is intentionally handled by src/db/migrate.ts.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  strict: true,
  verbose: true,
});
