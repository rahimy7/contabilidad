ALTER TABLE "consolidation_lines" ADD COLUMN "is_elimination" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "consolidation_lines" ADD COLUMN "note" text;