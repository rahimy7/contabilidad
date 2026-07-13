DROP INDEX "accounting_outbox_pending_idx";--> statement-breakpoint
ALTER TABLE "accounting_outbox" ADD COLUMN "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "accounting_outbox_pending_idx" ON "accounting_outbox" USING btree ("status","next_attempt_at");