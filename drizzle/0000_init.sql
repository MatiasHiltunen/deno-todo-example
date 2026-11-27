CREATE TABLE "todos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" varchar(2000) DEFAULT '' NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "todos_title_not_blank" CHECK (char_length(btrim("todos"."title")) > 0)
);
--> statement-breakpoint
CREATE INDEX "todos_created_at_idx" ON "todos" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "todos_completed_created_at_idx" ON "todos" USING btree ("completed","created_at","id");