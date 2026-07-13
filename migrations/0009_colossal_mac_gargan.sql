CREATE TABLE "ap_applications" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"payment_id" bigint NOT NULL,
	"open_item_id" bigint NOT NULL,
	"amount" numeric(18, 4) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ap_open_items" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"supplier_id" integer,
	"document_id" bigint,
	"issue_date" date NOT NULL,
	"due_date" date NOT NULL,
	"currency" char(3) DEFAULT 'DOP' NOT NULL,
	"original_amount" numeric(18, 4) NOT NULL,
	"balance" numeric(18, 4) NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ap_payments" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"supplier_id" integer,
	"payment_date" date NOT NULL,
	"currency" char(3) DEFAULT 'DOP' NOT NULL,
	"amount" numeric(18, 4) NOT NULL,
	"method" text DEFAULT 'transfer' NOT NULL,
	"reference" text,
	"journal_entry_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ar_applications" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"receipt_id" bigint NOT NULL,
	"open_item_id" bigint NOT NULL,
	"amount" numeric(18, 4) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ar_open_items" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"customer_id" integer,
	"document_id" bigint,
	"issue_date" date NOT NULL,
	"due_date" date NOT NULL,
	"currency" char(3) DEFAULT 'DOP' NOT NULL,
	"original_amount" numeric(18, 4) NOT NULL,
	"balance" numeric(18, 4) NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ar_receipts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"customer_id" integer,
	"receipt_date" date NOT NULL,
	"currency" char(3) DEFAULT 'DOP' NOT NULL,
	"amount" numeric(18, 4) NOT NULL,
	"method" text DEFAULT 'cash' NOT NULL,
	"reference" text,
	"journal_entry_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ap_applications" ADD CONSTRAINT "ap_applications_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_applications" ADD CONSTRAINT "ap_applications_payment_id_ap_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."ap_payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_applications" ADD CONSTRAINT "ap_applications_open_item_id_ap_open_items_id_fk" FOREIGN KEY ("open_item_id") REFERENCES "public"."ap_open_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_open_items" ADD CONSTRAINT "ap_open_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_open_items" ADD CONSTRAINT "ap_open_items_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_open_items" ADD CONSTRAINT "ap_open_items_document_id_fiscal_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."fiscal_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_payments" ADD CONSTRAINT "ap_payments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_payments" ADD CONSTRAINT "ap_payments_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ap_payments" ADD CONSTRAINT "ap_payments_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ar_applications" ADD CONSTRAINT "ar_applications_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ar_applications" ADD CONSTRAINT "ar_applications_receipt_id_ar_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."ar_receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ar_applications" ADD CONSTRAINT "ar_applications_open_item_id_ar_open_items_id_fk" FOREIGN KEY ("open_item_id") REFERENCES "public"."ar_open_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ar_open_items" ADD CONSTRAINT "ar_open_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ar_open_items" ADD CONSTRAINT "ar_open_items_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ar_open_items" ADD CONSTRAINT "ar_open_items_document_id_fiscal_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."fiscal_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ar_receipts" ADD CONSTRAINT "ar_receipts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ar_receipts" ADD CONSTRAINT "ar_receipts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ar_receipts" ADD CONSTRAINT "ar_receipts_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ap_applications_payment_idx" ON "ap_applications" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "ap_open_items_supplier_idx" ON "ap_open_items" USING btree ("company_id","supplier_id","status");--> statement-breakpoint
CREATE INDEX "ap_open_items_due_idx" ON "ap_open_items" USING btree ("company_id","due_date");--> statement-breakpoint
CREATE INDEX "ap_payments_supplier_idx" ON "ap_payments" USING btree ("company_id","supplier_id");--> statement-breakpoint
CREATE INDEX "ar_applications_receipt_idx" ON "ar_applications" USING btree ("receipt_id");--> statement-breakpoint
CREATE INDEX "ar_open_items_customer_idx" ON "ar_open_items" USING btree ("company_id","customer_id","status");--> statement-breakpoint
CREATE INDEX "ar_open_items_due_idx" ON "ar_open_items" USING btree ("company_id","due_date");--> statement-breakpoint
CREATE INDEX "ar_receipts_customer_idx" ON "ar_receipts" USING btree ("company_id","customer_id");