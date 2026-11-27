import assert from "node:assert/strict";
import { createApp } from "../../src/app.ts";
import type {
  CreateTodo,
  ListTodos,
  Todo,
  TodoRepository,
  UpdateTodo,
} from "../../src/todos/types.ts";

class MemoryRepository implements TodoRepository {
  readonly rows = new Map<string, Todo>();
  available = true;

  private withCounts(todo: Todo): Todo {
    const children = [...this.rows.values()].filter((child) => child.parentId === todo.id);
    return {
      ...todo,
      subtaskCount: children.length,
      completedSubtaskCount: children.filter((child) => child.completed).length,
    };
  }

  list({ completed, parentId, limit, offset }: ListTodos) {
    const rows = [...this.rows.values()].filter((todo) =>
      (completed === undefined || todo.completed === completed) &&
      (parentId === undefined || todo.parentId === parentId)
    ).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    return Promise.resolve({
      data: rows.slice(offset, offset + limit).map((todo) => this.withCounts(todo)),
      pagination: { limit, offset, total: rows.length },
    });
  }

  find(id: string) {
    const todo = this.rows.get(id);
    return Promise.resolve(todo ? this.withCounts(todo) : undefined);
  }

  create(input: CreateTodo) {
    const todo: Todo = {
      id: crypto.randomUUID(),
      ...input,
      parentId: input.parentId ?? null,
      completed: false,
      subtaskCount: 0,
      completedSubtaskCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.rows.set(todo.id, todo);
    return Promise.resolve(this.withCounts(todo));
  }

  update(id: string, input: UpdateTodo) {
    const original = this.rows.get(id);
    if (!original) return Promise.resolve(undefined);
    const todo = { ...original, ...input, updatedAt: new Date().toISOString() };
    this.rows.set(id, todo);
    return Promise.resolve(this.withCounts(todo));
  }

  delete(id: string) {
    for (const child of this.rows.values()) {
      if (child.parentId === id) this.delete(child.id);
    }
    return Promise.resolve(this.rows.delete(id));
  }

  ping() {
    return this.available ? Promise.resolve() : Promise.reject(new Error("Database unavailable"));
  }
}

function setup() {
  const repository = new MemoryRepository();
  const errors: Error[] = [];
  return {
    repository,
    errors,
    app: createApp(repository, (error) => errors.push(error)),
  };
}

function jsonRequest(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

Deno.test("HTTP: create, read, edit, complete, filter, and delete a todo", async () => {
  const { app } = setup();
  const created = await app.request(
    "/api/todos",
    jsonRequest("POST", {
      title: "  Toteuta sovellus  ",
      description: "Deno + PostgreSQL",
    }),
  );
  assert.equal(created.status, 201);
  const { data: todo } = await created.json();
  assert.match(todo.id, /^[0-9a-f-]{36}$/);
  assert.equal(todo.title, "Toteuta sovellus");
  assert.equal(todo.description, "Deno + PostgreSQL");
  assert.equal(todo.completed, false);
  assert.equal(todo.parentId, null);
  assert.equal(todo.subtaskCount, 0);
  assert.equal(todo.completedSubtaskCount, 0);
  assert.ok(!Number.isNaN(Date.parse(todo.createdAt)));
  assert.ok(!Number.isNaN(Date.parse(todo.updatedAt)));
  assert.equal(created.headers.get("location"), `/api/todos/${todo.id}`);

  const read = await app.request(`/api/todos/${todo.id}`);
  assert.equal(read.status, 200);
  assert.deepEqual((await read.json()).data, todo);

  const updated = await app.request(
    `/api/todos/${todo.id}`,
    jsonRequest("PATCH", {
      title: "Valmis sovellus",
      description: "",
      completed: true,
    }),
  );
  assert.equal(updated.status, 200);
  const changed = (await updated.json()).data;
  assert.equal(changed.title, "Valmis sovellus");
  assert.equal(changed.description, "");
  assert.equal(changed.completed, true);
  assert.equal(changed.createdAt, todo.createdAt);

  const completed = await app.request("/api/todos?completed=true&limit=5&offset=0");
  assert.deepEqual(await completed.json(), {
    data: [changed],
    pagination: { limit: 5, offset: 0, total: 1 },
  });
  const active = await app.request("/api/todos?completed=false");
  assert.equal((await active.json()).data.length, 0);

  const removed = await app.request(`/api/todos/${todo.id}`, { method: "DELETE" });
  assert.equal(removed.status, 204);
  assert.equal(await removed.text(), "");
  assert.equal((await app.request(`/api/todos/${todo.id}`)).status, 404);
});

Deno.test("HTTP: POST defaults description; PATCH preserves unspecified values", async () => {
  const { app } = setup();
  const response = await app.request("/api/todos", jsonRequest("POST", { title: "A" }));
  const { data: todo } = await response.json();
  assert.equal(todo.description, "");
  const result = await app.request(
    `/api/todos/${todo.id}`,
    jsonRequest("PATCH", {
      completed: true,
    }),
  );
  const { data: updated } = await result.json();
  assert.equal(updated.title, "A");
  assert.equal(updated.description, "");
  assert.equal(updated.completed, true);
});

Deno.test("HTTP: nested subtasks, parent filters, counts, moving, and cascade deletion", async () => {
  const { app } = setup();
  async function create(title: string, parentId: string | null = null): Promise<Todo> {
    const response = await app.request("/api/todos", jsonRequest("POST", { title, parentId }));
    assert.equal(response.status, 201);
    return (await response.json()).data;
  }
  const shopping = await create("Kauppalista");
  const milk = await create("Maito", shopping.id.toUpperCase());
  const detail = await create("Laktoositon", milk.id);
  assert.equal(milk.parentId, shopping.id);
  assert.equal(detail.parentId, milk.id);

  let response = await app.request("/api/todos?parentId=null");
  let body = await response.json();
  assert.equal(body.pagination.total, 1);
  assert.equal(body.data[0].id, shopping.id);
  assert.equal(body.data[0].subtaskCount, 1);
  assert.equal(body.data[0].completedSubtaskCount, 0);

  response = await app.request(`/api/todos?parentId=${shopping.id}&limit=1&offset=0`);
  body = await response.json();
  assert.equal(body.pagination.total, 1);
  assert.equal(body.data[0].id, milk.id);
  assert.equal(body.data[0].subtaskCount, 1);
  // Leaving parentId out preserves the existing flat API behavior.
  assert.equal((await (await app.request("/api/todos")).json()).pagination.total, 3);

  response = await app.request(`/api/todos/${milk.id}`, jsonRequest("PATCH", { completed: true }));
  assert.equal((await response.json()).data.parentId, shopping.id);
  body = await (await app.request(`/api/todos?parentId=${shopping.id}&completed=false`)).json();
  assert.equal(body.pagination.total, 0);
  body = await (await app.request(`/api/todos?parentId=${shopping.id}&completed=true`)).json();
  assert.equal(body.data[0].id, milk.id);
  const parent = (await (await app.request(`/api/todos/${shopping.id}`)).json()).data;
  assert.equal(parent.completed, false);
  assert.equal(parent.completedSubtaskCount, 1);

  response = await app.request(`/api/todos/${milk.id}`, jsonRequest("PATCH", { parentId: null }));
  assert.equal((await response.json()).data.parentId, null);
  assert.equal((await (await app.request("/api/todos?parentId=null")).json()).pagination.total, 2);
  response = await app.request(
    `/api/todos/${milk.id}`,
    jsonRequest("PATCH", { parentId: shopping.id }),
  );
  assert.equal(response.status, 200);
  assert.equal((await app.request(`/api/todos/${shopping.id}`, { method: "DELETE" })).status, 204);
  assert.equal((await app.request(`/api/todos/${milk.id}`)).status, 404);
  assert.equal((await app.request(`/api/todos/${detail.id}`)).status, 404);
});

for (
  const [label, body] of [
    ["missing title", {}],
    ["blank title", { title: " \t\n " }],
    ["long title", { title: "a".repeat(201) }],
    ["wrong title type", { title: 4 }],
    ["NUL in title", { title: "A\u0000B" }],
    ["null description", { title: "A", description: null }],
    ["NUL in description", { title: "A", description: "A\u0000B" }],
    ["long description", { title: "A", description: "a".repeat(2001) }],
    ["unknown field", { title: "A", admin: true }],
    ["completed on create", { title: "A", completed: true }],
    ["invalid parent UUID", { title: "A", parentId: "not-a-uuid" }],
    ["empty parent UUID", { title: "A", parentId: "" }],
    ["wrong parent type", { title: "A", parentId: 42 }],
    ["readonly subtask count", { title: "A", subtaskCount: 1 }],
    ["array body", []],
    ["null body", null],
  ] as const
) {
  Deno.test(`HTTP: reject ${label}`, async () => {
    const { app, repository } = setup();
    const response = await app.request("/api/todos", jsonRequest("POST", body));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "VALIDATION_ERROR");
    assert.equal(repository.rows.size, 0);
  });
}

Deno.test("HTTP: PATCH rejects empty object, null, strings as booleans and readonly fields", async () => {
  const { app } = setup();
  const id = crypto.randomUUID();
  for (
    const input of [
      {},
      null,
      { completed: "false" },
      { id },
      { createdAt: "now" },
      { parentId: "null" },
      { parentId: false },
      { completedSubtaskCount: 2 },
    ]
  ) {
    const response = await app.request(`/api/todos/${id}`, jsonRequest("PATCH", input));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "VALIDATION_ERROR");
  }
});

Deno.test("HTTP: malformed JSON and unsupported media types are distinct errors", async () => {
  const { app } = setup();
  const invalid = await app.request("/api/todos", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{bad json}",
  });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error.code, "INVALID_JSON");
  const wrongType = await app.request("/api/todos", {
    method: "POST",
    body: '{"title":"A"}',
  });
  assert.equal(wrongType.status, 415);
  assert.equal((await wrongType.json()).error.code, "UNSUPPORTED_MEDIA_TYPE");
});

Deno.test("HTTP: actual JSON size is limited without Content-Length", async () => {
  const { app } = setup();
  const response = await app.request(
    "/api/todos",
    jsonRequest("POST", {
      title: "A",
      description: "a".repeat(17 * 1024),
    }),
  );
  assert.equal(response.status, 413);
  assert.equal((await response.json()).error.code, "PAYLOAD_TOO_LARGE");
});

Deno.test("HTTP: JSON content type accepts charset; Unicode limits count codepoints", async () => {
  const { app } = setup();
  const response = await app.request("/api/todos", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ title: "🦕".repeat(200) }),
  });
  assert.equal(response.status, 201);
  assert.equal(Array.from((await response.json()).data.title).length, 200);
});

Deno.test("HTTP: validate query fields, duplicates and numeric bounds", async () => {
  const { app } = setup();
  for (
    const query of [
      "completed=1",
      "completed=",
      "limit=0",
      "limit=101",
      "limit=1.5",
      "offset=-1",
      "offset=2147483648",
      "offset=nope",
      "limit=1&limit=2",
      "sort=id",
      "parentId=",
      "parentId=undefined",
      "parentId=1",
      "parentId=null&parentId=null",
    ]
  ) {
    const response = await app.request(`/api/todos?${query}`);
    assert.equal(response.status, 400, query);
    assert.equal((await response.json()).error.code, "VALIDATION_ERROR");
  }
});

Deno.test("HTTP: pagination reports total and applies offset", async () => {
  const { app, repository } = setup();
  for (const title of ["A", "B", "C"]) await repository.create({ title, description: "" });
  const response = await app.request("/api/todos?limit=2&offset=2");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.length, 1);
  assert.deepEqual(body.pagination, { limit: 2, offset: 2, total: 3 });
});

Deno.test("HTTP: validate IDs and return 404 for missing resources", async () => {
  const { app } = setup();
  const id = crypto.randomUUID();
  for (const method of ["GET", "PATCH", "DELETE"]) {
    const init = method === "PATCH" ? jsonRequest(method, { completed: true }) : { method };
    const invalid = await app.request("/api/todos/not-a-uuid", init);
    assert.equal(invalid.status, 400);
    await invalid.json();
    const missing = await app.request(`/api/todos/${id}`, init);
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).error.code, "NOT_FOUND");
  }
  const missingRoute = await app.request("/unknown");
  assert.equal(missingRoute.status, 404);
  assert.equal((await missingRoute.json()).error.code, "NOT_FOUND");
});

Deno.test("HTTP: liveness survives an unavailable DB; readiness returns 503", async () => {
  const { app, repository } = setup();
  let response = await app.request("/health/ready");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok", database: "ok" });
  repository.available = false;
  response = await app.request("/health/ready");
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { status: "unavailable", database: "unavailable" });
  response = await app.request("/health/live");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
});

Deno.test("HTTP: internal failures hide details and retain security headers", async () => {
  const { app, repository, errors } = setup();
  repository.list = () => Promise.reject(new Error("database password=secret"));
  const response = await app.request("/api/todos");
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." },
  });
  assert.equal(errors.length, 1);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(response.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
});
