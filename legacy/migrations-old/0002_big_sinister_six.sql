CREATE TABLE "exchange_rates" (
	"id" serial PRIMARY KEY NOT NULL,
	"base_currency" text NOT NULL,
	"target_currency" text NOT NULL,
	"rate" numeric(10, 6) NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT true,
	"store_id" integer NOT NULL,
	"updated_by" integer
);
--> statement-breakpoint
CREATE TABLE "notification_channels" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_enabled" boolean DEFAULT true,
	"settings" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"channel_id" integer NOT NULL,
	"is_enabled" boolean DEFAULT true,
	"recipient_type" text NOT NULL,
	"custom_recipients" text[],
	"template" text NOT NULL,
	"priority" text DEFAULT 'normal',
	"delay_minutes" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"event_name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"config_id" integer,
	"order_id" integer,
	"recipient_id" integer,
	"recipient_type" text NOT NULL,
	"channel" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"status" text DEFAULT 'pending',
	"sent_at" timestamp,
	"delivered_at" timestamp,
	"error_message" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_brands" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"logo" text,
	"website" text,
	"country_of_origin" text,
	"is_active" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "assignment_rules" RENAME COLUMN "use_location_based" TO "required_municipality";--> statement-breakpoint
ALTER TABLE "assignment_rules" RENAME COLUMN "max_distance_km" TO "allow_adjacent_municipalities";--> statement-breakpoint
ALTER TABLE "employee_profiles" RENAME COLUMN "territory" TO "province";--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "customer_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "priority" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "total_amount" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "total_amount" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "assignment_rules" ADD COLUMN "use_sector_based" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "assignment_rules" ADD COLUMN "required_province" text;--> statement-breakpoint
ALTER TABLE "assignment_rules" ADD COLUMN "required_sectors" text[];--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_registration_flows" ADD COLUMN "flow_type" text;--> statement-breakpoint
ALTER TABLE "customer_registration_flows" ADD COLUMN "order_id" integer;--> statement-breakpoint
ALTER TABLE "customer_registration_flows" ADD COLUMN "order_number" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "email" text NOT NULL;--> statement-breakpoint
ALTER TABLE "employee_profiles" ADD COLUMN "municipality" text;--> statement-breakpoint
ALTER TABLE "employee_profiles" ADD COLUMN "sector" text;--> statement-breakpoint
ALTER TABLE "employee_profiles" ADD COLUMN "coverage_provinces" text[];--> statement-breakpoint
ALTER TABLE "employee_profiles" ADD COLUMN "coverage_municipalities" text[];--> statement-breakpoint
ALTER TABLE "employee_profiles" ADD COLUMN "coverage_sectors" text[];--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "isFromCustomer" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "store_id" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_province" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_municipality" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_sector" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_address" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_latitude" numeric(10, 8);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_longitude" numeric(11, 8);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "assigned_rule_id" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "auto_assigned" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "assignment_attempts" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "service_type" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "scheduled_date" timestamp;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "completed_date" timestamp;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "base_currency" text NOT NULL;--> statement-breakpoint
ALTER TABLE "virtual_stores" ADD COLUMN "phone_number_id" text;--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_configs" ADD CONSTRAINT "notification_configs_event_id_notification_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."notification_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_configs" ADD CONSTRAINT "notification_configs_channel_id_notification_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."notification_channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_history" ADD CONSTRAINT "notification_history_config_id_notification_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."notification_configs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_registration_flows" ADD CONSTRAINT "customer_registration_flows_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_assigned_rule_id_assignment_rules_id_fk" FOREIGN KEY ("assigned_rule_id") REFERENCES "public"."assignment_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "notes";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "store_id";--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_email_unique" UNIQUE("email");