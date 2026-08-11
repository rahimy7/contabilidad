CREATE TYPE "public"."ecf_approval_status" AS ENUM('pendiente', 'aceptado', 'rechazado');--> statement-breakpoint
CREATE TYPE "public"."ecf_environment" AS ENUM('simulated', 'test', 'cert', 'prod');--> statement-breakpoint
CREATE TABLE "ecf_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"environment" "ecf_environment" DEFAULT 'simulated' NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"issuer_name" text,
	"issuer_rnc" varchar(11),
	"trade_name" text,
	"address" text,
	"phone" text,
	"email" text,
	"logo_url" text,
	"certificate_private_key" text,
	"certificate_pem" text,
	"certificate_fingerprint" text,
	"certificate_subject" text,
	"certificate_expires_at" timestamp with time zone,
	"rfce_threshold" numeric(18, 4) DEFAULT '250000' NOT NULL,
	"max_transmit_attempts" integer DEFAULT 8 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ecf_received" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"encf" varchar(19) NOT NULL,
	"ecf_type" varchar(3) NOT NULL,
	"issuer_rnc" varchar(11) NOT NULL,
	"issuer_name" text,
	"buyer_rnc" varchar(11),
	"emitted_at" timestamp with time zone,
	"currency" char(3) DEFAULT 'DOP' NOT NULL,
	"subtotal_taxed" numeric(18, 4) DEFAULT '0' NOT NULL,
	"subtotal_exempt" numeric(18, 4) DEFAULT '0' NOT NULL,
	"total_itbis" numeric(18, 4) DEFAULT '0' NOT NULL,
	"total" numeric(18, 4) DEFAULT '0' NOT NULL,
	"security_code" varchar(12),
	"xml_received" text,
	"signature_valid" boolean,
	"acknowledged_at" timestamp with time zone,
	"approval_status" "ecf_approval_status" DEFAULT 'pendiente' NOT NULL,
	"approval_reason" text,
	"approved_at" timestamp with time zone,
	"approved_by" integer,
	"purchase_document_id" bigint,
	"supplier_id" integer,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ecf_sequence_voids" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"ecf_type" varchar(3) NOT NULL,
	"range_from" bigint NOT NULL,
	"range_to" bigint NOT NULL,
	"reason" text,
	"status" text DEFAULT 'pendiente' NOT NULL,
	"track_id" text,
	"xml_signed" text,
	"voided_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "ecf_sequence_voids_range_ck" CHECK ("ecf_sequence_voids"."range_to" >= "ecf_sequence_voids"."range_from")
);
--> statement-breakpoint
CREATE TABLE "ecf_simulator_inbox" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"track_id" text NOT NULL,
	"issuer_rnc" varchar(11) NOT NULL,
	"encf" varchar(19) NOT NULL,
	"ecf_type" varchar(3),
	"buyer_rnc" varchar(11),
	"total" numeric(18, 4) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'en_proceso' NOT NULL,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"xml_received" text,
	"resolves_at" timestamp with time zone,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ecf_transmissions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"document_id" bigint NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now(),
	"last_error" text,
	"track_id" text,
	"dgii_status" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ecf_config" ADD CONSTRAINT "ecf_config_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecf_received" ADD CONSTRAINT "ecf_received_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecf_received" ADD CONSTRAINT "ecf_received_purchase_document_id_fiscal_documents_id_fk" FOREIGN KEY ("purchase_document_id") REFERENCES "public"."fiscal_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecf_received" ADD CONSTRAINT "ecf_received_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecf_sequence_voids" ADD CONSTRAINT "ecf_sequence_voids_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecf_transmissions" ADD CONSTRAINT "ecf_transmissions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecf_transmissions" ADD CONSTRAINT "ecf_transmissions_document_id_fiscal_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."fiscal_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ecf_config_company_uq" ON "ecf_config" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ecf_received_uq" ON "ecf_received" USING btree ("company_id","issuer_rnc","encf");--> statement-breakpoint
CREATE INDEX "ecf_received_approval_idx" ON "ecf_received" USING btree ("company_id","approval_status");--> statement-breakpoint
CREATE INDEX "ecf_received_date_idx" ON "ecf_received" USING btree ("company_id","emitted_at");--> statement-breakpoint
CREATE INDEX "ecf_sequence_voids_idx" ON "ecf_sequence_voids" USING btree ("company_id","ecf_type");--> statement-breakpoint
CREATE UNIQUE INDEX "ecf_simulator_track_uq" ON "ecf_simulator_inbox" USING btree ("track_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ecf_simulator_encf_uq" ON "ecf_simulator_inbox" USING btree ("issuer_rnc","encf");--> statement-breakpoint
CREATE UNIQUE INDEX "ecf_transmissions_doc_uq" ON "ecf_transmissions" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "ecf_transmissions_due_idx" ON "ecf_transmissions" USING btree ("state","next_attempt_at");