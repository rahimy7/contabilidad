-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TABLE "roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "roles_name_key" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"role_id" integer NOT NULL,
	"view_id" integer NOT NULL,
	"can_access" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "role_permissions_role_id_view_id_key" UNIQUE("role_id","view_id")
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
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "views_route_path_key" UNIQUE("route_path")
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"role_id" integer NOT NULL,
	"is_primary" boolean DEFAULT true,
	"assigned_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "user_roles_user_id_role_id_key" UNIQUE("user_id","role_id")
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
CREATE TABLE "appointment_service_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"description" text,
	"duration" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"base_price" numeric(10, 2) DEFAULT '0',
	"price_type" text DEFAULT 'fixed' NOT NULL,
	"min_price" numeric(10, 2),
	"max_price" numeric(10, 2)
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"customer_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"appointment_date" timestamp NOT NULL,
	"appointment_end_date" timestamp,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"notes" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"titular_id" integer,
	"service_type_id" integer,
	"price" numeric(10, 2) DEFAULT '0',
	"payment_status" text DEFAULT 'pending' NOT NULL,
	"payment_method" text,
	"order_id" integer
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
CREATE TABLE "cash_withdrawals" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
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
CREATE TABLE "cash_register_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"cashier_id" integer,
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
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "ai_conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"customer_id" integer NOT NULL,
	"is_active" boolean DEFAULT true,
	"mode" text DEFAULT 'assistant',
	"cart_items" text,
	"current_intent" text,
	"message_count" integer DEFAULT 0,
	"last_message_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"store_id" integer,
	"customer_phone" text,
	"conversation_context" text,
	"draft_order_id" integer,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"pending_product_selection" text,
	"pending_products_by_index" text
);
--> statement-breakpoint
CREATE TABLE "ai_product_matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"search_query" text NOT NULL,
	"normalized_query" text NOT NULL,
	"matched_products" text NOT NULL,
	"confidence" numeric(3, 2),
	"times_used" integer DEFAULT 1,
	"last_used_at" timestamp DEFAULT now(),
	"store_id" integer NOT NULL,
	"match_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "ai_usage_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"conversation_id" integer,
	"customer_id" integer,
	"operation_type" text NOT NULL,
	"credits_cost" integer NOT NULL,
	"input_text" text,
	"output_text" text,
	"interpretation" text,
	"confidence" numeric(3, 2),
	"was_successful" boolean DEFAULT true,
	"model_used" text DEFAULT 'gpt-4o-mini',
	"created_at" timestamp DEFAULT now(),
	"customer_phone" text,
	"error_message" text,
	"processing_time_ms" integer,
	"tokens_used" integer
);
--> statement-breakpoint
CREATE TABLE "assignment_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"criteria" jsonb,
	"assignment_method" text NOT NULL,
	"is_active" boolean DEFAULT true,
	"priority" integer DEFAULT 1,
	"created_at" timestamp DEFAULT now(),
	"store_id" integer,
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
	"auto_assign" boolean DEFAULT true,
	"notify_customer" boolean DEFAULT true,
	"estimated_response_time" integer DEFAULT 60,
	"updated_at" timestamp DEFAULT now(),
	"assigned_user_ids" integer[],
	"read_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "auto_responses" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"trigger_text" text NOT NULL,
	"message" text NOT NULL,
	"is_active" boolean DEFAULT true,
	"is_interactive" boolean DEFAULT false,
	"interactive_data" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"store_id" integer,
	"trigger" text DEFAULT 'welcome' NOT NULL,
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
	"conditional_display" text
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "brands_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"description" text,
	"website" text,
	"logo" text,
	"isActive" boolean DEFAULT true,
	"sortOrder" integer DEFAULT 0,
	"createdAt" timestamp DEFAULT CURRENT_TIMESTAMP,
	"updatedAt" timestamp DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "brands_name_key" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "conversation_context" (
	"id" serial PRIMARY KEY NOT NULL,
	"phone_number" varchar(20) NOT NULL,
	"customer_id" integer,
	"current_flow" varchar(100),
	"context_data" jsonb,
	"selected_order_id" integer,
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	"updated_at" timestamp DEFAULT CURRENT_TIMESTAMP,
	"expires_at" timestamp DEFAULT (CURRENT_TIMESTAMP + '24:00:00'::interval),
	CONSTRAINT "conversation_context_phone_number_key" UNIQUE("phone_number")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"whatsapp_id" text,
	"status" text DEFAULT 'active',
	"last_message_at" timestamp DEFAULT now(),
	"unread_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"store_id" integer,
	"order_id" integer,
	"conversation_type" text DEFAULT 'initial',
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"read_at" timestamp DEFAULT now(),
	"channel_type" text DEFAULT 'whatsapp' NOT NULL,
	"webapp_enabled_until" timestamp
);
--> statement-breakpoint
CREATE TABLE "currencies" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"symbol" text NOT NULL,
	"is_active" boolean DEFAULT true,
	"is_default" boolean DEFAULT false,
	"decimal_places" integer DEFAULT 2,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "currencies_code_key" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "customer_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"order_id" integer,
	"event_type" text NOT NULL,
	"event_data" jsonb,
	"created_at" timestamp DEFAULT now(),
	"store_id" integer,
	"action" text NOT NULL,
	"description" text NOT NULL,
	"amount" numeric,
	"metadata" text
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"address" text,
	"latitude" numeric(10, 8),
	"longitude" numeric(11, 8),
	"notes" text,
	"is_vip" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"store_id" integer,
	"whatsapp_name" text,
	"contact_method" text DEFAULT 'whatsapp',
	"preferred_contact_time" text,
	"customer_type" text DEFAULT 'individual',
	"company_name" text,
	"tax_id" text,
	"map_link" text,
	"whatsapp_id" text,
	"last_contact" timestamp,
	"registration_date" timestamp DEFAULT now(),
	"total_orders" integer DEFAULT 0,
	"total_spent" numeric(10, 2) DEFAULT '0.00',
	"customer_type_id" integer,
	"category" text DEFAULT 'regular',
	"is_active" boolean DEFAULT true,
	"parent_customer_id" integer,
	"birthday_date" timestamp,
	CONSTRAINT "customers_phone_key" UNIQUE("phone")
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
CREATE TABLE "exchange_rates" (
	"id" serial PRIMARY KEY NOT NULL,
	"base_currency" varchar(3) NOT NULL,
	"target_currency" varchar(3) NOT NULL,
	"rate" numeric(10, 6) NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	"is_active" boolean DEFAULT true,
	"store_id" integer NOT NULL,
	"updated_by" integer
);
--> statement-breakpoint
CREATE TABLE "customer_registration_flows" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer,
	"current_step" text NOT NULL,
	"collected_data" jsonb,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"store_id" integer,
	"phone_number" text NOT NULL,
	"requested_service" text,
	"is_completed" boolean DEFAULT false,
	"updated_at" timestamp DEFAULT '2025-07-15 18:54:08.557928',
	"order_id" integer,
	"flow_type" text,
	"order_number" text
);
--> statement-breakpoint
CREATE TABLE "employee_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" text,
	"department" text,
	"position" text,
	"emergency_contact" text,
	"emergency_phone" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"specializations" text,
	"certifications" text[],
	"work_schedule" text,
	"vehicle_info" text,
	"commission_rate" numeric(5, 2),
	"territory" text,
	"base_latitude" numeric(10, 8),
	"base_longitude" numeric(11, 8),
	"base_address" text,
	"service_radius" numeric(5, 2) DEFAULT '10.0',
	"max_daily_orders" integer DEFAULT 5,
	"availability_hours" text,
	"skill_level" integer DEFAULT 1,
	"notes" text,
	CONSTRAINT "unique_employee_id" UNIQUE("employee_id")
);
--> statement-breakpoint
CREATE TABLE "exchange_rate_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"from_currency" text NOT NULL,
	"to_currency" text NOT NULL,
	"old_rate" numeric(18, 8),
	"new_rate" numeric(18, 8) NOT NULL,
	"change_percent" numeric(8, 4),
	"updated_by" integer,
	"change_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_channels" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_enabled" boolean DEFAULT true,
	"settings" jsonb,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "unique_channel_name" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"type" text NOT NULL,
	"is_read" boolean DEFAULT false,
	"priority" text DEFAULT 'normal',
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"store_id" integer,
	"related_id" integer,
	"related_type" text,
	"read_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"type" text NOT NULL,
	"quantity" numeric(12, 2) NOT NULL,
	"unit_id" integer,
	"lot_number" text,
	"expiration_date" timestamp,
	"reference_type" text,
	"reference_id" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" integer,
	"quantity_before" numeric(12, 2),
	"quantity_after" numeric(12, 2),
	"unit_cost" numeric(12, 2),
	"total_cost" numeric(12, 2),
	"supplier_id" integer,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"content" text NOT NULL,
	"sender" text DEFAULT 'customer',
	"message_type" text DEFAULT 'text',
	"whatsapp_message_id" text,
	"is_read" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"store_id" integer,
	"metadata" jsonb,
	"sender_id" integer,
	"sender_type" text DEFAULT 'customer' NOT NULL,
	"sent_at" timestamp DEFAULT now(),
	"isFromCustomer" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "notification_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"event_name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "unique_event_name" UNIQUE("event_name")
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
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "order_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer,
	"status_from" text,
	"status_to" text,
	"changed_by" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"store_id" integer,
	"user_id" integer,
	"action" text NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL
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
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "loyalty_points_transactions_type_check" CHECK (type = ANY (ARRAY['earned'::text, 'redeemed'::text, 'expired'::text, 'adjusted'::text]))
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
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "chk_measurement_unit_type" CHECK (type = ANY (ARRAY['weight'::text, 'volume'::text, 'unit'::text, 'length'::text]))
);
--> statement-breakpoint
CREATE TABLE "notification_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer,
	"channel_id" integer,
	"is_enabled" boolean DEFAULT true,
	"recipient_type" text NOT NULL,
	"custom_recipients" integer[],
	"template" text NOT NULL,
	"priority" text DEFAULT 'normal',
	"delay_minutes" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "order_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer,
	"customer_id" integer,
	"note_text" text NOT NULL,
	"note_type" varchar(50) DEFAULT 'customer_note',
	"created_by" varchar(100) DEFAULT 'customer',
	"created_at" timestamp DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE "product_brands" (
	"id" integer NOT NULL,
	"store_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"logo" text,
	"website" text,
	"country_of_origin" text,
	"is_active" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"store_id" integer,
	"parent_id" integer,
	"image_url" text,
	"sort_order" integer DEFAULT 0,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price" numeric(10, 2) NOT NULL,
	"category" text,
	"brand" text,
	"model" text,
	"sku" text,
	"is_service" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"delivery_required" boolean DEFAULT true,
	"installation_time" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"store_id" integer DEFAULT 1 NOT NULL,
	"images" text[],
	"weight" text,
	"dimensions" text,
	"status" text DEFAULT 'active' NOT NULL,
	"image_url" text,
	"specifications" text,
	"features" text[],
	"warranty" text,
	"availability" text DEFAULT 'in_stock' NOT NULL,
	"stock_quantity" integer DEFAULT 0,
	"min_quantity" integer DEFAULT 1,
	"max_quantity" integer,
	"tags" text[],
	"sale_price" numeric(10, 2),
	"is_promoted" boolean DEFAULT false,
	"promotion_text" text,
	"base_currency" varchar(3) DEFAULT 'DOP',
	"loyalty_points_property_name" text,
	"loyalty_points_value" numeric(10, 2),
	"unit_conversion_enabled" boolean DEFAULT false,
	"base_unit_id" integer,
	"lot_number" text,
	"expiration_date" timestamp,
	"barcode" text,
	"type" text DEFAULT 'product' NOT NULL
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
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_number" text NOT NULL,
	"customer_id" integer NOT NULL,
	"status" text DEFAULT 'pending',
	"total_amount" numeric(10, 2) NOT NULL,
	"delivery_cost" numeric(10, 2) DEFAULT '0',
	"assigned_to" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"store_id" integer,
	"delivery_address" text,
	"estimated_delivery" timestamp,
	"payment_method" text,
	"payment_status" text DEFAULT 'pending',
	"assigned_user_id" integer,
	"description" text,
	"priority" text DEFAULT 'normal',
	"estimated_delivery_time" varchar(100),
	"last_status_update" timestamp DEFAULT CURRENT_TIMESTAMP,
	"customer_last_interaction" timestamp,
	"modification_count" integer DEFAULT 0,
	"contact_number" text,
	"customer_province" text,
	"customer_municipality" text,
	"customer_sector" text,
	"auto_assigned" boolean DEFAULT false,
	"assigned_rule_id" integer,
	"assignment_attempts" integer DEFAULT 0,
	"customer_address" text,
	"customer_latitude" numeric(10, 8),
	"customer_longitude" numeric(11, 8),
	"service_type" text,
	"scheduled_date" timestamp,
	"completed_date" timestamp,
	"trip_id" integer,
	"loyalty_points_property_name" text,
	"loyalty_points_value" numeric(10, 2),
	"loyalty_points_total" numeric(12, 2) DEFAULT '0',
	"loyalty_points_credited" boolean DEFAULT false,
	"loyalty_points_credited_at" timestamp,
	"received_amount" numeric(10, 2),
	"change_amount" numeric(10, 2),
	"order_type" text DEFAULT 'sale' NOT NULL,
	"subtotal_amount" numeric(10, 2) DEFAULT '0',
	"discount_percentage" numeric(5, 2) DEFAULT '0',
	"discount_amount" numeric(10, 2) DEFAULT '0',
	CONSTRAINT "orders_order_number_key" UNIQUE("order_number")
);
--> statement-breakpoint
CREATE TABLE "shopping_cart" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"product_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"store_id" integer,
	"user_id" integer,
	"notes" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_currency_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"default_currency" text NOT NULL,
	"supported_currencies" jsonb DEFAULT '["DOP","USD"]'::jsonb,
	"auto_update_rates" boolean DEFAULT false,
	"rate_update_frequency" text DEFAULT 'manual',
	"show_both_prices" boolean DEFAULT true,
	"primary_display_currency" text,
	"rounding_method" text DEFAULT 'normal',
	"rounding_precision" integer DEFAULT 2,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"setting_value" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"store_id" integer,
	"store_whatsapp_number" text NOT NULL,
	"store_name" text NOT NULL,
	"store_address" text,
	"store_email" text,
	"business_hours" text DEFAULT '09:00-18:00',
	"delivery_radius" text DEFAULT '50',
	"base_site_url" text,
	"enable_notifications" boolean DEFAULT true,
	"auto_assign_orders" boolean DEFAULT true,
	"store_phone" text,
	"logo_url" text,
	"logo_storage_path" text,
	"invoice_footer" text,
	"invoice_number" integer DEFAULT 1,
	"currency" text DEFAULT 'DOP',
	"tax_percentage" numeric(5, 2) DEFAULT '0'
);
--> statement-breakpoint
CREATE TABLE "store_subscriptions" (
	"id" integer NOT NULL,
	"store_id" integer NOT NULL,
	"plan_id" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"start_date" timestamp DEFAULT now(),
	"end_date" timestamp,
	"auto_renew" boolean DEFAULT true,
	"current_products" integer DEFAULT 0,
	"current_db_storage_gb" numeric DEFAULT '0.00',
	"current_whatsapp_messages" integer DEFAULT 0,
	"current_users" integer DEFAULT 0,
	"current_orders" integer DEFAULT 0,
	"current_customers" integer DEFAULT 0,
	"last_billing_date" timestamp,
	"next_billing_date" timestamp,
	"billing_cycle" text DEFAULT 'monthly',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
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
	CONSTRAINT "purchase_orders_purchase_number_key" UNIQUE("purchase_number"),
	CONSTRAINT "chk_payment_status" CHECK (payment_status = ANY (ARRAY['unpaid'::text, 'partial'::text, 'paid'::text])),
	CONSTRAINT "chk_purchase_status" CHECK (status = ANY (ARRAY['pending'::text, 'received'::text, 'partial'::text, 'cancelled'::text]))
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"type" text DEFAULT 'fixed' NOT NULL,
	"monthly_price" numeric DEFAULT '0.00',
	"max_products" integer DEFAULT '-1',
	"max_whatsapp_messages" integer DEFAULT '-1',
	"max_users" integer DEFAULT '-1',
	"max_orders" integer DEFAULT '-1',
	"max_customers" integer DEFAULT '-1',
	"max_db_storage" numeric DEFAULT '-1',
	"price_per_product" numeric DEFAULT '0.00',
	"price_per_message" numeric DEFAULT '0.00',
	"price_per_gb_storage" numeric DEFAULT '0.00',
	"price_per_order" numeric DEFAULT '0.00',
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
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
	CONSTRAINT "trips_trip_number_key" UNIQUE("trip_number")
);
--> statement-breakpoint
CREATE TABLE "system_audit_log" (
	"id" integer NOT NULL,
	"user_id" integer,
	"store_id" integer,
	"action" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"resource" text NOT NULL,
	"resource_id" text,
	"details" text,
	"created_at" timestamp DEFAULT now()
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
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "trip_orders_trip_id_order_id_key" UNIQUE("trip_id","order_id")
);
--> statement-breakpoint
CREATE TABLE "usage_history" (
	"id" integer NOT NULL,
	"store_id" integer NOT NULL,
	"subscription_id" integer NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"products_used" integer DEFAULT 0,
	"db_storage_used_gb" numeric DEFAULT '0.00',
	"whatsapp_messages_used" integer DEFAULT 0,
	"users_active" integer DEFAULT 0,
	"orders_processed" integer DEFAULT 0,
	"customers_active" integer DEFAULT 0,
	"fixed_cost" numeric DEFAULT '0.00',
	"usage_cost" numeric DEFAULT '0.00',
	"total_cost" numeric DEFAULT '0.00',
	"created_at" timestamp DEFAULT now()
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
CREATE TABLE "whatsapp_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"phone_number_id" text,
	"message_id" text,
	"direction" text,
	"message_type" text,
	"content" text,
	"from_number" text,
	"to_number" text,
	"status" text,
	"error_message" text,
	"created_at" timestamp DEFAULT now(),
	"store_id" integer,
	"type" text NOT NULL,
	"phone_number" text,
	"message_content" text,
	"raw_data" text,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"access_token" text,
	"phone_number_id" text,
	"business_account_id" text,
	"webhook_verify_token" text,
	"webhook_url" text,
	"is_active" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"store_id" integer,
	"app_id" text,
	"phone_number" text
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
	CONSTRAINT "customer_loyalty_balance_customer_id_key" UNIQUE("customer_id")
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"total_price" numeric(10, 2) NOT NULL,
	"store_id" integer,
	"installation_cost" numeric(10, 2),
	"parts_cost" numeric(10, 2),
	"labor_hours" numeric(4, 2),
	"labor_rate" numeric(10, 2),
	"delivery_cost" numeric(10, 2) DEFAULT '0',
	"delivery_distance" numeric(8, 2),
	"notes" text,
	"unit_id" integer,
	"quantity_in_base_unit" numeric(12, 4)
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
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "unique_product_conversion" UNIQUE("product_id","source_unit_id","target_unit_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"role" text DEFAULT 'technician' NOT NULL,
	"status" text DEFAULT 'active',
	"last_login" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"store_id" integer,
	"permissions" text[],
	"avatar" text,
	"address" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"employee_profile_id" integer,
	"hire_date" timestamp DEFAULT now(),
	"department" text,
	"current_orders" integer,
	"province" text,
	"municipality" text,
	"sector" text,
	"coverage_provinces" text[],
	"coverage_municipalities" text[],
	"specializations" text[],
	"skill_level" integer DEFAULT 1,
	"coverage_sectors" text[],
	"max_daily_orders" integer[],
	"role_id" integer,
	CONSTRAINT "users_username_key" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_view_id_fkey" FOREIGN KEY ("view_id") REFERENCES "public"."views"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_adjusted_by_fkey" FOREIGN KEY ("adjusted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_adjustment_items" ADD CONSTRAINT "inventory_adjustment_items_adjustment_id_fkey" FOREIGN KEY ("adjustment_id") REFERENCES "public"."inventory_adjustments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_adjustment_items" ADD CONSTRAINT "inventory_adjustment_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_titular_id_fkey" FOREIGN KEY ("titular_id") REFERENCES "public"."appointment_titulares"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_service_type_id_fkey" FOREIGN KEY ("service_type_id") REFERENCES "public"."appointment_service_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_credit_accounts" ADD CONSTRAINT "customer_credit_accounts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_withdrawals" ADD CONSTRAINT "cash_withdrawals_cashier_id_fkey" FOREIGN KEY ("cashier_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_withdrawals" ADD CONSTRAINT "cash_withdrawals_authorized_by_user_id_fkey" FOREIGN KEY ("authorized_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_withdrawals" ADD CONSTRAINT "cash_withdrawals_voided_by_user_id_fkey" FOREIGN KEY ("voided_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_register_sessions" ADD CONSTRAINT "cash_register_sessions_cashier_id_fkey" FOREIGN KEY ("cashier_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_register_sessions" ADD CONSTRAINT "cash_register_sessions_closed_by_user_id_fkey" FOREIGN KEY ("closed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_register_sessions" ADD CONSTRAINT "cash_register_sessions_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_customer_type_id_fkey" FOREIGN KEY ("customer_type_id") REFERENCES "public"."customer_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_updatedby_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_registration_flows" ADD CONSTRAINT "fk_customer_registration_flows_customer_id" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_registration_flows" ADD CONSTRAINT "fk_customer_registration_flows_order_id" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_history" ADD CONSTRAINT "notification_history_config_id_fkey" FOREIGN KEY ("config_id") REFERENCES "public"."notification_configs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_points_transactions" ADD CONSTRAINT "loyalty_points_transactions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_points_transactions" ADD CONSTRAINT "loyalty_points_transactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_configs" ADD CONSTRAINT "notification_configs_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."notification_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_configs" ADD CONSTRAINT "notification_configs_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."notification_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "fk_products_base_unit_id" FOREIGN KEY ("base_unit_id") REFERENCES "public"."measurement_units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_orders" ADD CONSTRAINT "trip_orders_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_orders" ADD CONSTRAINT "trip_orders_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_loyalty_balance" ADD CONSTRAINT "customer_loyalty_balance_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "fk_order_items_unit_id" FOREIGN KEY ("unit_id") REFERENCES "public"."measurement_units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_unit_conversions" ADD CONSTRAINT "fk_product_id" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_unit_conversions" ADD CONSTRAINT "fk_source_unit_id" FOREIGN KEY ("source_unit_id") REFERENCES "public"."measurement_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_unit_conversions" ADD CONSTRAINT "fk_target_unit_id" FOREIGN KEY ("target_unit_id") REFERENCES "public"."measurement_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_role_permissions_role_id" ON "role_permissions" USING btree ("role_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_role_permissions_view_id" ON "role_permissions" USING btree ("view_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_user_roles_role_id" ON "user_roles" USING btree ("role_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_user_roles_user_id" ON "user_roles" USING btree ("user_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_inv_adj_created_at" ON "inventory_adjustments" USING btree ("created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "idx_inv_adj_store_id" ON "inventory_adjustments" USING btree ("store_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_inv_adj_items_adj_id" ON "inventory_adjustment_items" USING btree ("adjustment_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_inv_adj_items_product_id" ON "inventory_adjustment_items" USING btree ("product_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_appointments_customer_id" ON "appointments" USING btree ("customer_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_appointments_date" ON "appointments" USING btree ("appointment_date" timestamp_ops);--> statement-breakpoint
CREATE INDEX "idx_appointments_status" ON "appointments" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "idx_appointments_store_id" ON "appointments" USING btree ("store_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_cash_withdrawals_cashier_id" ON "cash_withdrawals" USING btree ("cashier_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_cash_withdrawals_created_at" ON "cash_withdrawals" USING btree ("created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "idx_cash_withdrawals_store_id" ON "cash_withdrawals" USING btree ("store_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_cash_withdrawals_voided" ON "cash_withdrawals" USING btree ("voided" bool_ops);--> statement-breakpoint
CREATE INDEX "idx_cash_reg_cashier" ON "cash_register_sessions" USING btree ("cashier_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_cash_reg_opened_at" ON "cash_register_sessions" USING btree ("opened_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "idx_cash_reg_status" ON "cash_register_sessions" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "idx_cash_reg_store_id" ON "cash_register_sessions" USING btree ("store_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_store_6_assignment_rules_assigned_users" ON "assignment_rules" USING gin ("assigned_user_ids" array_ops);--> statement-breakpoint
CREATE INDEX "idx_brands_active" ON "brands" USING btree ("isActive" bool_ops);--> statement-breakpoint
CREATE INDEX "idx_brands_name" ON "brands" USING btree ("name" text_ops);--> statement-breakpoint
CREATE INDEX "idx_brands_sort" ON "brands" USING btree ("sortOrder" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_conversation_context_customer" ON "conversation_context" USING btree ("customer_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_conversation_context_expires" ON "conversation_context" USING btree ("expires_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "idx_conversation_context_phone" ON "conversation_context" USING btree ("phone_number" text_ops);--> statement-breakpoint
CREATE INDEX "idx_conversations_customer_id" ON "conversations" USING btree ("customer_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_conversations_last_message_at" ON "conversations" USING btree ("last_message_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "idx_conversations_status" ON "conversations" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "idx_customers_category" ON "customers" USING btree ("category" text_ops);--> statement-breakpoint
CREATE INDEX "idx_customers_customer_type_id" ON "customers" USING btree ("customer_type_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_customers_is_active" ON "customers" USING btree ("is_active" bool_ops);--> statement-breakpoint
CREATE INDEX "idx_customer_types_is_active" ON "customer_types" USING btree ("is_active" bool_ops);--> statement-breakpoint
CREATE INDEX "idx_customer_types_store_id" ON "customer_types" USING btree ("store_id" int4_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_exchange_rates_unique" ON "exchange_rates" USING btree ("base_currency" int4_ops,"target_currency" int4_ops,"store_id" int4_ops) WHERE (is_active = true);--> statement-breakpoint
CREATE INDEX "idx_notifications_related" ON "notifications" USING btree ("related_id" int4_ops,"related_type" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_inventory_movements_expiration_date" ON "inventory_movements" USING btree ("expiration_date" timestamp_ops);--> statement-breakpoint
CREATE INDEX "idx_inventory_movements_lot_number" ON "inventory_movements" USING btree ("lot_number" text_ops);--> statement-breakpoint
CREATE INDEX "idx_inventory_movements_reference" ON "inventory_movements" USING btree ("reference_type" int4_ops,"reference_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_inventory_movements_supplier_id" ON "inventory_movements" USING btree ("supplier_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_inventory_movements_type" ON "inventory_movements" USING btree ("type" text_ops);--> statement-breakpoint
CREATE INDEX "idx_messages_conversation_id" ON "messages" USING btree ("conversation_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_messages_sent_at" ON "messages" USING btree ("sent_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "idx_messages_whatsapp_id" ON "messages" USING btree ("whatsapp_message_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_notification_history_created_at" ON "notification_history" USING btree ("created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "idx_notification_history_order_id" ON "notification_history" USING btree ("order_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_notification_history_recipient_id" ON "notification_history" USING btree ("recipient_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_notification_history_status" ON "notification_history" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "idx_loyalty_transactions_created_at" ON "loyalty_points_transactions" USING btree ("created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "idx_loyalty_transactions_customer_id" ON "loyalty_points_transactions" USING btree ("customer_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_loyalty_transactions_order_id" ON "loyalty_points_transactions" USING btree ("order_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_loyalty_transactions_store_id" ON "loyalty_points_transactions" USING btree ("store_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_loyalty_transactions_type" ON "loyalty_points_transactions" USING btree ("type" text_ops);--> statement-breakpoint
CREATE INDEX "idx_measurement_units_active" ON "measurement_units" USING btree ("is_active" bool_ops) WHERE (is_active = true);--> statement-breakpoint
CREATE INDEX "idx_measurement_units_store_id" ON "measurement_units" USING btree ("store_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_measurement_units_type" ON "measurement_units" USING btree ("type" text_ops);--> statement-breakpoint
CREATE INDEX "idx_notification_configs_channel_id" ON "notification_configs" USING btree ("channel_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_notification_configs_enabled" ON "notification_configs" USING btree ("is_enabled" bool_ops);--> statement-breakpoint
CREATE INDEX "idx_notification_configs_event_id" ON "notification_configs" USING btree ("event_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_order_notes_created_at" ON "order_notes" USING btree ("created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "idx_order_notes_customer_id" ON "order_notes" USING btree ("customer_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_order_notes_order_id" ON "order_notes" USING btree ("order_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_products_barcode" ON "products" USING btree ("barcode" text_ops);--> statement-breakpoint
CREATE INDEX "idx_products_base_unit_id" ON "products" USING btree ("base_unit_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_products_type" ON "products" USING btree ("type" text_ops);--> statement-breakpoint
CREATE INDEX "idx_products_unit_conversion_enabled" ON "products" USING btree ("unit_conversion_enabled" bool_ops) WHERE (unit_conversion_enabled = true);--> statement-breakpoint
CREATE INDEX "idx_po_items_lot_number" ON "purchase_order_items" USING btree ("lot_number" text_ops);--> statement-breakpoint
CREATE INDEX "idx_po_items_product_id" ON "purchase_order_items" USING btree ("product_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_po_items_purchase_order_id" ON "purchase_order_items" USING btree ("purchase_order_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_po_items_store_id" ON "purchase_order_items" USING btree ("store_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_orders_trip" ON "orders" USING btree ("trip_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_purchase_orders_number" ON "purchase_orders" USING btree ("purchase_number" text_ops);--> statement-breakpoint
CREATE INDEX "idx_purchase_orders_order_date" ON "purchase_orders" USING btree ("order_date" timestamp_ops);--> statement-breakpoint
CREATE INDEX "idx_purchase_orders_status" ON "purchase_orders" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "idx_purchase_orders_store_id" ON "purchase_orders" USING btree ("store_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_purchase_orders_supplier_id" ON "purchase_orders" USING btree ("supplier_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_trips_assigned_user" ON "trips" USING btree ("assigned_user_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_trips_created" ON "trips" USING btree ("created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "idx_trips_status" ON "trips" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "idx_trips_store" ON "trips" USING btree ("store_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_trip_orders_order" ON "trip_orders" USING btree ("order_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_trip_orders_status" ON "trip_orders" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "idx_trip_orders_trip" ON "trip_orders" USING btree ("trip_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_suppliers_is_active" ON "suppliers" USING btree ("is_active" bool_ops);--> statement-breakpoint
CREATE INDEX "idx_suppliers_name" ON "suppliers" USING btree ("name" text_ops);--> statement-breakpoint
CREATE INDEX "idx_suppliers_store_id" ON "suppliers" USING btree ("store_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_loyalty_balance_customer_id" ON "customer_loyalty_balance" USING btree ("customer_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_loyalty_balance_store_id" ON "customer_loyalty_balance" USING btree ("store_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_order_items_unit_id" ON "order_items" USING btree ("unit_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_product_unit_conversions_active" ON "product_unit_conversions" USING btree ("is_active" bool_ops) WHERE (is_active = true);--> statement-breakpoint
CREATE INDEX "idx_product_unit_conversions_product_id" ON "product_unit_conversions" USING btree ("product_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_product_unit_conversions_source_unit" ON "product_unit_conversions" USING btree ("source_unit_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_product_unit_conversions_store_id" ON "product_unit_conversions" USING btree ("store_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_product_unit_conversions_target_unit" ON "product_unit_conversions" USING btree ("target_unit_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_users_current_orders" ON "users" USING btree ("current_orders" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_users_province" ON "users" USING btree ("province" text_ops);--> statement-breakpoint
CREATE INDEX "idx_users_role" ON "users" USING btree ("role" text_ops);--> statement-breakpoint
CREATE INDEX "idx_users_status" ON "users" USING btree ("status" text_ops);--> statement-breakpoint
CREATE VIEW "public"."active_orders_view" AS (SELECT o.id, o.order_number, o.customer_id, o.status, o.total_amount, o.delivery_cost, o.assigned_to, o.notes, o.created_at, o.updated_at, o.store_id, o.delivery_address, o.estimated_delivery, o.payment_method, o.payment_status, o.assigned_user_id, o.description, o.priority, o.estimated_delivery_time, o.last_status_update, o.customer_last_interaction, o.modification_count, c.name AS customer_name, c.phone AS customer_phone, count(oi.id) AS item_count, COALESCE(sum(oi.quantity), 0::bigint) AS total_items FROM orders o LEFT JOIN customers c ON o.customer_id = c.id LEFT JOIN order_items oi ON o.id = oi.order_id WHERE o.status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'processing'::text, 'shipped'::text]) GROUP BY o.id, c.name, c.phone);
*/