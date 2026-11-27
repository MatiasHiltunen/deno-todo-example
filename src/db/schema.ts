import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/** The single source of truth for generated SQL migrations. */
export const todos = pgTable("todos", {
  id: uuid("id").primaryKey().defaultRandom(),
  parentId: uuid("parent_id").references((): AnyPgColumn => todos.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 200 }).notNull(),
  description: varchar("description", { length: 2000 }).notNull().default(""),
  completed: boolean("completed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
    .defaultNow(),
}, (table) => [
  check("todos_title_not_blank", sql`char_length(btrim(${table.title})) > 0`),
  check(
    "todos_parent_not_self",
    sql`${table.parentId} is null or ${table.parentId} <> ${table.id}`,
  ),
  index("todos_parent_created_at_idx").on(table.parentId, table.createdAt, table.id),
  index("todos_created_at_idx").on(table.createdAt, table.id),
  index("todos_completed_created_at_idx").on(
    table.completed,
    table.createdAt,
    table.id,
  ),
]);
