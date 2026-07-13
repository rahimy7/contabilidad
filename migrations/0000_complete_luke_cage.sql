CREATE TYPE "public"."account_type" AS ENUM('asset', 'liability', 'equity', 'income', 'expense');--> statement-breakpoint
CREATE TYPE "public"."journal_status" AS ENUM('draft', 'posted', 'reversed', 'void');--> statement-breakpoint
CREATE TYPE "public"."normal_side" AS ENUM('D', 'C');--> statement-breakpoint
CREATE TYPE "public"."period_status" AS ENUM('open', 'soft_closed', 'closed', 'reopened');--> statement-breakpoint
CREATE TYPE "public"."ecf_status" AS ENUM('pendiente', 'firmado', 'enviado', 'aceptado', 'aceptado_condicional', 'rechazado', 'en_contingencia', 'anulado');--> statement-breakpoint
CREATE TYPE "public"."fiscal_doc_status" AS ENUM('draft', 'issued', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."fiscal_doc_type" AS ENUM('invoice', 'credit_note', 'debit_note', 'receipt', 'purchase');--> statement-breakpoint
CREATE TABLE "companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer,
	"legal_name" text NOT NULL,
	"trade_name" text,
	"rnc" varchar(11) NOT NULL,
	"fiscal_regime" text DEFAULT 'ordinario' NOT NULL,
	"functional_currency" char(3) DEFAULT 'DOP' NOT NULL,
	"economic_activity_code" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_consolidation_map" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"company_id" integer NOT NULL,
	"ownership_pct" numeric(7, 4) DEFAULT '1.0000' NOT NULL,
	"consol_method" text DEFAULT 'full' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"base_currency" char(3) DEFAULT 'DOP' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"company_id" integer NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"conversation_id" integer NOT NULL,
	"customer_id" integer NOT NULL,
	"customer_phone" text NOT NULL,
	"is_active" boolean DEFAULT true,
	"mode" text DEFAULT 'assistant',
	"conversation_context" text,
	"current_intent" text,
	"draft_order_id" integer,
	"cart_items" text,
	"pending_product_selection" text,
	"pending_products_by_index" text,
	"message_count" integer DEFAULT 0,
	"last_message_at" timestamp,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_credits" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"total_credits" integer DEFAULT 0 NOT NULL,
	"used_credits" integer DEFAULT 0 NOT NULL,
	"available_credits" integer DEFAULT 0 NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"auto_recharge" boolean DEFAULT false,
	"recharge_threshold" integer DEFAULT 100,
	"recharge_amount" integer DEFAULT 1000,
	"cost_per_message" integer DEFAULT 1,
	"cost_per_order" integer DEFAULT 5,
	"cost_per_voice_note" integer DEFAULT 10,
	"fallback_when_no_credits" boolean DEFAULT true,
	"notify_low_credits" boolean DEFAULT true,
	"low_credit_threshold" integer DEFAULT 50,
	"total_messages_processed" integer DEFAULT 0,
	"total_orders_created" integer DEFAULT 0,
	"total_voice_notes_transcribed" integer DEFAULT 0,
	"last_recharge" timestamp,
	"last_usage" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ai_credits_store_id_unique" UNIQUE("store_id")
);
--> statement-breakpoint
CREATE TABLE "ai_product_matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"search_query" text NOT NULL,
	"normalized_query" text NOT NULL,
	"matched_products" text NOT NULL,
	"match_count" integer DEFAULT 0,
	"confidence" numeric(3, 2),
	"times_used" integer DEFAULT 1,
	"last_used_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "ai_usage_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"conversation_id" integer,
	"customer_id" integer,
	"customer_phone" text,
	"operation_type" text NOT NULL,
	"credits_cost" integer NOT NULL,
	"input_text" text,
	"output_text" text,
	"interpretation" text,
	"confidence" numeric(3, 2),
	"was_successful" boolean DEFAULT true,
	"error_message" text,
	"processing_time_ms" integer,
	"model_used" text DEFAULT 'gpt-4o-mini',
	"tokens_used" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointment_service_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"description" text,
	"duration" integer,
	"base_price" numeric(10, 2) DEFAULT '0',
	"price_type" text DEFAULT 'fixed' NOT NULL,
	"min_price" numeric(10, 2),
	"max_price" numeric(10, 2),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointment_titulares" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"name" text NOT NULL,
	"specialty" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"customer_id" integer NOT NULL,
	"titular_id" integer,
	"service_type_id" integer,
	"title" text NOT NULL,
	"description" text,
	"appointment_date" timestamp NOT NULL,
	"appointment_end_date" timestamp,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"price" numeric(10, 2) DEFAULT '0',
	"payment_status" text DEFAULT 'pending' NOT NULL,
	"payment_method" text,
	"order_id" integer,
	"notes" text,
	"created_by" integer,
	"warehouse_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assignment_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true,
	"priority" integer DEFAULT 1,
	"use_sector_based" boolean DEFAULT true,
	"required_province" text,
	"required_municipality" text,
	"required_sectors" text[],
	"allow_adjacent_municipalities" boolean DEFAULT true,
	"use_specialization_based" boolean DEFAULT true,
	"required_specializations" text[],
	"use_workload_based" boolean DEFAULT true,
	"max_orders_per_technician" integer DEFAULT 5,
	"use_time_based" boolean DEFAULT true,
	"availability_required" boolean DEFAULT true,
	"applicable_products" text[],
	"applicable_services" text[],
	"assigned_user_ids" integer[],
	"assignment_method" text DEFAULT 'closest_available',
	"auto_assign" boolean DEFAULT true,
	"notify_customer" boolean DEFAULT true,
	"estimated_response_time" integer DEFAULT 60,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auto_responses" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"message" text NOT NULL,
	"is_interactive" boolean DEFAULT false,
	"interactive_data" jsonb,
	"trigger_text" text,
	"name" text NOT NULL,
	"trigger" text NOT NULL,
	"is_active" boolean DEFAULT true,
	"priority" integer DEFAULT 1,
	"message_text" text NOT NULL,
	"requires_registration" boolean DEFAULT false,
	"menu_options" text,
	"next_action" text,
	"menu_type" text DEFAULT 'buttons',
	"show_back_button" boolean DEFAULT false,
	"allow_free_text" boolean DEFAULT true,
	"response_timeout" integer DEFAULT 300,
	"max_retries" integer DEFAULT 3,
	"fallback_message" text,
	"conditional_display" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_register_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"warehouse_id" integer NOT NULL,
	"cashier_id" integer NOT NULL,
	"session_type" text DEFAULT 'shift' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"opening_amount" numeric(12, 2) DEFAULT '0',
	"opened_at" timestamp DEFAULT now() NOT NULL,
	"opening_notes" text,
	"cash_reported" numeric(12, 2),
	"card_reported" numeric(12, 2),
	"transfer_reported" numeric(12, 2),
	"credit_reported" numeric(12, 2),
	"closed_at" timestamp,
	"closed_by_user_id" integer,
	"cash_expected" numeric(12, 2),
	"card_expected" numeric(12, 2),
	"transfer_expected" numeric(12, 2),
	"credit_expected" numeric(12, 2),
	"cash_difference" numeric(12, 2),
	"card_difference" numeric(12, 2),
	"transfer_difference" numeric(12, 2),
	"credit_difference" numeric(12, 2),
	"total_difference" numeric(12, 2),
	"total_orders" integer DEFAULT 0,
	"total_sales_amount" numeric(12, 2) DEFAULT '0',
	"total_cancellations" integer DEFAULT 0,
	"total_discounts_amount" numeric(12, 2) DEFAULT '0',
	"total_expected" numeric(12, 2),
	"total_reported" numeric(12, 2),
	"discrepancy_note" text,
	"approved_by_user_id" integer,
	"approved_at" timestamp,
	"rejection_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_withdrawals" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"warehouse_id" integer NOT NULL,
	"cashier_id" integer NOT NULL,
	"authorized_by_user_id" integer NOT NULL,
	"concept" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'DOP' NOT NULL,
	"notes" text,
	"session_type" text DEFAULT 'day' NOT NULL,
	"voided" boolean DEFAULT false NOT NULL,
	"voided_at" timestamp,
	"voided_by_user_id" integer,
	"void_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"order_id" integer,
	"conversation_type" text DEFAULT 'initial' NOT NULL,
	"channel_type" text DEFAULT 'whatsapp' NOT NULL,
	"webapp_enabled_until" timestamp,
	"status" text DEFAULT 'active' NOT NULL,
	"last_message_at" timestamp DEFAULT now() NOT NULL,
	"store_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"store_id" integer NOT NULL,
	"order_id" integer,
	"type" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"balance_before" numeric(12, 2) NOT NULL,
	"balance_after" numeric(12, 2) NOT NULL,
	"description" text,
	"payment_method" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_credit_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"store_id" integer NOT NULL,
	"total_credit" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_paid" numeric(12, 2) DEFAULT '0' NOT NULL,
	"current_balance" numeric(12, 2) DEFAULT '0' NOT NULL,
	"credit_limit" numeric(12, 2),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"action" text NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(10, 2),
	"metadata" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "customer_loyalty_balance" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"store_id" integer NOT NULL,
	"total_points_earned" numeric(12, 2) DEFAULT '0.00',
	"total_points_redeemed" numeric(12, 2) DEFAULT '0.00',
	"current_balance" numeric(12, 2) DEFAULT '0.00',
	"loyalty_program_name" text,
	"points_property_name" text,
	"last_earned_at" timestamp,
	"last_redeemed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "customer_loyalty_balance_customer_id_unique" UNIQUE("customer_id")
);
--> statement-breakpoint
CREATE TABLE "customer_registration_flows" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer,
	"phone_number" text NOT NULL,
	"current_step" text NOT NULL,
	"flow_type" text,
	"order_id" integer,
	"order_number" text,
	"collected_data" text,
	"requested_service" text,
	"is_completed" boolean DEFAULT false,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"discount_percentage" numeric(5, 2) DEFAULT '0.00',
	"is_active" boolean DEFAULT true,
	"color" text DEFAULT '#3b82f6',
	"icon" text,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"store_id" integer NOT NULL,
	"whatsapp_id" text,
	"email" text NOT NULL,
	"customer_type_id" integer,
	"category" text DEFAULT 'regular',
	"parent_customer_id" integer,
	"address" text,
	"latitude" numeric(10, 8),
	"longitude" numeric(11, 8),
	"map_link" text,
	"last_contact" timestamp,
	"registration_date" timestamp DEFAULT now(),
	"birthday_date" timestamp,
	"total_orders" integer DEFAULT 0,
	"total_spent" numeric(10, 2) DEFAULT '0.00',
	"is_vip" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "customers_phone_unique" UNIQUE("phone"),
	CONSTRAINT "customers_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "employee_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" text,
	"department" text NOT NULL,
	"position" text NOT NULL,
	"specializations" text[],
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "employee_profiles_employee_id_unique" UNIQUE("employee_id")
);
--> statement-breakpoint
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
CREATE TABLE "inventory_adjustment_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"adjustment_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"product_name" text NOT NULL,
	"previous_stock" integer DEFAULT 0 NOT NULL,
	"real_stock" integer DEFAULT 0 NOT NULL,
	"difference" integer DEFAULT 0 NOT NULL,
	"unit_price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"base_currency" text DEFAULT 'DOP' NOT NULL,
	"adjustment_amount" numeric(14, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_adjustments" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"adjusted_by" integer,
	"notes" text,
	"total_items" integer DEFAULT 0 NOT NULL,
	"surplus_items" integer DEFAULT 0 NOT NULL,
	"deficit_items" integer DEFAULT 0 NOT NULL,
	"surplus_value" numeric(14, 2) DEFAULT '0' NOT NULL,
	"deficit_value" numeric(14, 2) DEFAULT '0' NOT NULL,
	"net_adjustment_value" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"type" text NOT NULL,
	"quantity" numeric(12, 2) NOT NULL,
	"quantity_before" numeric(12, 2),
	"quantity_after" numeric(12, 2),
	"unit_id" integer,
	"lot_number" text,
	"expiration_date" timestamp,
	"unit_cost" numeric(12, 2),
	"total_cost" numeric(12, 2),
	"reference_type" text,
	"reference_id" integer,
	"supplier_id" integer,
	"notes" text,
	"reason" text,
	"warehouse_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" integer
);
--> statement-breakpoint
CREATE TABLE "loyalty_points_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"store_id" integer NOT NULL,
	"type" text NOT NULL,
	"points" numeric(12, 2) NOT NULL,
	"balance_before" numeric(12, 2) NOT NULL,
	"balance_after" numeric(12, 2) NOT NULL,
	"order_id" integer,
	"description" text NOT NULL,
	"metadata" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "measurement_units" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"name" text NOT NULL,
	"symbol" text NOT NULL,
	"type" text NOT NULL,
	"abbreviation" text,
	"is_active" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"sender_id" integer,
	"sender" text,
	"sender_type" text NOT NULL,
	"message_type" text DEFAULT 'text' NOT NULL,
	"content" text NOT NULL,
	"whatsapp_message_id" text,
	"metadata" text,
	"store_id" integer,
	"is_read" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"isFromCustomer" boolean DEFAULT false
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
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"type" text NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"related_id" integer,
	"related_type" text,
	"metadata" text,
	"created_at" timestamp DEFAULT now(),
	"read_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "order_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"user_id" integer,
	"status_from" text,
	"status_to" text NOT NULL,
	"action" text NOT NULL,
	"notes" text,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"total_price" numeric(10, 2) NOT NULL,
	"installation_cost" numeric(10, 2),
	"parts_cost" numeric(10, 2),
	"labor_hours" numeric(4, 2),
	"labor_rate" numeric(10, 2),
	"delivery_cost" numeric(10, 2) DEFAULT '0',
	"delivery_distance" numeric(8, 2),
	"unit_id" integer,
	"quantity_in_base_unit" numeric(12, 4),
	"notes" text,
	"store_id" integer,
	"warehouse_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_number" text NOT NULL,
	"customer_id" integer,
	"store_id" integer NOT NULL,
	"warehouse_id" integer NOT NULL,
	"customer_province" text,
	"customer_municipality" text,
	"customer_sector" text,
	"customer_address" text,
	"customer_latitude" numeric(10, 8),
	"customer_longitude" numeric(11, 8),
	"assigned_user_id" integer,
	"assigned_rule_id" integer,
	"auto_assigned" boolean DEFAULT false,
	"assignment_attempts" integer DEFAULT 0,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" text DEFAULT 'normal',
	"service_type" text,
	"description" text,
	"total_amount" numeric(10, 2) DEFAULT '0',
	"payment_method" text,
	"payment_status" text DEFAULT 'pending' NOT NULL,
	"received_amount" numeric(10, 2),
	"change_amount" numeric(10, 2),
	"order_type" text DEFAULT 'sale' NOT NULL,
	"subtotal_amount" numeric(10, 2) DEFAULT '0',
	"discount_percentage" numeric(5, 2) DEFAULT '0',
	"discount_amount" numeric(10, 2) DEFAULT '0',
	"loyalty_points_property_name" text,
	"loyalty_points_value" numeric(10, 2),
	"loyalty_points_total" numeric(12, 2) DEFAULT '0',
	"loyalty_points_credited" boolean DEFAULT false,
	"loyalty_points_credited_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"scheduled_date" timestamp,
	"completed_date" timestamp,
	"trip_id" integer,
	CONSTRAINT "orders_order_number_unique" UNIQUE("order_number")
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
CREATE TABLE "product_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"parent_id" integer,
	"image_url" text,
	"sort_order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "product_unit_conversions" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"store_id" integer NOT NULL,
	"source_unit_id" integer NOT NULL,
	"target_unit_id" integer NOT NULL,
	"conversion_factor" numeric(15, 6) NOT NULL,
	"is_active" boolean DEFAULT true,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"base_currency" text NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"category" text NOT NULL,
	"type" text DEFAULT 'product' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"image_url" text,
	"images" text[],
	"sku" text,
	"barcode" text,
	"brand" text,
	"model" text,
	"specifications" text,
	"features" text[],
	"warranty" text,
	"availability" text DEFAULT 'in_stock' NOT NULL,
	"stock_quantity" integer DEFAULT 0,
	"min_quantity" integer DEFAULT 1,
	"max_quantity" integer,
	"lot_number" text,
	"expiration_date" timestamp,
	"weight" numeric(8, 2),
	"dimensions" text,
	"tags" text[],
	"sale_price" numeric(10, 2),
	"is_promoted" boolean DEFAULT false,
	"promotion_text" text,
	"loyalty_points_property_name" text,
	"loyalty_points_value" numeric(10, 2),
	"unit_conversion_enabled" boolean DEFAULT false,
	"base_unit_id" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"store_id" integer NOT NULL,
	CONSTRAINT "products_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
CREATE TABLE "purchase_order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"purchase_order_id" integer NOT NULL,
	"store_id" integer NOT NULL,
	"product_id" integer,
	"product_name" text NOT NULL,
	"sku" text,
	"barcode" text,
	"quantity" numeric(12, 2) NOT NULL,
	"quantity_received" numeric(12, 2) DEFAULT '0.00',
	"unit_id" integer,
	"lot_number" text,
	"expiration_date" timestamp,
	"manufacturing_date" timestamp,
	"unit_cost" numeric(12, 2) NOT NULL,
	"tax_rate" numeric(5, 2) DEFAULT '0.00',
	"discount_rate" numeric(5, 2) DEFAULT '0.00',
	"total_cost" numeric(12, 2) NOT NULL,
	"notes" text,
	"warehouse_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"purchase_number" text NOT NULL,
	"supplier_id" integer,
	"supplier_name" text,
	"order_date" timestamp DEFAULT now() NOT NULL,
	"expected_delivery_date" timestamp,
	"received_date" timestamp,
	"status" text DEFAULT 'pending' NOT NULL,
	"subtotal" numeric(12, 2) DEFAULT '0.00',
	"tax" numeric(12, 2) DEFAULT '0.00',
	"discount" numeric(12, 2) DEFAULT '0.00',
	"shipping_cost" numeric(12, 2) DEFAULT '0.00',
	"total_amount" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'DOP',
	"invoice_number" text,
	"reference_number" text,
	"notes" text,
	"payment_terms" text,
	"payment_status" text DEFAULT 'unpaid',
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"warehouse_id" integer NOT NULL,
	CONSTRAINT "purchase_orders_purchase_number_unique" UNIQUE("purchase_number")
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"role_id" integer NOT NULL,
	"view_id" integer NOT NULL,
	"can_access" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "shopping_cart" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"user_id" integer,
	"product_id" integer NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"store_whatsapp_number" text NOT NULL,
	"store_name" text NOT NULL,
	"store_address" text,
	"store_email" text,
	"store_phone" text,
	"logo_url" text,
	"logo_storage_path" text,
	"invoice_footer" text,
	"invoice_number" integer DEFAULT 1,
	"business_hours" text DEFAULT '09:00-18:00',
	"delivery_radius" text DEFAULT '50',
	"base_site_url" text,
	"enable_notifications" boolean DEFAULT true,
	"auto_assign_orders" boolean DEFAULT true,
	"currency" text DEFAULT 'DOP',
	"tax_percentage" numeric(5, 2) DEFAULT '0',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"name" text NOT NULL,
	"contact_name" text,
	"phone" text,
	"email" text,
	"address" text,
	"tax_id" text,
	"notes" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "trip_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"trip_id" integer NOT NULL,
	"order_id" integer NOT NULL,
	"store_id" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"picked_at" timestamp,
	"scanned_qr" boolean DEFAULT false,
	"sequence_number" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" serial PRIMARY KEY NOT NULL,
	"trip_number" text NOT NULL,
	"assigned_user_id" integer,
	"store_id" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"total_orders" integer DEFAULT 0,
	"completed_orders" integer DEFAULT 0,
	"total_amount" numeric(10, 2) DEFAULT '0',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"sent_at" timestamp,
	"started_at" timestamp,
	"completed_at" timestamp,
	"notes" text,
	"estimated_duration" integer,
	"actual_duration" integer,
	CONSTRAINT "trips_trip_number_unique" UNIQUE("trip_number")
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"role_id" integer NOT NULL,
	"is_primary" boolean DEFAULT true,
	"assigned_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"role" text NOT NULL,
	"address" text,
	"status" text DEFAULT 'active',
	"employee_profile_id" integer,
	"last_login" timestamp,
	"current_orders" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"province" text,
	"municipality" text,
	"sector" text,
	"coverage_provinces" text[],
	"coverage_municipalities" text[],
	"coverage_sectors" text[],
	"specializations" text[],
	"max_daily_orders" integer DEFAULT 10,
	"skill_level" integer DEFAULT 1,
	"warehouse_id" integer,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "views" (
	"id" serial PRIMARY KEY NOT NULL,
	"route_path" text NOT NULL,
	"label" text NOT NULL,
	"icon_name" text NOT NULL,
	"permission_required" text NOT NULL,
	"section" text,
	"is_system" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "views_route_path_unique" UNIQUE("route_path")
);
--> statement-breakpoint
CREATE TABLE "warehouse_stock" (
	"id" serial PRIMARY KEY NOT NULL,
	"warehouse_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"store_id" integer NOT NULL,
	"quantity" numeric(12, 2) DEFAULT '0' NOT NULL,
	"min_stock" numeric(12, 2) DEFAULT '0',
	"max_stock" numeric(12, 2),
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_transfer_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"transfer_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"requested_quantity" numeric(12, 2) NOT NULL,
	"sent_quantity" numeric(12, 2),
	"received_quantity" numeric(12, 2),
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "warehouse_transfers" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"transfer_number" text NOT NULL,
	"from_warehouse_id" integer NOT NULL,
	"to_warehouse_id" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"notes" text,
	"created_by" integer,
	"approved_by" integer,
	"completed_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"approved_at" timestamp,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "warehouses" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"address" text,
	"phone" text,
	"manager" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"phone_number" text,
	"store_id" integer NOT NULL,
	"message_content" text,
	"message_id" text,
	"status" text,
	"error_message" text,
	"raw_data" text,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"access_token" text NOT NULL,
	"phone_number_id" text NOT NULL,
	"webhook_verify_token" text NOT NULL,
	"business_account_id" text,
	"app_id" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_period_balances" (
	"company_id" integer NOT NULL,
	"account_id" integer NOT NULL,
	"period_id" integer NOT NULL,
	"cost_center_id" integer DEFAULT 0 NOT NULL,
	"currency" char(3) NOT NULL,
	"debit_total" numeric(18, 4) DEFAULT '0' NOT NULL,
	"credit_total" numeric(18, 4) DEFAULT '0' NOT NULL,
	"opening_func" numeric(18, 4) DEFAULT '0' NOT NULL,
	"closing_func" numeric(18, 4) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounting_outbox" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"event_type" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"source_event" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "accounting_periods" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"fiscal_year" smallint NOT NULL,
	"period_no" smallint NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" "period_status" DEFAULT 'open' NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_by" integer,
	CONSTRAINT "accounting_periods_range_ck" CHECK ("accounting_periods"."end_date" >= "accounting_periods"."start_date"),
	CONSTRAINT "accounting_periods_no_ck" CHECK ("accounting_periods"."period_no" between 1 and 13)
);
--> statement-breakpoint
CREATE TABLE "chart_of_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"parent_id" integer,
	"level" smallint DEFAULT 1 NOT NULL,
	"account_type" "account_type" NOT NULL,
	"normal_side" "normal_side" NOT NULL,
	"is_postable" boolean DEFAULT false NOT NULL,
	"is_control" boolean DEFAULT false NOT NULL,
	"subledger" text,
	"currency" char(3),
	"requires_dimension" text[],
	"group_account_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cost_centers" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"parent_id" integer,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dimension_definitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"allowed_values" text[]
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"period_id" integer NOT NULL,
	"entry_no" text,
	"entry_date" date NOT NULL,
	"memo" text,
	"currency" char(3) NOT NULL,
	"status" "journal_status" DEFAULT 'draft' NOT NULL,
	"source_type" text DEFAULT 'manual' NOT NULL,
	"source_id" text,
	"source_event" text,
	"reverses_entry_id" bigint,
	"reversed_by_entry_id" bigint,
	"posted_at" timestamp with time zone,
	"posted_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_entry_lines" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"entry_id" bigint NOT NULL,
	"company_id" integer NOT NULL,
	"line_no" smallint NOT NULL,
	"account_id" integer NOT NULL,
	"debit" numeric(18, 4) DEFAULT '0' NOT NULL,
	"credit" numeric(18, 4) DEFAULT '0' NOT NULL,
	"currency" char(3) NOT NULL,
	"fx_rate" numeric(18, 8) DEFAULT '1' NOT NULL,
	"debit_func" numeric(18, 4) DEFAULT '0' NOT NULL,
	"credit_func" numeric(18, 4) DEFAULT '0' NOT NULL,
	"cost_center_id" integer,
	"profit_center_id" integer,
	"project_id" integer,
	"dimensions" jsonb,
	"memo" text,
	CONSTRAINT "jel_nonneg_ck" CHECK ("journal_entry_lines"."debit" >= 0 and "journal_entry_lines"."credit" >= 0),
	CONSTRAINT "jel_xor_ck" CHECK (not ("journal_entry_lines"."debit" > 0 and "journal_entry_lines"."credit" > 0)),
	CONSTRAINT "jel_func_nonneg_ck" CHECK ("journal_entry_lines"."debit_func" >= 0 and "journal_entry_lines"."credit_func" >= 0)
);
--> statement-breakpoint
CREATE TABLE "posting_rule_sets" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"valid_from" date
);
--> statement-breakpoint
CREATE TABLE "posting_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"rule_set_id" integer,
	"event_type" text NOT NULL,
	"match" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"debit_account_ref" text,
	"credit_account_ref" text,
	"priority" smallint DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profit_centers" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"parent_id" integer,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"parent_id" integer,
	"start_date" date,
	"end_date" date,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fiscal_document_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"document_id" bigint NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"from_status" text,
	"to_status" text,
	"direction" text NOT NULL,
	"payload" jsonb,
	"http_status" integer,
	"dgii_message" text
);
--> statement-breakpoint
CREATE TABLE "fiscal_document_lines" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"document_id" bigint NOT NULL,
	"company_id" integer NOT NULL,
	"line_no" smallint NOT NULL,
	"product_id" integer,
	"description" text NOT NULL,
	"quantity" numeric(18, 4) DEFAULT '1' NOT NULL,
	"unit_price" numeric(18, 4) DEFAULT '0' NOT NULL,
	"discount" numeric(18, 4) DEFAULT '0' NOT NULL,
	"tax_code" text,
	"itbis_rate" numeric(7, 4) DEFAULT '0' NOT NULL,
	"itbis_amount" numeric(18, 4) DEFAULT '0' NOT NULL,
	"line_total" numeric(18, 4) DEFAULT '0' NOT NULL,
	"is_exempt" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fiscal_documents" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"doc_type" "fiscal_doc_type" NOT NULL,
	"ncf" varchar(19),
	"ncf_type" varchar(3) NOT NULL,
	"is_ecf" boolean DEFAULT false NOT NULL,
	"modifies_ncf" varchar(19),
	"modifies_doc_id" bigint,
	"issuer_rnc" varchar(11) NOT NULL,
	"buyer_rnc" varchar(11),
	"buyer_name" text,
	"customer_id" integer,
	"supplier_id" integer,
	"order_id" integer,
	"currency" char(3) DEFAULT 'DOP' NOT NULL,
	"fx_rate" numeric(18, 8) DEFAULT '1' NOT NULL,
	"subtotal_taxed" numeric(18, 4) DEFAULT '0' NOT NULL,
	"subtotal_exempt" numeric(18, 4) DEFAULT '0' NOT NULL,
	"itbis_18" numeric(18, 4) DEFAULT '0' NOT NULL,
	"itbis_16" numeric(18, 4) DEFAULT '0' NOT NULL,
	"itbis_0" numeric(18, 4) DEFAULT '0' NOT NULL,
	"isc" numeric(18, 4) DEFAULT '0' NOT NULL,
	"tip_legal" numeric(18, 4) DEFAULT '0' NOT NULL,
	"retention_itbis" numeric(18, 4) DEFAULT '0' NOT NULL,
	"retention_isr" numeric(18, 4) DEFAULT '0' NOT NULL,
	"total" numeric(18, 4) DEFAULT '0' NOT NULL,
	"status" "fiscal_doc_status" DEFAULT 'draft' NOT NULL,
	"ecf_status" "ecf_status",
	"track_id" text,
	"security_code" varchar(12),
	"signature_datetime" timestamp with time zone,
	"xml_signed" text,
	"qr_url" text,
	"contingency" boolean DEFAULT false NOT NULL,
	"emitted_at" timestamp with time zone,
	"due_date" date,
	"journal_entry_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fiscal_documents_total_ck" CHECK ("fiscal_documents"."total" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ncf_sequences" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"ncf_type" varchar(3) NOT NULL,
	"is_ecf" boolean DEFAULT false NOT NULL,
	"range_from" bigint NOT NULL,
	"range_to" bigint NOT NULL,
	"next_number" bigint NOT NULL,
	"expiry_date" date,
	"alert_threshold" integer DEFAULT 50 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ncf_sequences_range_ck" CHECK ("ncf_sequences"."range_to" >= "ncf_sequences"."range_from"),
	CONSTRAINT "ncf_sequences_next_ck" CHECK ("ncf_sequences"."next_number" >= "ncf_sequences"."range_from" and "ncf_sequences"."next_number" <= "ncf_sequences"."range_to" + 1)
);
--> statement-breakpoint
CREATE TABLE "retention_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"name" text NOT NULL,
	"base" text NOT NULL,
	"rate" numeric(7, 4) NOT NULL,
	"applies_when" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"account_ref" text,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"account_ref" text,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_rates" (
	"id" serial PRIMARY KEY NOT NULL,
	"tax_code_id" integer NOT NULL,
	"rate" numeric(7, 4) NOT NULL,
	"valid_from" date NOT NULL,
	"valid_to" date
);
--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_consolidation_map" ADD CONSTRAINT "company_consolidation_map_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_consolidation_map" ADD CONSTRAINT "company_consolidation_map_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_companies" ADD CONSTRAINT "user_companies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_companies" ADD CONSTRAINT "user_companies_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_titular_id_appointment_titulares_id_fk" FOREIGN KEY ("titular_id") REFERENCES "public"."appointment_titulares"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_service_type_id_appointment_service_types_id_fk" FOREIGN KEY ("service_type_id") REFERENCES "public"."appointment_service_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_register_sessions" ADD CONSTRAINT "cash_register_sessions_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_register_sessions" ADD CONSTRAINT "cash_register_sessions_cashier_id_users_id_fk" FOREIGN KEY ("cashier_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_register_sessions" ADD CONSTRAINT "cash_register_sessions_closed_by_user_id_users_id_fk" FOREIGN KEY ("closed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_register_sessions" ADD CONSTRAINT "cash_register_sessions_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_withdrawals" ADD CONSTRAINT "cash_withdrawals_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_withdrawals" ADD CONSTRAINT "cash_withdrawals_cashier_id_users_id_fk" FOREIGN KEY ("cashier_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_withdrawals" ADD CONSTRAINT "cash_withdrawals_authorized_by_user_id_users_id_fk" FOREIGN KEY ("authorized_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_withdrawals" ADD CONSTRAINT "cash_withdrawals_voided_by_user_id_users_id_fk" FOREIGN KEY ("voided_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_credit_accounts" ADD CONSTRAINT "customer_credit_accounts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_history" ADD CONSTRAINT "customer_history_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_loyalty_balance" ADD CONSTRAINT "customer_loyalty_balance_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_registration_flows" ADD CONSTRAINT "customer_registration_flows_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_registration_flows" ADD CONSTRAINT "customer_registration_flows_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_customer_type_id_customer_types_id_fk" FOREIGN KEY ("customer_type_id") REFERENCES "public"."customer_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_parent_customer_id_customers_id_fk" FOREIGN KEY ("parent_customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_adjustment_items" ADD CONSTRAINT "inventory_adjustment_items_adjustment_id_inventory_adjustments_id_fk" FOREIGN KEY ("adjustment_id") REFERENCES "public"."inventory_adjustments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_adjustment_items" ADD CONSTRAINT "inventory_adjustment_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_adjusted_by_users_id_fk" FOREIGN KEY ("adjusted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_points_transactions" ADD CONSTRAINT "loyalty_points_transactions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_points_transactions" ADD CONSTRAINT "loyalty_points_transactions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_configs" ADD CONSTRAINT "notification_configs_event_id_notification_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."notification_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_configs" ADD CONSTRAINT "notification_configs_channel_id_notification_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."notification_channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_history" ADD CONSTRAINT "notification_history_config_id_notification_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."notification_configs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_history" ADD CONSTRAINT "order_history_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_history" ADD CONSTRAINT "order_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_assigned_rule_id_assignment_rules_id_fk" FOREIGN KEY ("assigned_rule_id") REFERENCES "public"."assignment_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_unit_conversions" ADD CONSTRAINT "product_unit_conversions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_unit_conversions" ADD CONSTRAINT "product_unit_conversions_source_unit_id_measurement_units_id_fk" FOREIGN KEY ("source_unit_id") REFERENCES "public"."measurement_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_unit_conversions" ADD CONSTRAINT "product_unit_conversions_target_unit_id_measurement_units_id_fk" FOREIGN KEY ("target_unit_id") REFERENCES "public"."measurement_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_view_id_views_id_fk" FOREIGN KEY ("view_id") REFERENCES "public"."views"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_cart" ADD CONSTRAINT "shopping_cart_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_cart" ADD CONSTRAINT "shopping_cart_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_orders" ADD CONSTRAINT "trip_orders_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_orders" ADD CONSTRAINT "trip_orders_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_employee_profile_id_employee_profiles_id_fk" FOREIGN KEY ("employee_profile_id") REFERENCES "public"."employee_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_stock" ADD CONSTRAINT "warehouse_stock_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_stock" ADD CONSTRAINT "warehouse_stock_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_transfer_items" ADD CONSTRAINT "warehouse_transfer_items_transfer_id_warehouse_transfers_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."warehouse_transfers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_transfer_items" ADD CONSTRAINT "warehouse_transfer_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_transfers" ADD CONSTRAINT "warehouse_transfers_from_warehouse_id_warehouses_id_fk" FOREIGN KEY ("from_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_transfers" ADD CONSTRAINT "warehouse_transfers_to_warehouse_id_warehouses_id_fk" FOREIGN KEY ("to_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_transfers" ADD CONSTRAINT "warehouse_transfers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_transfers" ADD CONSTRAINT "warehouse_transfers_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_transfers" ADD CONSTRAINT "warehouse_transfers_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_period_balances" ADD CONSTRAINT "account_period_balances_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_period_balances" ADD CONSTRAINT "account_period_balances_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_period_balances" ADD CONSTRAINT "account_period_balances_period_id_accounting_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."accounting_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_outbox" ADD CONSTRAINT "accounting_outbox_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dimension_definitions" ADD CONSTRAINT "dimension_definitions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_period_id_accounting_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."accounting_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_posted_by_users_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_entry_id_journal_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_cost_center_id_cost_centers_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_profit_center_id_profit_centers_id_fk" FOREIGN KEY ("profit_center_id") REFERENCES "public"."profit_centers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posting_rule_sets" ADD CONSTRAINT "posting_rule_sets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posting_rules" ADD CONSTRAINT "posting_rules_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posting_rules" ADD CONSTRAINT "posting_rules_rule_set_id_posting_rule_sets_id_fk" FOREIGN KEY ("rule_set_id") REFERENCES "public"."posting_rule_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profit_centers" ADD CONSTRAINT "profit_centers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_document_events" ADD CONSTRAINT "fiscal_document_events_document_id_fiscal_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."fiscal_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_document_lines" ADD CONSTRAINT "fiscal_document_lines_document_id_fiscal_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."fiscal_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_document_lines" ADD CONSTRAINT "fiscal_document_lines_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_document_lines" ADD CONSTRAINT "fiscal_document_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ncf_sequences" ADD CONSTRAINT "ncf_sequences_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retention_rules" ADD CONSTRAINT "retention_rules_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_codes" ADD CONSTRAINT "tax_codes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_rates" ADD CONSTRAINT "tax_rates_tax_code_id_tax_codes_id_fk" FOREIGN KEY ("tax_code_id") REFERENCES "public"."tax_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "companies_rnc_uq" ON "companies" USING btree ("rnc");--> statement-breakpoint
CREATE INDEX "companies_group_idx" ON "companies" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "company_consolidation_map_uq" ON "company_consolidation_map" USING btree ("group_id","company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_companies_uq" ON "user_companies" USING btree ("user_id","company_id");--> statement-breakpoint
CREATE INDEX "user_companies_user_idx" ON "user_companies" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_period_balances_pk" ON "account_period_balances" USING btree ("company_id","account_id","period_id","cost_center_id","currency");--> statement-breakpoint
CREATE INDEX "accounting_outbox_pending_idx" ON "accounting_outbox" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "accounting_outbox_source_uq" ON "accounting_outbox" USING btree ("company_id","source_type","source_id","source_event");--> statement-breakpoint
CREATE UNIQUE INDEX "accounting_periods_uq" ON "accounting_periods" USING btree ("company_id","fiscal_year","period_no");--> statement-breakpoint
CREATE INDEX "accounting_periods_range_idx" ON "accounting_periods" USING btree ("company_id","start_date","end_date");--> statement-breakpoint
CREATE UNIQUE INDEX "chart_of_accounts_code_uq" ON "chart_of_accounts" USING btree ("company_id","code");--> statement-breakpoint
CREATE INDEX "chart_of_accounts_parent_idx" ON "chart_of_accounts" USING btree ("company_id","parent_id");--> statement-breakpoint
CREATE INDEX "chart_of_accounts_postable_idx" ON "chart_of_accounts" USING btree ("company_id","is_postable");--> statement-breakpoint
CREATE UNIQUE INDEX "cost_centers_code_uq" ON "cost_centers" USING btree ("company_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "dimension_definitions_uq" ON "dimension_definitions" USING btree ("company_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "journal_entries_source_uq" ON "journal_entries" USING btree ("company_id","source_type","source_id","source_event");--> statement-breakpoint
CREATE UNIQUE INDEX "journal_entries_no_uq" ON "journal_entries" USING btree ("company_id","entry_no");--> statement-breakpoint
CREATE INDEX "journal_entries_period_idx" ON "journal_entries" USING btree ("company_id","period_id");--> statement-breakpoint
CREATE INDEX "journal_entries_date_idx" ON "journal_entries" USING btree ("company_id","entry_date");--> statement-breakpoint
CREATE INDEX "journal_entries_status_idx" ON "journal_entries" USING btree ("company_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "journal_entry_lines_no_uq" ON "journal_entry_lines" USING btree ("entry_id","line_no");--> statement-breakpoint
CREATE INDEX "journal_entry_lines_account_idx" ON "journal_entry_lines" USING btree ("company_id","account_id");--> statement-breakpoint
CREATE INDEX "journal_entry_lines_entry_idx" ON "journal_entry_lines" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "journal_entry_lines_cc_idx" ON "journal_entry_lines" USING btree ("cost_center_id");--> statement-breakpoint
CREATE INDEX "posting_rule_sets_company_idx" ON "posting_rule_sets" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "posting_rules_lookup_idx" ON "posting_rules" USING btree ("company_id","event_type","priority");--> statement-breakpoint
CREATE UNIQUE INDEX "profit_centers_code_uq" ON "profit_centers" USING btree ("company_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_code_uq" ON "projects" USING btree ("company_id","code");--> statement-breakpoint
CREATE INDEX "fiscal_document_events_doc_idx" ON "fiscal_document_events" USING btree ("document_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "fiscal_document_lines_no_uq" ON "fiscal_document_lines" USING btree ("document_id","line_no");--> statement-breakpoint
CREATE INDEX "fiscal_document_lines_doc_idx" ON "fiscal_document_lines" USING btree ("document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fiscal_documents_ncf_uq" ON "fiscal_documents" USING btree ("company_id","ncf");--> statement-breakpoint
CREATE INDEX "fiscal_documents_type_idx" ON "fiscal_documents" USING btree ("company_id","ncf_type");--> statement-breakpoint
CREATE INDEX "fiscal_documents_buyer_idx" ON "fiscal_documents" USING btree ("company_id","buyer_rnc");--> statement-breakpoint
CREATE INDEX "fiscal_documents_ecf_status_idx" ON "fiscal_documents" USING btree ("company_id","ecf_status");--> statement-breakpoint
CREATE INDEX "fiscal_documents_emitted_idx" ON "fiscal_documents" USING btree ("company_id","emitted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ncf_sequences_uq" ON "ncf_sequences" USING btree ("company_id","ncf_type","range_from");--> statement-breakpoint
CREATE INDEX "ncf_sequences_active_idx" ON "ncf_sequences" USING btree ("company_id","ncf_type","is_active");--> statement-breakpoint
CREATE INDEX "retention_rules_company_idx" ON "retention_rules" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tax_codes_uq" ON "tax_codes" USING btree ("company_id","code");--> statement-breakpoint
CREATE INDEX "tax_rates_lookup_idx" ON "tax_rates" USING btree ("tax_code_id","valid_from");