CREATE TABLE "assignment_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true,
	"priority" integer DEFAULT 1,
	"use_location_based" boolean DEFAULT true,
	"max_distance_km" numeric(5, 2) DEFAULT '15.0',
	"use_specialization_based" boolean DEFAULT true,
	"required_specializations" text[],
	"use_workload_based" boolean DEFAULT true,
	"max_orders_per_technician" integer DEFAULT 5,
	"use_time_based" boolean DEFAULT true,
	"availability_required" boolean DEFAULT true,
	"applicable_products" text[],
	"applicable_services" text[],
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
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"order_id" integer,
	"conversation_type" text DEFAULT 'initial' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_message_at" timestamp DEFAULT now() NOT NULL,
	"store_id" integer NOT NULL
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
CREATE TABLE "customer_registration_flows" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer,
	"phone_number" text NOT NULL,
	"current_step" text NOT NULL,
	"collected_data" text,
	"requested_service" text,
	"is_completed" boolean DEFAULT false,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"store_id" integer NOT NULL,
	"whatsapp_id" text,
	"address" text,
	"latitude" numeric(10, 8),
	"longitude" numeric(11, 8),
	"map_link" text,
	"last_contact" timestamp,
	"registration_date" timestamp DEFAULT now(),
	"total_orders" integer DEFAULT 0,
	"total_spent" numeric(10, 2) DEFAULT '0.00',
	"is_vip" boolean DEFAULT false,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "customers_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "employee_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"employee_id" text NOT NULL,
	"department" text NOT NULL,
	"position" text NOT NULL,
	"specializations" text[],
	"work_schedule" text,
	"emergency_contact" text,
	"emergency_phone" text,
	"vehicle_info" text,
	"certifications" text[],
	"salary" numeric(10, 2),
	"commission_rate" numeric(5, 2),
	"territory" text,
	"base_latitude" numeric(10, 8),
	"base_longitude" numeric(11, 8),
	"base_address" text,
	"service_radius" numeric(5, 2) DEFAULT '10.0',
	"max_daily_orders" integer DEFAULT 5,
	"current_orders" integer DEFAULT 0,
	"availability_hours" text,
	"skill_level" integer DEFAULT 1,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "employee_profiles_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "employee_profiles_employee_id_unique" UNIQUE("employee_id")
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
	"sent_at" timestamp DEFAULT now() NOT NULL
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
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_number" text NOT NULL,
	"customer_id" integer NOT NULL,
	"assigned_user_id" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"total_amount" numeric(10, 2) NOT NULL,
	"description" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"store_id" integer NOT NULL,
	CONSTRAINT "orders_order_number_unique" UNIQUE("order_number")
);
--> statement-breakpoint
CREATE TABLE "product_categories" (
	"id" serial PRIMARY KEY NOT NULL,
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
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price" numeric(10, 2) NOT NULL,
	"category" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"image_url" text,
	"images" text[],
	"sku" text,
	"brand" text,
	"model" text,
	"specifications" text,
	"features" text[],
	"warranty" text,
	"availability" text DEFAULT 'in_stock' NOT NULL,
	"stock_quantity" integer DEFAULT 0,
	"min_quantity" integer DEFAULT 1,
	"max_quantity" integer,
	"weight" numeric(8, 2),
	"dimensions" text,
	"tags" text[],
	"sale_price" numeric(10, 2),
	"is_promoted" boolean DEFAULT false,
	"promotion_text" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"store_id" integer NOT NULL,
	CONSTRAINT "products_sku_unique" UNIQUE("sku")
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
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "store_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"plan_id" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"start_date" timestamp DEFAULT now(),
	"end_date" timestamp,
	"auto_renew" boolean DEFAULT true,
	"current_products" integer DEFAULT 0,
	"current_db_storage_gb" numeric(8, 2) DEFAULT '0.00',
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
CREATE TABLE "subscription_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"type" text DEFAULT 'fixed' NOT NULL,
	"is_active" boolean DEFAULT true,
	"monthly_price" numeric(10, 2) DEFAULT '0.00',
	"max_products" integer DEFAULT -1,
	"max_db_storage" numeric(10, 2) DEFAULT '-1',
	"max_whatsapp_messages" integer DEFAULT -1,
	"max_users" integer DEFAULT -1,
	"max_orders" integer DEFAULT -1,
	"max_customers" integer DEFAULT -1,
	"price_per_product" numeric(10, 4) DEFAULT '0.00',
	"price_per_message" numeric(10, 4) DEFAULT '0.00',
	"price_per_gb_storage" numeric(10, 2) DEFAULT '0.00',
	"price_per_order" numeric(10, 4) DEFAULT '0.00',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "subscription_plans_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "system_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"store_id" integer,
	"action" text NOT NULL,
	"resource" text NOT NULL,
	"resource_id" text,
	"details" text,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "system_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"role" text DEFAULT 'store_admin' NOT NULL,
	"store_id" integer,
	"is_active" boolean DEFAULT true,
	"last_login" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "system_users_username_unique" UNIQUE("username"),
	CONSTRAINT "system_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "usage_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"subscription_id" integer NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"products_used" integer DEFAULT 0,
	"db_storage_used_gb" numeric(8, 2) DEFAULT '0.00',
	"whatsapp_messages_used" integer DEFAULT 0,
	"users_active" integer DEFAULT 0,
	"orders_processed" integer DEFAULT 0,
	"customers_active" integer DEFAULT 0,
	"fixed_cost" numeric(10, 2) DEFAULT '0.00',
	"usage_cost" numeric(10, 2) DEFAULT '0.00',
	"total_cost" numeric(10, 2) DEFAULT '0.00',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"phone" text,
	"email" text,
	"address" text,
	"avatar" text,
	"hire_date" timestamp DEFAULT now(),
	"is_active" boolean DEFAULT true NOT NULL,
	"department" text,
	"permissions" text[],
	"store_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "virtual_stores" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"logo" text,
	"domain" text,
	"whatsapp_number" text,
	"address" text,
	"timezone" text DEFAULT 'America/Mexico_City',
	"currency" text DEFAULT 'MXN',
	"is_active" boolean DEFAULT true,
	"subscription" text DEFAULT 'free',
	"subscription_expiry" timestamp,
	"subscription_plan_id" integer,
	"database_url" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"owner_id" integer,
	"settings" text,
	CONSTRAINT "virtual_stores_slug_unique" UNIQUE("slug")
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
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_history" ADD CONSTRAINT "customer_history_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_registration_flows" ADD CONSTRAINT "customer_registration_flows_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_store_id_virtual_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."virtual_stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_profiles" ADD CONSTRAINT "employee_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_history" ADD CONSTRAINT "order_history_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_history" ADD CONSTRAINT "order_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_cart" ADD CONSTRAINT "shopping_cart_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_cart" ADD CONSTRAINT "shopping_cart_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_subscriptions" ADD CONSTRAINT "store_subscriptions_store_id_virtual_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."virtual_stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_subscriptions" ADD CONSTRAINT "store_subscriptions_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_audit_log" ADD CONSTRAINT "system_audit_log_user_id_system_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."system_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_audit_log" ADD CONSTRAINT "system_audit_log_store_id_virtual_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."virtual_stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_users" ADD CONSTRAINT "system_users_store_id_virtual_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."virtual_stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_history" ADD CONSTRAINT "usage_history_store_id_virtual_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."virtual_stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_history" ADD CONSTRAINT "usage_history_subscription_id_store_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."store_subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "virtual_stores" ADD CONSTRAINT "virtual_stores_subscription_plan_id_subscription_plans_id_fk" FOREIGN KEY ("subscription_plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_logs" ADD CONSTRAINT "whatsapp_logs_store_id_virtual_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."virtual_stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_settings" ADD CONSTRAINT "whatsapp_settings_store_id_virtual_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."virtual_stores"("id") ON DELETE no action ON UPDATE no action;