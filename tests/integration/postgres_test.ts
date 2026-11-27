import assert from "node:assert/strict";
import { createApp } from "../../src/app.ts";
import { createDatabase } from "../../src/db/client.ts";
import type { Todo } from "../../src/todos/types.ts";
import { PostgresTodoRepository } from "../../src/todos/repository.ts";

// Require an explicit test URL so a missing setting cannot target a normal DB.
const databaseUrl = Deno.env.get("TEST_DATABASE_URL");
if (!databaseUrl) {
  throw new Error("TEST_DATABASE_URL is required for integration tests. Apply migrations first.");
}

Deno.test("PostgreSQL: CRUD, filtering, persistence, constraints, and readiness", async () => {
  const database = createDatabase(databaseUrl, 2);
  const repository = new PostgresTodoRepository(database.db);
  const app = createApp(repository);
  const ids: string[] = [];
  const marker = `Integration ${crypto.randomUUID()}`;

  try {
    assert.equal((await app.request("/health/ready")).status, 200);

    const response = await app.request("/api/todos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: marker, description: "Persistent test row" }),
    });
    assert.equal(response.status, 201);
    const created = (await response.json()).data;
    ids.push(created.id);
    assert.equal(created.completed, false);

    // A second connection proves that storage is PostgreSQL, not app memory.
    const second = createDatabase(databaseUrl, 1);
    try {
      const persisted = await new PostgresTodoRepository(second.db).find(created.id);
      assert.equal(persisted?.title, marker);
      assert.equal(persisted?.createdAt, created.createdAt);
    } finally {
      await second.close();
    }

    const update = await app.request(`/api/todos/${created.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: `${marker} updated`, completed: true }),
    });
    assert.equal(update.status, 200);
    const changed = (await update.json()).data;
    assert.equal(changed.completed, true);
    assert.equal(changed.description, "Persistent test row");
    assert.equal(changed.createdAt, created.createdAt);
    assert.ok(Date.parse(changed.updatedAt) >= Date.parse(created.updatedAt));

    const complete = await repository.list({ completed: true, limit: 100, offset: 0 });
    assert.ok(complete.data.every((todo) => todo.completed));
    assert.ok(complete.data.some((todo) => todo.id === created.id));
    assert.ok(complete.pagination.total >= 1);
    const active = await repository.list({ completed: false, limit: 100, offset: 0 });
    assert.ok(active.data.every((todo) => !todo.completed));
    assert.ok(active.data.every((todo) => todo.id !== created.id));
    const emptyPage = await repository.list({ limit: 1, offset: 2_147_483_647 });
    assert.equal(emptyPage.data.length, 0);
    assert.ok(emptyPage.pagination.total >= 1);

    // Bypass HTTP validation to verify the database constraint itself.
    await assert.rejects(
      async () => {
        const invalid = await repository.create({ title: "   ", description: "" });
        ids.push(invalid.id);
      },
    );
    await assert.rejects(
      async () => {
        const invalid = await repository.create({ title: "x".repeat(201), description: "" });
        ids.push(invalid.id);
      },
    );

    const deletion = await app.request(`/api/todos/${created.id}`, { method: "DELETE" });
    assert.equal(deletion.status, 204);
    assert.equal(await deletion.text(), "");
    assert.equal(await repository.find(created.id), undefined);
    assert.equal(await repository.delete(created.id), false);
    assert.equal(await repository.update(created.id, { completed: false }), undefined);
  } finally {
    // Never truncate the schema or remove rows created outside this test.
    try {
      for (const id of ids) await repository.delete(id);
    } finally {
      await database.close();
    }
  }
});

Deno.test("PostgreSQL: nested subtasks, moves, counts, constraints, and cascading deletion", async () => {
  const database = createDatabase(databaseUrl, 2);
  const repository = new PostgresTodoRepository(database.db);
  const app = createApp(repository);
  const ids: string[] = [];
  async function request(method: string, id: string | null, body: unknown) {
    return await app.request(id ? `/api/todos/${id}` : "/api/todos", {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  async function create(title: string, parentId: string | null = null): Promise<Todo> {
    const response = await request("POST", null, { title, parentId });
    assert.equal(response.status, 201);
    const todo = (await response.json()).data;
    ids.push(todo.id);
    return todo;
  }
  try {
    const shopping = await create(`Kauppalista ${crypto.randomUUID()}`);
    const other = await create(`Toinen lista ${crypto.randomUUID()}`);
    const milk = await create("Maito", shopping.id);
    const detail = await create("Laktoositon", milk.id);
    const bread = await create("Leipä", shopping.id);
    assert.equal(shopping.parentId, null);
    assert.equal(detail.parentId, milk.id);

    let parent = await repository.find(shopping.id);
    assert.equal(parent?.subtaskCount, 2);
    assert.equal(parent?.completedSubtaskCount, 0);
    const page = await repository.list({ parentId: shopping.id, limit: 1, offset: 1 });
    assert.equal(page.data.length, 1);
    assert.equal(page.pagination.total, 2);
    assert.ok(page.data.every((todo) => todo.parentId === shopping.id));
    const roots = await repository.list({ parentId: null, limit: 100, offset: 0 });
    assert.ok(roots.data.every((todo) => todo.parentId === null));
    assert.ok(roots.data.some((todo) => todo.id === shopping.id));
    assert.ok(roots.data.every((todo) => todo.id !== milk.id));

    let response = await request("PATCH", milk.id, { completed: true });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.parentId, shopping.id);
    const completed = await repository.list({
      parentId: shopping.id,
      completed: true,
      limit: 100,
      offset: 0,
    });
    assert.deepEqual(completed.data.map((todo) => todo.id), [milk.id]);
    parent = await repository.find(shopping.id);
    assert.equal(parent?.completedSubtaskCount, 1);
    assert.equal(parent?.completed, false);
    assert.equal((await repository.find(milk.id))?.subtaskCount, 1);
    assert.equal((await repository.find(detail.id))?.completed, false);

    await repository.update(milk.id, { parentId: other.id });
    assert.equal((await repository.find(shopping.id))?.subtaskCount, 1);
    assert.equal((await repository.find(other.id))?.subtaskCount, 1);
    assert.equal((await repository.find(detail.id))?.parentId, milk.id);
    const detached = await repository.update(milk.id, { parentId: null });
    assert.equal(detached?.parentId, null);
    await repository.update(milk.id, { parentId: shopping.id });

    for (const parentId of [shopping.id, milk.id, detail.id, crypto.randomUUID()]) {
      response = await request("PATCH", shopping.id, { parentId });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error.code, "VALIDATION_ERROR");
    }
    assert.equal((await repository.find(shopping.id))?.parentId, null);
    response = await request("POST", null, {
      title: "Missing parent",
      parentId: crypto.randomUUID(),
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "VALIDATION_ERROR");

    // These writes bypass API validation and the repository entirely.
    const selfId = crypto.randomUUID();
    await assert.rejects(
      () =>
        database.client`insert into todos (id, parent_id, title)
        values (${selfId}, ${selfId}, 'Invalid self-reference')`,
      (error: unknown) => {
        assert.equal((error as { code: string }).code, "23514");
        return true;
      },
    );
    await assert.rejects(
      () => database.client`update todos set parent_id = ${detail.id} where id = ${shopping.id}`,
      (error: unknown) => {
        assert.equal(
          (error as { constraint_name: string }).constraint_name,
          "todos_parent_no_cycle",
        );
        return true;
      },
    );
    await assert.rejects(
      () =>
        database.client`update todos set parent_id = case
        when id = ${shopping.id} then ${other.id}::uuid else ${shopping.id}::uuid end
        where id in (${shopping.id}, ${other.id})`,
    );

    assert.equal(await repository.delete(shopping.id), true);
    for (const id of [shopping.id, milk.id, detail.id, bread.id]) {
      assert.equal(await repository.find(id), undefined);
    }
    assert.ok(await repository.find(other.id));
  } finally {
    try {
      for (const id of ids) await repository.delete(id);
    } finally {
      await database.close();
    }
  }
});

Deno.test("PostgreSQL: concurrent opposite moves cannot create a cycle", async () => {
  const database = createDatabase(databaseUrl, 2);
  const second = createDatabase(databaseUrl, 1);
  const repository = new PostgresTodoRepository(database.db);
  const app = createApp(new PostgresTodoRepository(second.db));
  const ids: string[] = [];
  let pending: Promise<Response> | undefined;
  try {
    const first = await repository.create({ title: "Concurrent A", description: "" });
    ids.push(first.id);
    const other = await repository.create({ title: "Concurrent B", description: "" });
    ids.push(other.id);
    await database.client.begin(async (transaction) => {
      await transaction`update todos set parent_id = ${other.id} where id = ${first.id}`;
      let finished = false;
      pending = Promise.resolve(app.request(`/api/todos/${other.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ parentId: first.id }),
      })).then((response) => {
        finished = true;
        return response;
      });
      await transaction`select pg_sleep(0.2)`;
      assert.equal(
        finished,
        false,
        "The second hierarchy write must wait for the first transaction.",
      );
    });
    assert.ok(pending);
    const response = await pending;
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "VALIDATION_ERROR");
    assert.equal((await repository.find(first.id))?.parentId, other.id);
    assert.equal((await repository.find(other.id))?.parentId, null);
  } finally {
    try {
      await pending;
      for (const id of ids) await repository.delete(id);
    } finally {
      await second.close();
      await database.close();
    }
  }
});
