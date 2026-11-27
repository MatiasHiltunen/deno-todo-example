ALTER TABLE "todos" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "todos" ADD CONSTRAINT "todos_parent_id_todos_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."todos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "todos_parent_created_at_idx" ON "todos" USING btree ("parent_id","created_at","id");--> statement-breakpoint
ALTER TABLE "todos" ADD CONSTRAINT "todos_parent_not_self" CHECK ("todos"."parent_id" is null or "todos"."parent_id" <> "todos"."id");
--> statement-breakpoint
-- Take the hierarchy lock before row locks. At READ COMMITTED the volatile
-- row trigger below sees hierarchy writes committed by the previous holder.
CREATE FUNCTION "public"."lock_todo_hierarchy"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(708921735);
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "todos_hierarchy_lock"
BEFORE INSERT OR UPDATE OF "parent_id" OR DELETE ON "public"."todos"
FOR EACH STATEMENT EXECUTE FUNCTION "public"."lock_todo_hierarchy"();
--> statement-breakpoint
CREATE FUNCTION "public"."check_todo_ancestry"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- The CHECK constraint handles direct self-reference.
  IF NEW.parent_id IS NOT NULL AND NEW.parent_id <> NEW.id AND EXISTS (
    WITH RECURSIVE ancestors AS (
      SELECT id, parent_id FROM public.todos WHERE id = NEW.parent_id
      UNION
      SELECT todo.id, todo.parent_id
      FROM public.todos AS todo
      JOIN ancestors ON todo.id = ancestors.parent_id
    )
    SELECT 1 FROM ancestors WHERE id = NEW.id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'todos_parent_no_cycle',
      MESSAGE = 'A todo cannot be its own ancestor.';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "todos_parent_no_cycle"
BEFORE INSERT OR UPDATE OF "parent_id" ON "public"."todos"
FOR EACH ROW EXECUTE FUNCTION "public"."check_todo_ancestry"();
