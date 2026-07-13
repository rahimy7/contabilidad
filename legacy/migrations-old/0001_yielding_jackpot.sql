ALTER TABLE "auto_responses" ADD COLUMN "store_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "auto_responses" ADD COLUMN "message" text NOT NULL;--> statement-breakpoint
ALTER TABLE "auto_responses" ADD COLUMN "is_interactive" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "auto_responses" ADD COLUMN "interactive_data" jsonb;--> statement-breakpoint
ALTER TABLE "auto_responses" ADD COLUMN "trigger_text" text;--> statement-breakpoint
ALTER TABLE "product_categories" ADD COLUMN "store_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_login" timestamp;