import { and, count, desc, eq, getTableColumns, getTableName, isNull, sql } from "drizzle-orm";
import type { Database } from "../db/client.ts";
import { todos } from "../db/schema.ts";
import { ApiError } from "../errors.ts";
import type { CreateTodo, ListTodos, Todo, TodoPage, TodoRepository, UpdateTodo } from "./types.ts";

// Scalar subqueries keep each response and its direct-child counts in one snapshot.
// Explicit identifiers retain the outer qualification in single-table RETURNING too.
const outerId = sql`${sql.identifier(getTableName(todos))}.${sql.identifier(todos.id.name)}`;
const selection = {
  ...getTableColumns(todos),
  subtaskCount: sql<number>`(select count(*)::int from ${todos} as child
    where child.parent_id = ${outerId})`,
  completedSubtaskCount: sql<number>`(select count(*)::int from ${todos} as child
    where child.parent_id = ${outerId} and child.completed)`,
};

function serialize(
  row: typeof todos.$inferSelect & { subtaskCount: number; completedSubtaskCount: number },
): Todo {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function hierarchyError(error: unknown): never {
  // Drizzle wraps the original postgres.js error in a query error.
  const cause = error instanceof Error && error.cause ? error.cause : error;
  if (typeof cause === "object" && cause !== null && "code" in cause) {
    const constraint = "constraint_name" in cause ? cause.constraint_name : undefined;
    if (cause.code === "23503" && constraint === "todos_parent_id_todos_id_fk") {
      throw new ApiError(400, "VALIDATION_ERROR", "The parent todo does not exist.");
    }
    if (
      cause.code === "23514" &&
      (constraint === "todos_parent_not_self" || constraint === "todos_parent_no_cycle")
    ) {
      throw new ApiError(400, "VALIDATION_ERROR", "A todo cannot be its own ancestor.");
    }
  }
  throw error;
}

export class PostgresTodoRepository implements TodoRepository {
  constructor(private readonly db: Database) {}

  async list(options: ListTodos): Promise<TodoPage> {
    const condition = and(
      options.completed === undefined ? undefined : eq(todos.completed, options.completed),
      options.parentId === undefined
        ? undefined
        : options.parentId === null
        ? isNull(todos.parentId)
        : eq(todos.parentId, options.parentId),
    );

    // One transaction gives rows and count a consistent view during writes.
    return await this.db.transaction(async (tx) => {
      const rows = await tx.select(selection).from(todos).where(condition)
        .orderBy(desc(todos.createdAt), desc(todos.id))
        .limit(options.limit).offset(options.offset);
      const [result] = await tx.select({ total: count() }).from(todos)
        .where(condition);
      return {
        data: rows.map(serialize),
        pagination: {
          limit: options.limit,
          offset: options.offset,
          total: result.total,
        },
      };
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
  }

  async find(id: string): Promise<Todo | undefined> {
    const [row] = await this.db.select(selection).from(todos).where(eq(todos.id, id))
      .limit(1);
    return row ? serialize(row) : undefined;
  }

  async create(input: CreateTodo): Promise<Todo> {
    try {
      const [row] = await this.db.insert(todos).values(input).returning(selection);
      return serialize(row);
    } catch (error) {
      hierarchyError(error);
    }
  }

  async update(id: string, input: UpdateTodo): Promise<Todo | undefined> {
    try {
      const [row] = await this.db.update(todos)
        .set({ ...input, updatedAt: sql`clock_timestamp()` })
        .where(eq(todos.id, id)).returning(selection);
      return row ? serialize(row) : undefined;
    } catch (error) {
      hierarchyError(error);
    }
  }

  async delete(id: string): Promise<boolean> {
    const rows = await this.db.delete(todos).where(eq(todos.id, id))
      .returning({ id: todos.id });
    return rows.length > 0;
  }

  async ping(): Promise<void> {
    // Check the application table too: a reachable, unmigrated DB is not ready.
    await this.db.execute(sql`select ${todos.parentId} from ${todos} limit 1`);
  }
}
