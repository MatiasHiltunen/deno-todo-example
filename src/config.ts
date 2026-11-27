export interface Config {
  databaseUrl: string;
  hostname: string;
  port: number;
}

/** Separate parsing from environment access to keep validation easy to test. */
export function readConfig(
  env: Record<string, string | undefined>,
): Config {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");

  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL.");
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname || url.pathname.length < 2
  ) {
    throw new Error("DATABASE_URL must identify a PostgreSQL host and database.");
  }

  const rawPort = env.PORT ?? "8000";
  if (!/^\d+$/.test(rawPort)) throw new Error("PORT must be an integer.");
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be between 1 and 65535.");
  }

  const hostname = (env.HOST ?? "0.0.0.0").trim();
  if (!hostname || /[\s/]/.test(hostname)) {
    throw new Error("HOST must be a valid bind address.");
  }

  return { databaseUrl, hostname, port };
}
