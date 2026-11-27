import { Hono } from "hono";
import { ApiError } from "./errors.ts";
import type { TodoRepository } from "./todos/types.ts";
import { parseCreate, parseList, parseUpdate, readJson, validateId } from "./todos/validation.ts";

const publicDirectory = new URL("../public/", import.meta.url);

export function createApp(
  repository: TodoRepository,
  logError: (error: Error) => void = (error) => {
    console.error("Request failed:", error.name);
  },
) {
  const app = new Hono();

  app.use("*", async (context, next) => {
    await next();
    context.header("X-Content-Type-Options", "nosniff");
    context.header("Referrer-Policy", "no-referrer");
    context.header("X-Frame-Options", "DENY");
    context.header(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; " +
        "img-src 'self' data:; connect-src 'self'; object-src 'none'; " +
        "base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    );
    context.header("Cache-Control", "no-store");
  });

  // Explicit paths avoid exposing the filesystem through arbitrary URL input.
  for (
    const [route, file, contentType] of [
      ["/", "index.html", "text/html; charset=utf-8"],
      ["/styles.css", "styles.css", "text/css; charset=utf-8"],
      ["/app.js", "app.js", "text/javascript; charset=utf-8"],
    ]
  ) {
    app.get(route, async () => {
      const content = await Deno.readFile(new URL(file, publicDirectory));
      return new Response(content, { headers: { "Content-Type": contentType } });
    });
  }

  app.get("/health/live", (context) => context.json({ status: "ok" }));
  app.get("/health/ready", async (context) => {
    try {
      await repository.ping();
      return context.json({ status: "ok", database: "ok" });
    } catch {
      return context.json({ status: "unavailable", database: "unavailable" }, 503);
    }
  });

  app.get("/api/todos", async (context) => {
    const options = parseList(new URL(context.req.url).searchParams);
    return context.json(await repository.list(options));
  });

  app.get("/api/todos/:id", async (context) => {
    const todo = await repository.find(validateId(context.req.param("id")));
    if (!todo) throw new ApiError(404, "NOT_FOUND", "Todo not found.");
    return context.json({ data: todo });
  });

  app.post("/api/todos", async (context) => {
    const input = parseCreate(await readJson(context.req.raw));
    const todo = await repository.create(input);
    context.header("Location", `/api/todos/${todo.id}`);
    return context.json({ data: todo }, 201);
  });

  app.patch("/api/todos/:id", async (context) => {
    const id = validateId(context.req.param("id"));
    const input = parseUpdate(await readJson(context.req.raw));
    const todo = await repository.update(id, input);
    if (!todo) throw new ApiError(404, "NOT_FOUND", "Todo not found.");
    return context.json({ data: todo });
  });

  app.delete("/api/todos/:id", async (context) => {
    const deleted = await repository.delete(validateId(context.req.param("id")));
    if (!deleted) throw new ApiError(404, "NOT_FOUND", "Todo not found.");
    return context.body(null, 204);
  });

  app.notFound((context) =>
    context.json({ error: { code: "NOT_FOUND", message: "Route not found." } }, 404)
  );

  app.onError((error, context) => {
    if (error instanceof ApiError) {
      return context.json({ error: { code: error.code, message: error.message } }, error.status);
    }
    logError(error);
    return context.json({
      error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." },
    }, 500);
  });

  return app;
}
