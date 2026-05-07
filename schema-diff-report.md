# Diff esquema producción ↔ shared/schema.ts

Fecha: 2026-05-07T17:19:52.740Z

- Tablas en producción: **63**
- Tablas en shared/schema.ts: **56**

## Tablas SOLO en producción (faltan en schema.ts)

- `brands` (0 columnas)
- `categories` (2 columnas)
- `conversation_context` (8 columnas)
- `currencies` (5 columnas)
- `employee_profiles` (15 columnas)
- `exchange_rate_history` (8 columnas)
- `order_notes` (6 columnas)
- `role_permissions` (5 columnas)
- `roles` (5 columnas)
- `store_currency_settings` (10 columnas)
- `user_roles` (4 columnas)
- `users` (14 columnas)
- `views` (6 columnas)

## Tablas SOLO en schema.ts (no existen en producción)

- `ai_credits` (16 columnas)
- `invoices` (12 columnas)
- `payments` (10 columnas)
- `paypal_integration` (5 columnas)
- `system_users` (0 columnas)
- `virtual_stores` (0 columnas)

## Tablas en común — diferencias de columnas

### `ai_conversations`

**Columnas en prod NO declaradas en schema.ts** (riesgo de pérdida si se hace push):
- `conversation_context` _(text)_
- `conversation_id` _(integer)_
- `draft_order_id` _(integer)_
- `is_active` _(boolean)_
- `message_count` _(integer)_
- `pending_product_selection` _(text)_
- `pending_products_by_index` _(text)_
- `started_at` _(timestamp)_

**Columnas en schema.ts NO presentes en prod** (se crearían si se hace push):
- `id` _(serial)_
- `mode` _(text)_

### `ai_product_matches`

**Columnas en prod NO declaradas en schema.ts** (riesgo de pérdida si se hace push):
- `matched_products` _(text)_
- `search_query` _(text)_
- `times_used` _(integer)_

**Columnas en schema.ts NO presentes en prod** (se crearían si se hace push):
- `id` _(serial)_

### `ai_usage_log`

**Columnas en prod NO declaradas en schema.ts** (riesgo de pérdida si se hace push):
- `conversation_id` _(integer)_
- `credits_cost` _(integer)_
- `input_text` _(text)_
- `operation_type` _(text)_
- `processing_time_ms` _(integer)_
- `was_successful` _(boolean)_

**Columnas en schema.ts NO presentes en prod** (se crearían si se hace push):
- `confidence` _(decimal)_
- `id` _(serial)_
- `interpretation` _(text)_

### `appointment_service_types`

**Columnas en prod NO declaradas en schema.ts** (riesgo de pérdida si se hace push):
- `base_price` _(numeric)_
- `min_price` _(numeric)_

**Columnas en schema.ts NO presentes en prod** (se crearían si se hace push):
- `category` _(text)_
- `duration` _(integer)_
- `id` _(serial)_
- `name` _(text)_

### `appointment_titulares`

**Columnas en schema.ts NO presentes en prod** (se crearían si se hace push):
- `id` _(serial)_
- `name` _(text)_
- `specialty` _(text)_

### `appointments`

**Columnas en prod NO declaradas en schema.ts** (riesgo de pérdida si se hace push):
- `order_id` _(integer)_
- `payment_method` _(text)_

**Columnas en schema.ts NO presentes en prod** (se crearían si se hace push):
- `description` _(text)_
- `id` _(serial)_
- `notes` _(text)_
- `status` _(text)_
- `title` _(text)_

### `assignment_rules`

**Columnas en prod NO declaradas en schema.ts** (riesgo de pérdida si se hace push):
- `applicable_products` _(text)_
- `assigned_user_ids` _(integer)_
- `assignment_method` _(text)_
- `read_at` _(timestamp)_
- `store_id` _(integer)_
- `use_sector_based` _(boolean)_
- `use_specialization_based` _(boolean)_
- `use_time_based` _(boolean)_
- `use_workload_based` _(boolean)_

**Columnas en schema.ts NO presentes en prod** (se crearían si se hace push):
- `id` _(serial)_
- `name` _(text)_
- `priority` _(integer)_

### `auto_responses`

**Columnas en prod NO declaradas en schema.ts** (riesgo de pérdida si se hace push):
- `created_at` _(timestamp)_
- `interactive_data` _(jsonb)_
- `is_active` _(boolean)_
- `is_interactive` _(boolean)_
- `max_retries` _(integer)_
- `menu_type` _(text)_
- `next_action` _(text)_
- `show_back_button` _(boolean)_
- `trigger_text` _(text)_

**Columnas en schema.ts NO presentes en prod** (se crearían si se hace push):
- `id` _(serial)_
- `priority` _(integer)_
- `trigger` _(text)_

### `cash_register_sessions`

**Columnas en prod NO declaradas en schema.ts** (riesgo de pérdida si se hace push):
- `approved_by_user_id` _(integer)_
- `cash_difference` _(numeric)_
- `cash_expected` _(numeric)_
- `cash_reported` _(numeric)_
- `discrepancy_note` _(text)_
- `opening_amount` _(numeric)_
- `total_orders` _(integer)_

**Columnas en schema.ts NO presentes en prod** (se crearían si se hace push):
- `id` _(serial)_

### `cash_withdrawals`

**Columnas en schema.ts NO presentes en prod** (se crearían si se hace push):
- `amount` _(decimal)_
- `concept` _(text)_
- `currency` _(text)_
- `id` _(serial)_
- `notes` _(text)_

### `conversations`

**Columnas en prod NO declaradas en schema.ts** (riesgo de pérdida si se hace push):
- `channel_type` _(text)_
- `created_at` _(timestamp)_
- `last_message_at` _(timestamp)_
- `read_at` _(timestamp)_
- `unread_count` _(integer)_
- `webapp_enabled_until` _(timestamp)_
- `whatsapp_id` _(text)_

**Columnas en schema.ts NO presentes en prod** (se crearían si se hace push):
- `id` _(serial)_

### `credit_transactions`

**Columnas en prod NO declaradas en schema.ts** (riesgo de pérdida si se hace push):
- `created_by` _(integer)_

**Columnas en schema.ts NO presentes en prod** (se crearían si se hace push):
- `description` _(text)_
- `id` _(serial)_
- `type` _(text)_

### `customer_credit_accounts`

**Columnas en schema.ts NO presentes en prod** (se crearían si se hace push):
- `id` _(serial)_

### `customer_history`

**Columnas en prod NO declaradas en schema.ts** (riesgo de pérdida si se hace push):
- `created_at` _(timestamp)_
- `event_data` _(jsonb)_
- `event_type` _(text)_
- `order_id` _(integer)_
- `store_id` _(integer)_

**Columnas en schema.ts NO presentes en prod** (se crearían si se hace push):
- `action` _(text)_
- `amount` _(decimal)_
- `id` _(serial)_
- `metadata` _(text)_

### `customer_loyalty_balance`

**Columnas en prod NO declaradas en schema.ts** (riesgo de pérdida si se hace push):
- `created_at` _(timestamp)_
- `current_balance` _(numeric)_
- `last_earned_at` _(timestamp)_
- `last_redeemed_at` _(timestamp)_
- `loyalty_program_name` _(text)_
- `points_property_name` _(text)_
- `store_id` _(integer)_
- `total_points_earned` _(numeric)_
- `total_points_redeemed` _(numeric)_

**Columnas en schema.ts NO presentes en prod** (se crearían si se hace push):
- `id` _(serial)_

### `customer_registration_flows`

**Columnas en prod NO declaradas en schema.ts** (riesgo de pérdida si se hace push):
- `order_id` _(integer)_
- `order_number` _(text)_
- `store_id` _(integer)_

**Columnas en schema.ts NO presentes en prod** (se crearían si se hace push):
- `id` _(serial)_

### `customer_types`

**Columnas en prod NO declaradas en schema.ts** (riesgo de pérdida si se hace push):
- `is_active` _(boolean)_
- `sort_order` _(integer)_

**Columnas en schema.ts NO presentes en prod** (se crearían si se hace push):
- `color` _(text)_
- `id` _(serial)_
- `name` _(text)_

### `customers`

**Columnas en prod NO declaradas en schema.ts** (riesgo de pérdida si se hace push):
- `company_name` _(text)_
- `contact_method` _(text)_
- `created_at` _(timestamp)_
- `customer_type` _(text)_
- `customer_type_id` _(integer)_
- `is_vip` _(boolean)_
- `last_contact` _(timestamp)_
- `parent_customer_id` _(integer)_
- `preferred_contact_time` _(text)_
- `tax_id` _(text)_
- `total_orders` _(integer)_
- `updated_at` _(timestamp)_
- `whatsapp_name` _(text)_

**Columnas en schema.ts NO presentes en prod** (se crearían si se hace push):
- `email` _(text)_
- `id` _(serial)_
- `latitude` _(decimal)_
- `longitude` _(decimal)_
- `name` _(text)_
- `phone` _(text)_

### `exchange_rates`

**Columnas en prod NO declaradas en schema.ts** (riesgo de pérdida si se hace push):
- `target_currency` _(varchar)_

**Columnas en schema.ts NO presentes en prod** (se crearían si se hace push):
- `id` _(serial)_

### `inventory_adjustment_items`

**Columnas en schema.ts NO presentes en prod** (se crearían si se hace push):
- `difference` _(integer)_
- `id` _(serial)_

### `inventory_adjustments`

**Columnas en schema.ts NO presentes en prod** (se crearían si se hace push):
- `id` _(serial)_
- `notes` _(text)_

### `inventory_movements`

**Columnas en prod NO declaradas en schema.ts** (riesgo de pérdida si se hace push):
- `created_at` _(timestamp)_
- `lot_number` _(text)_
- `quantity_after` _(numeric)_
- `reference_id` _(integer)_
- `reference_type` _(text)_
- `unit_cost` _(numeric)_
- `unit_id` _(integer)_

**Columnas en schema.ts NO presentes en prod** (se crearían si se hace push):
- `id` _(serial)_
- `reason` _(text)_

### `loyalty_points_transactions`

**Columnas en prod NO declaradas en schema.ts** (riesgo de pérdida si se hace push):
- `balance_before` _(numeric)_
- `created_at` _(timestamp)_
- `order_id` _(integer)_

**Columnas en schema.ts NO presentes en prod** (se crearían si se hace push):
- `id` _(serial)_

### `measurement_units`

**Columnas en prod NO declaradas en schema.ts** (riesgo de pérdida si se hace push):
- `created_at` _(timestamp)_
- `is_active` _(boolean)_

**Columnas en schema.ts NO presentes en prod** (se crearían si se hace push):
- `id` _(serial)_
- `name` _(text)_

### `messages`

**Columnas en prod NO declaradas en schema.ts** (riesgo de pérdida si se hace push):
- `is_read` _(boolean)_
- `message_type` _(text)_
- `sender_type` _(text)_
- `sent_at` _(timestamp)_
- `store_id` _(integer)_

**Columnas en schema.ts NO presentes en prod** (se crearían si se hace push):
- `id` _(serial)_
- `isFromCustomer` _(boolean)_
- `metadata` _(text)_
- `sender` _(text)_

### `notification_channels`

**Columnas en prod NO declaradas en schema.ts** (riesgo de pérdida si se hace push):
- `created_at` _(timestamp)_
- `is_enabled` _(boolean)_

**Columnas en schema.ts NO presentes en prod** (se crearían si se hace push):
- `id` _(serial)_
- `name` _(text)_
- `settings` _(jsonb)_

### `notification_configs`

**Columnas en prod NO declaradas en schema.ts** (riesgo de pérdida si se hace push):
- `created_at` _(timestamp)_
- `custom_recipients` _(integer)_
- `delay_minutes` _(integer)_

**Columnas en schema.ts NO presentes en prod** (se crearían si se hace push):
- `id` _(serial)_

### `notification_events`

**Columnas en prod NO declaradas en schema.ts** (riesgo de pérdida si se hace push):
- `event_name` _(text)_

**Columnas en schema.ts NO presentes en prod** (se crearían si se hace push):
- `description` _(text)_
- `id` _(serial)_

### `notification_history`

**Columnas en prod NO declaradas en schema.ts** (riesgo de pérdida si se hace push):
- `created_at` _(timestamp)_
- `recipient_id` _(integer)_
- `recipient_type` _(text)_
- `sent_at` _(timestamp)_

**Columnas en schema.ts NO presentes en prod** (se crearían si se hace push):
- `channel` _(text)_
- `id` _(serial)_
- `message` _(text)_
- `metadata` _(jsonb)_
- `status` _(text)_
- `title` _(text)_

### `notifications`

**Columnas en prod NO declaradas en schema.ts** (riesgo de pérdida si se hace push):
- `created_at` _(timestamp)_
- `is_read` _(boolean)_
- `related_type` _(text)_
- `store_id` _(integer)_

**Columnas en schema.ts NO presentes en prod** (se crearían si se hace push):
- `id` _(serial)_
- `message` _(text)_
- `title` _(text)_
- `type` _(text)_

### `order_history`

**Columnas en prod NO declaradas en schema.ts** (riesgo de pérdida si se hace push):
- `changed_by` _(integer)_
- `created_at` _(timestamp)_
- `store_id` _(integer)_

**Columnas en schema.ts NO presentes en prod** (se crearían si se hace push):
- `action` _(text)_
- `id` _(serial)_
- `timestamp` _(timestamp)_

### `order_items`

**Columnas en prod NO declaradas en schema.ts** (riesgo de pérdida si se hace push):
- `delivery_cost` _(numeric)_
- `installation_cost` _(numeric)_
- `quantity_in_base_unit` _(numeric)_
- `unit_id` _(integer)_

**Columnas en schema.ts NO presentes en prod** (se crearían si se hace push):
- `id` _(serial)_
- `quantity` _(integer)_

### `orders`

**Columnas en prod NO declaradas en schema.ts** (riesgo de pérdida si se hace push):
- `assigned_to` _(integer)_
- `assigned_user_id` _(integer)_
- `contact_number` _(text)_
- `created_at` _(timestamp)_
- `customer_last_interaction` _(timestamp)_
- `customer_province` _(text)_
- `delivery_address` _(text)_
- `delivery_cost` _(numeric)_
- `estimated_delivery` _(timestamp)_
- `estimated_delivery_time` _(varchar)_
- `last_status_update` _(timestamp)_
- `loyalty_points_credited_at` _(timestamp)_
- `loyalty_points_property_name` _(text)_
- `modification_count` _(integer)_
- `payment_method` _(text)_
- `payment_status` _(text)_
- `received_amount` _(numeric)_
- `store_id` _(integer)_
- `subtotal_amount` _(numeric)_
- `trip_id` _(integer)_

**Columnas en schema.ts NO presentes en prod** (se crearían si se hace push):
- `description` _(text)_
- `id` _(serial)_
- `priority` _(text)_
- `status` _(text)_

### `product_brands`

**Columnas en schema.ts NO presentes en prod** (se crearían si se hace push):
- `description` _(text)_
- `id` _(serial)_
- `logo` _(text)_
- `name` _(text)_

### `product_categories`

**Columnas en prod NO declaradas en schema.ts** (riesgo de pérdida si se hace push):
- `image_url` _(text)_

**Columnas en schema.ts NO presentes en prod** (se crearían si se hace push):
- `description` _(text)_
- `id` _(serial)_
- `name` _(text)_

### `product_unit_conversions`

**Columnas en prod NO declaradas en schema.ts** (riesgo de pérdida si se hace push):
- `conversion_factor` _(numeric)_
- `created_at` _(timestamp)_
- `is_active` _(boolean)_
- `target_unit_id` _(integer)_

**Columnas en schema.ts NO presentes en prod** (se crearían si se hace push):
- `id` _(serial)_
- `notes` _(text)_

### `products`

**Columnas en prod NO declaradas en schema.ts** (riesgo de pérdida si se hace push):
- `base_unit_id` _(integer)_
- `created_at` _(timestamp)_
- `delivery_required` _(boolean)_
- `image_url` _(text)_
- `installation_time` _(integer)_
- `is_active` _(boolean)_
- `is_promoted` _(boolean)_
- `is_service` _(boolean)_
- `loyalty_points_property_name` _(text)_
- `loyalty_points_value` _(numeric)_
- `sale_price` _(numeric)_
- `stock_quantity` _(integer)_
- `unit_conversion_enabled` _(boolean)_

**Columnas en schema.ts NO presentes en prod** (se crearían si se hace push):
- `availability` _(text)_
- `category` _(text)_
- `description` _(text)_
- `id` _(serial)_
- `images` _(text)_
- `model` _(text)_
- `name` _(text)_
- `specifications` _(text)_
- `weight` _(decimal)_

### `purchase_order_items`

**Columnas en prod NO declaradas en schema.ts** (riesgo de pérdida si se hace push):
- `discount_rate` _(numeric)_
- `lot_number` _(text)_
- `product_id` _(integer)_
- `unit_cost` _(numeric)_

**Columnas en schema.ts NO presentes en prod** (se crearían si se hace push):
- `id` _(serial)_

### `purchase_orders`

**Columnas en prod NO declaradas en schema.ts** (riesgo de pérdida si se hace push):
- `created_by` _(integer)_
- `invoice_number` _(text)_
- `order_date` _(timestamp)_
- `payment_status` _(text)_
- `reference_number` _(text)_
- `supplier_id` _(integer)_

**Columnas en schema.ts NO presentes en prod** (se crearían si se hace push):
- `currency` _(text)_
- `discount` _(decimal)_
- `id` _(serial)_
- `tax` _(decimal)_

### `shopping_cart`

**Columnas en prod NO declaradas en schema.ts** (riesgo de pérdida si se hace push):
- `created_at` _(timestamp)_
- `product_id` _(integer)_
- `store_id` _(integer)_
- `user_id` _(integer)_

**Columnas en schema.ts NO presentes en prod** (se crearían si se hace push):
- `id` _(serial)_
- `notes` _(text)_
- `quantity` _(integer)_

### `store_settings`

**Columnas en prod NO declaradas en schema.ts** (riesgo de pérdida si se hace push):
- `business_hours` _(text)_
- `enable_notifications` _(boolean)_
- `invoice_footer` _(text)_
- `invoice_number` _(integer)_
- `logo_storage_path` _(text)_
- `logo_url` _(text)_
- `setting_value` _(text)_

**Columnas en schema.ts NO presentes en prod** (se crearían si se hace push):
- `currency` _(text)_
- `id` _(serial)_

### `store_subscriptions`

**Columnas en prod NO declaradas en schema.ts** (riesgo de pérdida si se hace push):
- `current_products` _(integer)_
- `last_billing_date` _(timestamp)_
- `start_date` _(timestamp)_

**Columnas en schema.ts NO presentes en prod** (se crearían si se hace push):
- `id` _(serial)_
- `status` _(text)_
- `total_due` _(decimal)_
- `total_paid` _(decimal)_

### `subscription_plans`

**Columnas en prod NO declaradas en schema.ts** (riesgo de pérdida si se hace push):
- `created_at` _(timestamp)_
- `is_active` _(boolean)_
- `max_customers` _(integer)_
- `max_db_storage` _(numeric)_
- `max_orders` _(integer)_
- `max_products` _(integer)_
- `max_users` _(integer)_
- `max_whatsapp_messages` _(integer)_
- `monthly_price` _(numeric)_
- `price_per_product` _(numeric)_

**Columnas en schema.ts NO presentes en prod** (se crearían si se hace push):
- `description` _(text)_
- `id` _(serial)_
- `name` _(text)_
- `type` _(text)_

### `suppliers`

**Columnas en schema.ts NO presentes en prod** (se crearían si se hace push):
- `address` _(text)_
- `email` _(text)_
- `id` _(serial)_
- `name` _(text)_
- `phone` _(text)_

### `system_audit_log`

**Columnas en prod NO declaradas en schema.ts** (riesgo de pérdida si se hace push):
- `ip_address` _(text)_

**Columnas en schema.ts NO presentes en prod** (se crearían si se hace push):
- `action` _(text)_
- `details` _(text)_
- `id` _(serial)_
- `resource` _(text)_

### `trip_orders`

**Columnas en prod NO declaradas en schema.ts** (riesgo de pérdida si se hace push):
- `picked_at` _(timestamp)_

**Columnas en schema.ts NO presentes en prod** (se crearían si se hace push):
- `id` _(serial)_
- `status` _(text)_

### `trips`

**Columnas en prod NO declaradas en schema.ts** (riesgo de pérdida si se hace push):
- `actual_duration` _(integer)_
- `assigned_user_id` _(integer)_
- `completed_at` _(timestamp)_
- `created_at` _(timestamp)_
- `started_at` _(timestamp)_
- `total_orders` _(integer)_

**Columnas en schema.ts NO presentes en prod** (se crearían si se hace push):
- `id` _(serial)_
- `status` _(text)_

### `usage_history`

**Columnas en prod NO declaradas en schema.ts** (riesgo de pérdida si se hace push):
- `fixed_cost` _(numeric)_
- `products_used` _(integer)_

**Columnas en schema.ts NO presentes en prod** (se crearían si se hace push):
- `id` _(serial)_

### `whatsapp_logs`

**Columnas en prod NO declaradas en schema.ts** (riesgo de pérdida si se hace push):
- `created_at` _(timestamp)_
- `error_message` _(text)_
- `from_number` _(text)_
- `message_content` _(text)_
- `message_type` _(text)_
- `phone_number` _(text)_
- `phone_number_id` _(text)_
- `to_number` _(text)_

**Columnas en schema.ts NO presentes en prod** (se crearían si se hace push):
- `id` _(serial)_
- `status` _(text)_
- `type` _(text)_

### `whatsapp_settings`

**Columnas en prod NO declaradas en schema.ts** (riesgo de pérdida si se hace push):
- `access_token` _(text)_
- `phone_number` _(text)_
- `webhook_url` _(text)_

**Columnas en schema.ts NO presentes en prod** (se crearían si se hace push):
- `id` _(serial)_

---

**Resumen:** 218 columnas en prod faltan en schema.ts · 143 columnas declaradas en schema.ts no existen en prod.