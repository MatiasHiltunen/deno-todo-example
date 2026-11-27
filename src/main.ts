import { createApp } from "./app.ts";
import { readConfig } from "./config.ts";
import { createDatabase } from "./db/client.ts";
import { PostgresTodoRepository } from "./todos/repository.ts";

const config = readConfig({
  DATABASE_URL: Deno.env.get("DATABASE_URL"),
  HOST: Deno.env.get("HOST"),
  PORT: Deno.env.get("PORT"),
});
const database = createDatabase(config.databaseUrl);
const repository = new PostgresTodoRepository(database.db);

try {
  // Fail early if credentials, connectivity, or migrations are incorrect.
  await repository.ping();
} catch {
  console.error(
    "Database is not ready. Check DATABASE_URL and run deno task db:migrate.",
  );
  await database.close();
  Deno.exit(1);
}

const app = createApp(repository);
const server = Deno.serve({
  hostname: config.hostname,
  port: config.port,
  onListen({ hostname, port }) {
    console.log(`Todo server listening on http://${hostname}:${port}`);
  },
}, app.fetch);

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("Shutting down the HTTP server and database pool.");
  try {
    await server.shutdown();
  } finally {
    await database.close();
  }
}

Deno.addSignalListener("SIGINT", shutdown);
// Windows does not support SIGTERM, but Docker and Unix do.
if (Deno.build.os !== "windows") Deno.addSignalListener("SIGTERM", shutdown);

await server.finished;
