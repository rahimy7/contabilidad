import { pgTable, unique, serial, text, boolean, timestamp, index, foreignKey, integer, numeric, jsonb, varchar, uniqueIndex, check, pgView, bigint } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const roles = pgTable("roles", {
	id: serial().primaryKey().notNull(),
	name: text().notNull(),
	displayName: text("display_name").notNull(),
	description: text(),
	isSystem: boolean("is_system").default(false),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: timestamp("updated_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
	unique("roles_name_key").on(table.name),
]);

export const rolePermissions = pgTable("role_permissions", {
	id: serial().primaryKey().notNull(),
	roleId: integer("role_id").notNull(),
	viewId: integer("view_id").notNull(),
	canAccess: boolean("can_access").default(true),
	sortOrder: integer("sort_order").default(0),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
	index("idx_role_permissions_role_id").using("btree", table.roleId.asc().nullsLast().op("int4_ops")),
	index("idx_role_permissions_view_id").using("btree", table.viewId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.roleId],
			foreignColumns: [roles.id],
			name: "role_permissions_role_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.viewId],
			foreignColumns: [views.id],
			name: "role_permissions_view_id_fkey"
		}).onDelete("cascade"),
	unique("role_permissions_role_id_view_id_key").on(table.roleId, table.viewId),
]);

export const views = pgTable("views", {
	id: serial().primaryKey().notNull(),
	routePath: text("route_path").notNull(),
	label: text().notNull(),
	iconName: text("icon_name").notNull(),
	permissionRequired: text("permission_required").notNull(),
	section: text(),
	isSystem: boolean("is_system").default(false),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: timestamp("updated_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
	unique("views_route_path_key").on(table.routePath),
]);

export const userRoles = pgTable("user_roles", {
	id: serial().primaryKey().notNull(),
	userId: integer("user_id").notNull(),
	roleId: integer("role_id").notNull(),
	isPrimary: boolean("is_primary").default(true),
	assignedAt: timestamp("assigned_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
	index("idx_user_roles_role_id").using("btree", table.roleId.asc().nullsLast().op("int4_ops")),
	index("idx_user_roles_user_id").using("btree", table.userId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "user_roles_user_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.roleId],
			foreignColumns: [roles.id],
			name: "user_roles_role_id_fkey"
		}).onDelete("restrict"),
	unique("user_roles_user_id_role_id_key").on(table.userId, table.roleId),
]);

export const inventoryAdjustments = pgTable("inventory_adjustments", {
	id: serial().primaryKey().notNull(),
	storeId: integer("store_id").notNull(),
	adjustedBy: integer("adjusted_by"),
	notes: text(),
	totalItems: integer("total_items").default(0).notNull(),
	surplusItems: integer("surplus_items").default(0).notNull(),
	deficitItems: integer("deficit_items").default(0).notNull(),
	surplusValue: numeric("surplus_value", { precision: 14, scale:  2 }).default('0').notNull(),
	deficitValue: numeric("deficit_value", { precision: 14, scale:  2 }).default('0').notNull(),
	netAdjustmentValue: numeric("net_adjustment_value", { precision: 14, scale:  2 }).default('0').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_inv_adj_created_at").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("idx_inv_adj_store_id").using("btree", table.storeId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.adjustedBy],
			foreignColumns: [users.id],
			name: "inventory_adjustments_adjusted_by_fkey"
		}),
]);

export const inventoryAdjustmentItems = pgTable("inventory_adjustment_items", {
	id: serial().primaryKey().notNull(),
	adjustmentId: integer("adjustment_id").notNull(),
	productId: integer("product_id").notNull(),
	productName: text("product_name").notNull(),
	previousStock: integer("previous_stock").default(0).notNull(),
	realStock: integer("real_stock").default(0).notNull(),
	difference: integer().default(0).notNull(),
	unitPrice: numeric("unit_price", { precision: 12, scale:  2 }).default('0').notNull(),
	baseCurrency: text("base_currency").default('DOP').notNull(),
	adjustmentAmount: numeric("adjustment_amount", { precision: 14, scale:  2 }).default('0').notNull(),
}, (table) => [
	index("idx_inv_adj_items_adj_id").using("btree", table.adjustmentId.asc().nullsLast().op("int4_ops")),
	index("idx_inv_adj_items_product_id").using("btree", table.productId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.adjustmentId],
			foreignColumns: [inventoryAdjustments.id],
			name: "inventory_adjustment_items_adjustment_id_fkey"
		}),
	foreignKey({
			columns: [table.productId],
			foreignColumns: [products.id],
			name: "inventory_adjustment_items_product_id_fkey"
		}),
]);

export const appointmentTitulares = pgTable("appointment_titulares", {
	id: serial().primaryKey().notNull(),
	storeId: integer("store_id").notNull(),
	name: text().notNull(),
	specialty: text(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const appointmentServiceTypes = pgTable("appointment_service_types", {
	id: serial().primaryKey().notNull(),
	storeId: integer("store_id").notNull(),
	name: text().notNull(),
	category: text().default('general').notNull(),
	description: text(),
	duration: integer(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	basePrice: numeric("base_price", { precision: 10, scale:  2 }).default('0'),
	priceType: text("price_type").default('fixed').notNull(),
	minPrice: numeric("min_price", { precision: 10, scale:  2 }),
	maxPrice: numeric("max_price", { precision: 10, scale:  2 }),
});

export const appointments = pgTable("appointments", {
	id: serial().primaryKey().notNull(),
	storeId: integer("store_id").notNull(),
	customerId: integer("customer_id").notNull(),
	title: text().notNull(),
	description: text(),
	appointmentDate: timestamp("appointment_date", { mode: 'string' }).notNull(),
	appointmentEndDate: timestamp("appointment_end_date", { mode: 'string' }),
	status: text().default('scheduled').notNull(),
	notes: text(),
	createdBy: integer("created_by"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	titularId: integer("titular_id"),
	serviceTypeId: integer("service_type_id"),
	price: numeric({ precision: 10, scale:  2 }).default('0'),
	paymentStatus: text("payment_status").default('pending').notNull(),
	paymentMethod: text("payment_method"),
	orderId: integer("order_id"),
}, (table) => [
	index("idx_appointments_customer_id").using("btree", table.customerId.asc().nullsLast().op("int4_ops")),
	index("idx_appointments_date").using("btree", table.appointmentDate.asc().nullsLast().op("timestamp_ops")),
	index("idx_appointments_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("idx_appointments_store_id").using("btree", table.storeId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.customerId],
			foreignColumns: [customers.id],
			name: "appointments_customer_id_fkey"
		}),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "appointments_created_by_fkey"
		}),
	foreignKey({
			columns: [table.titularId],
			foreignColumns: [appointmentTitulares.id],
			name: "appointments_titular_id_fkey"
		}),
	foreignKey({
			columns: [table.serviceTypeId],
			foreignColumns: [appointmentServiceTypes.id],
			name: "appointments_service_type_id_fkey"
		}),
]);

export const customerCreditAccounts = pgTable("customer_credit_accounts", {
	id: serial().primaryKey().notNull(),
	customerId: integer("customer_id").notNull(),
	storeId: integer("store_id").notNull(),
	totalCredit: numeric("total_credit", { precision: 12, scale:  2 }).default('0').notNull(),
	totalPaid: numeric("total_paid", { precision: 12, scale:  2 }).default('0').notNull(),
	currentBalance: numeric("current_balance", { precision: 12, scale:  2 }).default('0').notNull(),
	creditLimit: numeric("credit_limit", { precision: 12, scale:  2 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.customerId],
			foreignColumns: [customers.id],
			name: "customer_credit_accounts_customer_id_fkey"
		}),
]);

export const cashWithdrawals = pgTable("cash_withdrawals", {
	id: serial().primaryKey().notNull(),
	storeId: integer("store_id").notNull(),
	cashierId: integer("cashier_id").notNull(),
	authorizedByUserId: integer("authorized_by_user_id").notNull(),
	concept: text().notNull(),
	amount: numeric({ precision: 12, scale:  2 }).notNull(),
	currency: text().default('DOP').notNull(),
	notes: text(),
	sessionType: text("session_type").default('day').notNull(),
	voided: boolean().default(false).notNull(),
	voidedAt: timestamp("voided_at", { mode: 'string' }),
	voidedByUserId: integer("voided_by_user_id"),
	voidReason: text("void_reason"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_cash_withdrawals_cashier_id").using("btree", table.cashierId.asc().nullsLast().op("int4_ops")),
	index("idx_cash_withdrawals_created_at").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("idx_cash_withdrawals_store_id").using("btree", table.storeId.asc().nullsLast().op("int4_ops")),
	index("idx_cash_withdrawals_voided").using("btree", table.voided.asc().nullsLast().op("bool_ops")),
	foreignKey({
			columns: [table.cashierId],
			foreignColumns: [users.id],
			name: "cash_withdrawals_cashier_id_fkey"
		}),
	foreignKey({
			columns: [table.authorizedByUserId],
			foreignColumns: [users.id],
			name: "cash_withdrawals_authorized_by_user_id_fkey"
		}),
	foreignKey({
			columns: [table.voidedByUserId],
			foreignColumns: [users.id],
			name: "cash_withdrawals_voided_by_user_id_fkey"
		}),
]);

export const creditTransactions = pgTable("credit_transactions", {
	id: serial().primaryKey().notNull(),
	customerId: integer("customer_id").notNull(),
	storeId: integer("store_id").notNull(),
	orderId: integer("order_id"),
	type: text().notNull(),
	amount: numeric({ precision: 10, scale:  2 }).notNull(),
	balanceBefore: numeric("balance_before", { precision: 12, scale:  2 }).notNull(),
	balanceAfter: numeric("balance_after", { precision: 12, scale:  2 }).notNull(),
	description: text(),
	paymentMethod: text("payment_method"),
	createdBy: integer("created_by"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.customerId],
			foreignColumns: [customers.id],
			name: "credit_transactions_customer_id_fkey"
		}),
	foreignKey({
			columns: [table.orderId],
			foreignColumns: [orders.id],
			name: "credit_transactions_order_id_fkey"
		}),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "credit_transactions_created_by_fkey"
		}),
]);

export const cashRegisterSessions = pgTable("cash_register_sessions", {
	id: serial().primaryKey().notNull(),
	storeId: integer("store_id").notNull(),
	cashierId: integer("cashier_id"),
	sessionType: text("session_type").default('shift').notNull(),
	status: text().default('open').notNull(),
	openingAmount: numeric("opening_amount", { precision: 12, scale:  2 }).default('0'),
	openedAt: timestamp("opened_at", { mode: 'string' }).defaultNow().notNull(),
	openingNotes: text("opening_notes"),
	cashReported: numeric("cash_reported", { precision: 12, scale:  2 }),
	cardReported: numeric("card_reported", { precision: 12, scale:  2 }),
	transferReported: numeric("transfer_reported", { precision: 12, scale:  2 }),
	creditReported: numeric("credit_reported", { precision: 12, scale:  2 }),
	closedAt: timestamp("closed_at", { mode: 'string' }),
	closedByUserId: integer("closed_by_user_id"),
	cashExpected: numeric("cash_expected", { precision: 12, scale:  2 }),
	cardExpected: numeric("card_expected", { precision: 12, scale:  2 }),
	transferExpected: numeric("transfer_expected", { precision: 12, scale:  2 }),
	creditExpected: numeric("credit_expected", { precision: 12, scale:  2 }),
	cashDifference: numeric("cash_difference", { precision: 12, scale:  2 }),
	cardDifference: numeric("card_difference", { precision: 12, scale:  2 }),
	transferDifference: numeric("transfer_difference", { precision: 12, scale:  2 }),
	creditDifference: numeric("credit_difference", { precision: 12, scale:  2 }),
	totalDifference: numeric("total_difference", { precision: 12, scale:  2 }),
	totalOrders: integer("total_orders").default(0),
	totalSalesAmount: numeric("total_sales_amount", { precision: 12, scale:  2 }).default('0'),
	totalCancellations: integer("total_cancellations").default(0),
	totalDiscountsAmount: numeric("total_discounts_amount", { precision: 12, scale:  2 }).default('0'),
	totalExpected: numeric("total_expected", { precision: 12, scale:  2 }),
	totalReported: numeric("total_reported", { precision: 12, scale:  2 }),
	discrepancyNote: text("discrepancy_note"),
	approvedByUserId: integer("approved_by_user_id"),
	approvedAt: timestamp("approved_at", { mode: 'string' }),
	rejectionReason: text("rejection_reason"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_cash_reg_cashier").using("btree", table.cashierId.asc().nullsLast().op("int4_ops")),
	index("idx_cash_reg_opened_at").using("btree", table.openedAt.asc().nullsLast().op("timestamp_ops")),
	index("idx_cash_reg_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("idx_cash_reg_store_id").using("btree", table.storeId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.cashierId],
			foreignColumns: [users.id],
			name: "cash_register_sessions_cashier_id_fkey"
		}),
	foreignKey({
			columns: [table.closedByUserId],
			foreignColumns: [users.id],
			name: "cash_register_sessions_closed_by_user_id_fkey"
		}),
	foreignKey({
			columns: [table.approvedByUserId],
			foreignColumns: [users.id],
			name: "cash_register_sessions_approved_by_user_id_fkey"
		}),
]);

export const categories = pgTable("categories", {
	id: serial().primaryKey().notNull(),
	name: text().notNull(),
	description: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: timestamp("updated_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
});

export const aiConversations = pgTable("ai_conversations", {
	id: serial().primaryKey().notNull(),
	conversationId: integer("conversation_id").notNull(),
	customerId: integer("customer_id").notNull(),
	isActive: boolean("is_active").default(true),
	mode: text().default('assistant'),
	cartItems: text("cart_items"),
	currentIntent: text("current_intent"),
	messageCount: integer("message_count").default(0),
	lastMessageAt: timestamp("last_message_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	storeId: integer("store_id"),
	customerPhone: text("customer_phone"),
	conversationContext: text("conversation_context"),
	draftOrderId: integer("draft_order_id"),
	startedAt: timestamp("started_at", { mode: 'string' }).defaultNow().notNull(),
	endedAt: timestamp("ended_at", { mode: 'string' }),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	pendingProductSelection: text("pending_product_selection"),
	pendingProductsByIndex: text("pending_products_by_index"),
});

export const aiProductMatches = pgTable("ai_product_matches", {
	id: serial().primaryKey().notNull(),
	searchQuery: text("search_query").notNull(),
	normalizedQuery: text("normalized_query").notNull(),
	matchedProducts: text("matched_products").notNull(),
	confidence: numeric({ precision: 3, scale:  2 }),
	timesUsed: integer("times_used").default(1),
	lastUsedAt: timestamp("last_used_at", { mode: 'string' }).defaultNow(),
	storeId: integer("store_id").notNull(),
	matchCount: integer("match_count").default(0),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }),
});

export const aiUsageLog = pgTable("ai_usage_log", {
	id: serial().primaryKey().notNull(),
	storeId: integer("store_id").notNull(),
	conversationId: integer("conversation_id"),
	customerId: integer("customer_id"),
	operationType: text("operation_type").notNull(),
	creditsCost: integer("credits_cost").notNull(),
	inputText: text("input_text"),
	outputText: text("output_text"),
	interpretation: text(),
	confidence: numeric({ precision: 3, scale:  2 }),
	wasSuccessful: boolean("was_successful").default(true),
	modelUsed: text("model_used").default('gpt-4o-mini'),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	customerPhone: text("customer_phone"),
	errorMessage: text("error_message"),
	processingTimeMs: integer("processing_time_ms"),
	tokensUsed: integer("tokens_used"),
});

export const assignmentRules = pgTable("assignment_rules", {
	id: serial().primaryKey().notNull(),
	name: text().notNull(),
	criteria: jsonb(),
	assignmentMethod: text("assignment_method").notNull(),
	isActive: boolean("is_active").default(true),
	priority: integer().default(1),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	storeId: integer("store_id"),
	useSectorBased: boolean("use_sector_based").default(true),
	requiredProvince: text("required_province"),
	requiredMunicipality: text("required_municipality"),
	requiredSectors: text("required_sectors").array(),
	allowAdjacentMunicipalities: boolean("allow_adjacent_municipalities").default(true),
	useSpecializationBased: boolean("use_specialization_based").default(true),
	requiredSpecializations: text("required_specializations").array(),
	useWorkloadBased: boolean("use_workload_based").default(true),
	maxOrdersPerTechnician: integer("max_orders_per_technician").default(5),
	useTimeBased: boolean("use_time_based").default(true),
	availabilityRequired: boolean("availability_required").default(true),
	applicableProducts: text("applicable_products").array(),
	applicableServices: text("applicable_services").array(),
	autoAssign: boolean("auto_assign").default(true),
	notifyCustomer: boolean("notify_customer").default(true),
	estimatedResponseTime: integer("estimated_response_time").default(60),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	assignedUserIds: integer("assigned_user_ids").array(),
	readAt: timestamp("read_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_store_6_assignment_rules_assigned_users").using("gin", table.assignedUserIds.asc().nullsLast().op("array_ops")),
]);

export const autoResponses = pgTable("auto_responses", {
	id: serial().primaryKey().notNull(),
	name: text().notNull(),
	triggerText: text("trigger_text").notNull(),
	message: text().notNull(),
	isActive: boolean("is_active").default(true),
	isInteractive: boolean("is_interactive").default(false),
	interactiveData: jsonb("interactive_data"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	storeId: integer("store_id"),
	trigger: text().default('welcome').notNull(),
	priority: integer().default(1),
	messageText: text("message_text").notNull(),
	requiresRegistration: boolean("requires_registration").default(false),
	menuOptions: text("menu_options"),
	nextAction: text("next_action"),
	menuType: text("menu_type").default('buttons'),
	showBackButton: boolean("show_back_button").default(false),
	allowFreeText: boolean("allow_free_text").default(true),
	responseTimeout: integer("response_timeout").default(300),
	maxRetries: integer("max_retries").default(3),
	fallbackMessage: text("fallback_message"),
	conditionalDisplay: text("conditional_display"),
});

export const brands = pgTable("brands", {
	id: integer().primaryKey().generatedAlwaysAsIdentity({ name: "brands_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	name: text().notNull(),
	description: text(),
	website: text(),
	logo: text(),
	isActive: boolean().default(true),
	sortOrder: integer().default(0),
	createdAt: timestamp({ mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: timestamp({ mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
	index("idx_brands_active").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
	index("idx_brands_name").using("btree", table.name.asc().nullsLast().op("text_ops")),
	index("idx_brands_sort").using("btree", table.sortOrder.asc().nullsLast().op("int4_ops")),
	unique("brands_name_key").on(table.name),
]);

export const conversationContext = pgTable("conversation_context", {
	id: serial().primaryKey().notNull(),
	phoneNumber: varchar("phone_number", { length: 20 }).notNull(),
	customerId: integer("customer_id"),
	currentFlow: varchar("current_flow", { length: 100 }),
	contextData: jsonb("context_data"),
	selectedOrderId: integer("selected_order_id"),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	updatedAt: timestamp("updated_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	expiresAt: timestamp("expires_at", { mode: 'string' }).default(sql`(CURRENT_TIMESTAMP + '24:00:00'::interval)`),
}, (table) => [
	index("idx_conversation_context_customer").using("btree", table.customerId.asc().nullsLast().op("int4_ops")),
	index("idx_conversation_context_expires").using("btree", table.expiresAt.asc().nullsLast().op("timestamp_ops")),
	index("idx_conversation_context_phone").using("btree", table.phoneNumber.asc().nullsLast().op("text_ops")),
	unique("conversation_context_phone_number_key").on(table.phoneNumber),
]);

export const conversations = pgTable("conversations", {
	id: serial().primaryKey().notNull(),
	customerId: integer("customer_id").notNull(),
	whatsappId: text("whatsapp_id"),
	status: text().default('active'),
	lastMessageAt: timestamp("last_message_at", { mode: 'string' }).defaultNow(),
	unreadCount: integer("unread_count").default(0),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	storeId: integer("store_id"),
	orderId: integer("order_id"),
	conversationType: text("conversation_type").default('initial'),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	readAt: timestamp("read_at", { mode: 'string' }).defaultNow(),
	channelType: text("channel_type").default('whatsapp').notNull(),
	webappEnabledUntil: timestamp("webapp_enabled_until", { mode: 'string' }),
}, (table) => [
	index("idx_conversations_customer_id").using("btree", table.customerId.asc().nullsLast().op("int4_ops")),
	index("idx_conversations_last_message_at").using("btree", table.lastMessageAt.desc().nullsFirst().op("timestamp_ops")),
	index("idx_conversations_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
]);

export const currencies = pgTable("currencies", {
	id: serial().primaryKey().notNull(),
	code: text().notNull(),
	name: text().notNull(),
	symbol: text().notNull(),
	isActive: boolean("is_active").default(true),
	isDefault: boolean("is_default").default(false),
	decimalPlaces: integer("decimal_places").default(2),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("currencies_code_key").on(table.code),
]);

export const customerHistory = pgTable("customer_history", {
	id: serial().primaryKey().notNull(),
	customerId: integer("customer_id").notNull(),
	orderId: integer("order_id"),
	eventType: text("event_type").notNull(),
	eventData: jsonb("event_data"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	storeId: integer("store_id"),
	action: text().notNull(),
	description: text().notNull(),
	amount: numeric(),
	metadata: text(),
});

export const customers = pgTable("customers", {
	id: serial().primaryKey().notNull(),
	name: text().notNull(),
	phone: text().notNull(),
	email: text(),
	address: text(),
	latitude: numeric({ precision: 10, scale:  8 }),
	longitude: numeric({ precision: 11, scale:  8 }),
	notes: text(),
	isVip: boolean("is_vip").default(false),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	storeId: integer("store_id"),
	whatsappName: text("whatsapp_name"),
	contactMethod: text("contact_method").default('whatsapp'),
	preferredContactTime: text("preferred_contact_time"),
	customerType: text("customer_type").default('individual'),
	companyName: text("company_name"),
	taxId: text("tax_id"),
	mapLink: text("map_link"),
	whatsappId: text("whatsapp_id"),
	lastContact: timestamp("last_contact", { mode: 'string' }),
	registrationDate: timestamp("registration_date", { mode: 'string' }).defaultNow(),
	totalOrders: integer("total_orders").default(0),
	totalSpent: numeric("total_spent", { precision: 10, scale:  2 }).default('0.00'),
	customerTypeId: integer("customer_type_id"),
	category: text().default('regular'),
	isActive: boolean("is_active").default(true),
	parentCustomerId: integer("parent_customer_id"),
	birthdayDate: timestamp("birthday_date", { mode: 'string' }),
}, (table) => [
	index("idx_customers_category").using("btree", table.category.asc().nullsLast().op("text_ops")),
	index("idx_customers_customer_type_id").using("btree", table.customerTypeId.asc().nullsLast().op("int4_ops")),
	index("idx_customers_is_active").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
	foreignKey({
			columns: [table.customerTypeId],
			foreignColumns: [customerTypes.id],
			name: "customers_customer_type_id_fkey"
		}),
	unique("customers_phone_key").on(table.phone),
]);

export const customerTypes = pgTable("customer_types", {
	id: serial().primaryKey().notNull(),
	storeId: integer("store_id").notNull(),
	name: text().notNull(),
	description: text(),
	discountPercentage: numeric("discount_percentage", { precision: 5, scale:  2 }).default('0.00'),
	isActive: boolean("is_active").default(true),
	color: text().default('#3b82f6'),
	icon: text(),
	sortOrder: integer("sort_order").default(0),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_customer_types_is_active").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
	index("idx_customer_types_store_id").using("btree", table.storeId.asc().nullsLast().op("int4_ops")),
]);

export const exchangeRates = pgTable("exchange_rates", {
	id: serial().primaryKey().notNull(),
	baseCurrency: varchar("base_currency", { length: 3 }).notNull(),
	targetCurrency: varchar("target_currency", { length: 3 }).notNull(),
	rate: numeric({ precision: 10, scale:  6 }).notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	isActive: boolean("is_active").default(true),
	storeId: integer("store_id").notNull(),
	updatedBy: integer("updated_by"),
}, (table) => [
	uniqueIndex("idx_exchange_rates_unique").using("btree", table.baseCurrency.asc().nullsLast().op("int4_ops"), table.targetCurrency.asc().nullsLast().op("int4_ops"), table.storeId.asc().nullsLast().op("int4_ops")).where(sql`(is_active = true)`),
	foreignKey({
			columns: [table.updatedBy],
			foreignColumns: [users.id],
			name: "exchange_rates_updatedby_fkey"
		}),
]);

export const customerRegistrationFlows = pgTable("customer_registration_flows", {
	id: serial().primaryKey().notNull(),
	customerId: integer("customer_id"),
	currentStep: text("current_step").notNull(),
	collectedData: jsonb("collected_data"),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	storeId: integer("store_id"),
	phoneNumber: text("phone_number").notNull(),
	requestedService: text("requested_service"),
	isCompleted: boolean("is_completed").default(false),
	updatedAt: timestamp("updated_at", { mode: 'string' }).default('2025-07-15 18:54:08.557928'),
	orderId: integer("order_id"),
	flowType: text("flow_type"),
	orderNumber: text("order_number"),
}, (table) => [
	foreignKey({
			columns: [table.customerId],
			foreignColumns: [customers.id],
			name: "fk_customer_registration_flows_customer_id"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.orderId],
			foreignColumns: [orders.id],
			name: "fk_customer_registration_flows_order_id"
		}),
]);

export const employeeProfiles = pgTable("employee_profiles", {
	id: serial().primaryKey().notNull(),
	employeeId: text("employee_id"),
	department: text(),
	position: text(),
	emergencyContact: text("emergency_contact"),
	emergencyPhone: text("emergency_phone"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	specializations: text(),
	certifications: text().array(),
	workSchedule: text("work_schedule"),
	vehicleInfo: text("vehicle_info"),
	commissionRate: numeric("commission_rate", { precision: 5, scale:  2 }),
	territory: text(),
	baseLatitude: numeric("base_latitude", { precision: 10, scale:  8 }),
	baseLongitude: numeric("base_longitude", { precision: 11, scale:  8 }),
	baseAddress: text("base_address"),
	serviceRadius: numeric("service_radius", { precision: 5, scale:  2 }).default('10.0'),
	maxDailyOrders: integer("max_daily_orders").default(5),
	availabilityHours: text("availability_hours"),
	skillLevel: integer("skill_level").default(1),
	notes: text(),
}, (table) => [
	unique("unique_employee_id").on(table.employeeId),
]);

export const exchangeRateHistory = pgTable("exchange_rate_history", {
	id: serial().primaryKey().notNull(),
	fromCurrency: text("from_currency").notNull(),
	toCurrency: text("to_currency").notNull(),
	oldRate: numeric("old_rate", { precision: 18, scale:  8 }),
	newRate: numeric("new_rate", { precision: 18, scale:  8 }).notNull(),
	changePercent: numeric("change_percent", { precision: 8, scale:  4 }),
	updatedBy: integer("updated_by"),
	changeReason: text("change_reason"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const notificationChannels = pgTable("notification_channels", {
	id: serial().primaryKey().notNull(),
	name: text().notNull(),
	isEnabled: boolean("is_enabled").default(true),
	settings: jsonb(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	unique("unique_channel_name").on(table.name),
]);

export const notifications = pgTable("notifications", {
	id: serial().primaryKey().notNull(),
	userId: integer("user_id"),
	title: text().notNull(),
	message: text().notNull(),
	type: text().notNull(),
	isRead: boolean("is_read").default(false),
	priority: text().default('normal'),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	storeId: integer("store_id"),
	relatedId: integer("related_id"),
	relatedType: text("related_type"),
	readAt: timestamp("read_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_notifications_related").using("btree", table.relatedId.asc().nullsLast().op("int4_ops"), table.relatedType.asc().nullsLast().op("int4_ops")),
]);

export const inventoryMovements = pgTable("inventory_movements", {
	id: serial().primaryKey().notNull(),
	storeId: integer("store_id").notNull(),
	productId: integer("product_id").notNull(),
	type: text().notNull(),
	quantity: numeric({ precision: 12, scale:  2 }).notNull(),
	unitId: integer("unit_id"),
	lotNumber: text("lot_number"),
	expirationDate: timestamp("expiration_date", { mode: 'string' }),
	referenceType: text("reference_type"),
	referenceId: integer("reference_id"),
	notes: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	createdBy: integer("created_by"),
	quantityBefore: numeric("quantity_before", { precision: 12, scale:  2 }),
	quantityAfter: numeric("quantity_after", { precision: 12, scale:  2 }),
	unitCost: numeric("unit_cost", { precision: 12, scale:  2 }),
	totalCost: numeric("total_cost", { precision: 12, scale:  2 }),
	supplierId: integer("supplier_id"),
	reason: text(),
}, (table) => [
	index("idx_inventory_movements_expiration_date").using("btree", table.expirationDate.asc().nullsLast().op("timestamp_ops")),
	index("idx_inventory_movements_lot_number").using("btree", table.lotNumber.asc().nullsLast().op("text_ops")),
	index("idx_inventory_movements_reference").using("btree", table.referenceType.asc().nullsLast().op("int4_ops"), table.referenceId.asc().nullsLast().op("text_ops")),
	index("idx_inventory_movements_supplier_id").using("btree", table.supplierId.asc().nullsLast().op("int4_ops")),
	index("idx_inventory_movements_type").using("btree", table.type.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.productId],
			foreignColumns: [products.id],
			name: "inventory_movements_product_id_fkey"
		}),
	foreignKey({
			columns: [table.supplierId],
			foreignColumns: [suppliers.id],
			name: "inventory_movements_supplier_id_fkey"
		}),
]);

export const messages = pgTable("messages", {
	id: serial().primaryKey().notNull(),
	conversationId: integer("conversation_id").notNull(),
	content: text().notNull(),
	sender: text().default('customer'),
	messageType: text("message_type").default('text'),
	whatsappMessageId: text("whatsapp_message_id"),
	isRead: boolean("is_read").default(false),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	storeId: integer("store_id"),
	metadata: jsonb(),
	senderId: integer("sender_id"),
	senderType: text("sender_type").default('customer').notNull(),
	sentAt: timestamp("sent_at", { mode: 'string' }).defaultNow(),
	isFromCustomer: boolean().default(false),
}, (table) => [
	index("idx_messages_conversation_id").using("btree", table.conversationId.asc().nullsLast().op("int4_ops")),
	index("idx_messages_sent_at").using("btree", table.sentAt.desc().nullsFirst().op("timestamp_ops")),
	index("idx_messages_whatsapp_id").using("btree", table.whatsappMessageId.asc().nullsLast().op("text_ops")),
]);

export const notificationEvents = pgTable("notification_events", {
	id: serial().primaryKey().notNull(),
	eventType: text("event_type").notNull(),
	eventName: text("event_name").notNull(),
	description: text(),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	unique("unique_event_name").on(table.eventName),
]);

export const notificationHistory = pgTable("notification_history", {
	id: serial().primaryKey().notNull(),
	configId: integer("config_id"),
	orderId: integer("order_id"),
	recipientId: integer("recipient_id"),
	recipientType: text("recipient_type").notNull(),
	channel: text().notNull(),
	title: text().notNull(),
	message: text().notNull(),
	status: text().default('pending'),
	sentAt: timestamp("sent_at", { mode: 'string' }),
	deliveredAt: timestamp("delivered_at", { mode: 'string' }),
	errorMessage: text("error_message"),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_notification_history_created_at").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("idx_notification_history_order_id").using("btree", table.orderId.asc().nullsLast().op("int4_ops")),
	index("idx_notification_history_recipient_id").using("btree", table.recipientId.asc().nullsLast().op("int4_ops")),
	index("idx_notification_history_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.configId],
			foreignColumns: [notificationConfigs.id],
			name: "notification_history_config_id_fkey"
		}).onDelete("set null"),
]);

export const orderHistory = pgTable("order_history", {
	id: serial().primaryKey().notNull(),
	orderId: integer("order_id"),
	statusFrom: text("status_from"),
	statusTo: text("status_to"),
	changedBy: integer("changed_by"),
	notes: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	storeId: integer("store_id"),
	userId: integer("user_id"),
	action: text().notNull(),
	timestamp: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const loyaltyPointsTransactions = pgTable("loyalty_points_transactions", {
	id: serial().primaryKey().notNull(),
	customerId: integer("customer_id").notNull(),
	storeId: integer("store_id").notNull(),
	type: text().notNull(),
	points: numeric({ precision: 12, scale:  2 }).notNull(),
	balanceBefore: numeric("balance_before", { precision: 12, scale:  2 }).notNull(),
	balanceAfter: numeric("balance_after", { precision: 12, scale:  2 }).notNull(),
	orderId: integer("order_id"),
	description: text().notNull(),
	metadata: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_loyalty_transactions_created_at").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("idx_loyalty_transactions_customer_id").using("btree", table.customerId.asc().nullsLast().op("int4_ops")),
	index("idx_loyalty_transactions_order_id").using("btree", table.orderId.asc().nullsLast().op("int4_ops")),
	index("idx_loyalty_transactions_store_id").using("btree", table.storeId.asc().nullsLast().op("int4_ops")),
	index("idx_loyalty_transactions_type").using("btree", table.type.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.customerId],
			foreignColumns: [customers.id],
			name: "loyalty_points_transactions_customer_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.orderId],
			foreignColumns: [orders.id],
			name: "loyalty_points_transactions_order_id_fkey"
		}),
	check("loyalty_points_transactions_type_check", sql`type = ANY (ARRAY['earned'::text, 'redeemed'::text, 'expired'::text, 'adjusted'::text])`),
]);

export const measurementUnits = pgTable("measurement_units", {
	id: serial().primaryKey().notNull(),
	storeId: integer("store_id").notNull(),
	name: text().notNull(),
	symbol: text().notNull(),
	type: text().notNull(),
	abbreviation: text(),
	isActive: boolean("is_active").default(true),
	sortOrder: integer("sort_order").default(0),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_measurement_units_active").using("btree", table.isActive.asc().nullsLast().op("bool_ops")).where(sql`(is_active = true)`),
	index("idx_measurement_units_store_id").using("btree", table.storeId.asc().nullsLast().op("int4_ops")),
	index("idx_measurement_units_type").using("btree", table.type.asc().nullsLast().op("text_ops")),
	check("chk_measurement_unit_type", sql`type = ANY (ARRAY['weight'::text, 'volume'::text, 'unit'::text, 'length'::text])`),
]);

export const notificationConfigs = pgTable("notification_configs", {
	id: serial().primaryKey().notNull(),
	eventId: integer("event_id"),
	channelId: integer("channel_id"),
	isEnabled: boolean("is_enabled").default(true),
	recipientType: text("recipient_type").notNull(),
	customRecipients: integer("custom_recipients").array(),
	template: text().notNull(),
	priority: text().default('normal'),
	delayMinutes: integer("delay_minutes").default(0),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_notification_configs_channel_id").using("btree", table.channelId.asc().nullsLast().op("int4_ops")),
	index("idx_notification_configs_enabled").using("btree", table.isEnabled.asc().nullsLast().op("bool_ops")),
	index("idx_notification_configs_event_id").using("btree", table.eventId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.channelId],
			foreignColumns: [notificationChannels.id],
			name: "notification_configs_channel_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.eventId],
			foreignColumns: [notificationEvents.id],
			name: "notification_configs_event_id_fkey"
		}).onDelete("cascade"),
]);

export const orderNotes = pgTable("order_notes", {
	id: serial().primaryKey().notNull(),
	orderId: integer("order_id"),
	customerId: integer("customer_id"),
	noteText: text("note_text").notNull(),
	noteType: varchar("note_type", { length: 50 }).default('customer_note'),
	createdBy: varchar("created_by", { length: 100 }).default('customer'),
	createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
	index("idx_order_notes_created_at").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("idx_order_notes_customer_id").using("btree", table.customerId.asc().nullsLast().op("int4_ops")),
	index("idx_order_notes_order_id").using("btree", table.orderId.asc().nullsLast().op("int4_ops")),
]);

export const productBrands = pgTable("product_brands", {
	id: integer().notNull(),
	storeId: integer("store_id").notNull(),
	name: text().notNull(),
	description: text(),
	logo: text(),
	website: text(),
	countryOfOrigin: text("country_of_origin"),
	isActive: boolean("is_active").default(true),
	sortOrder: integer("sort_order").default(0),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const productCategories = pgTable("product_categories", {
	id: serial().primaryKey().notNull(),
	name: text().notNull(),
	description: text(),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	storeId: integer("store_id"),
	parentId: integer("parent_id"),
	imageUrl: text("image_url"),
	sortOrder: integer("sort_order").default(0),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
});

export const products = pgTable("products", {
	id: serial().primaryKey().notNull(),
	name: text().notNull(),
	description: text(),
	price: numeric({ precision: 10, scale:  2 }).notNull(),
	category: text(),
	brand: text(),
	model: text(),
	sku: text(),
	isService: boolean("is_service").default(false),
	isActive: boolean("is_active").default(true),
	deliveryRequired: boolean("delivery_required").default(true),
	installationTime: integer("installation_time"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	storeId: integer("store_id").default(1).notNull(),
	images: text().array(),
	weight: text(),
	dimensions: text(),
	status: text().default('active').notNull(),
	imageUrl: text("image_url"),
	specifications: text(),
	features: text().array(),
	warranty: text(),
	availability: text().default('in_stock').notNull(),
	stockQuantity: integer("stock_quantity").default(0),
	minQuantity: integer("min_quantity").default(1),
	maxQuantity: integer("max_quantity"),
	tags: text().array(),
	salePrice: numeric("sale_price", { precision: 10, scale:  2 }),
	isPromoted: boolean("is_promoted").default(false),
	promotionText: text("promotion_text"),
	baseCurrency: varchar("base_currency", { length: 3 }).default('DOP'),
	loyaltyPointsPropertyName: text("loyalty_points_property_name"),
	loyaltyPointsValue: numeric("loyalty_points_value", { precision: 10, scale:  2 }),
	unitConversionEnabled: boolean("unit_conversion_enabled").default(false),
	baseUnitId: integer("base_unit_id"),
	lotNumber: text("lot_number"),
	expirationDate: timestamp("expiration_date", { mode: 'string' }),
	barcode: text(),
	type: text().default('product').notNull(),
}, (table) => [
	index("idx_products_barcode").using("btree", table.barcode.asc().nullsLast().op("text_ops")),
	index("idx_products_base_unit_id").using("btree", table.baseUnitId.asc().nullsLast().op("int4_ops")),
	index("idx_products_type").using("btree", table.type.asc().nullsLast().op("text_ops")),
	index("idx_products_unit_conversion_enabled").using("btree", table.unitConversionEnabled.asc().nullsLast().op("bool_ops")).where(sql`(unit_conversion_enabled = true)`),
	foreignKey({
			columns: [table.baseUnitId],
			foreignColumns: [measurementUnits.id],
			name: "fk_products_base_unit_id"
		}).onDelete("set null"),
]);

export const purchaseOrderItems = pgTable("purchase_order_items", {
	id: serial().primaryKey().notNull(),
	purchaseOrderId: integer("purchase_order_id").notNull(),
	storeId: integer("store_id").notNull(),
	productId: integer("product_id"),
	productName: text("product_name").notNull(),
	sku: text(),
	barcode: text(),
	quantity: numeric({ precision: 12, scale:  2 }).notNull(),
	quantityReceived: numeric("quantity_received", { precision: 12, scale:  2 }).default('0.00'),
	unitId: integer("unit_id"),
	lotNumber: text("lot_number"),
	expirationDate: timestamp("expiration_date", { mode: 'string' }),
	manufacturingDate: timestamp("manufacturing_date", { mode: 'string' }),
	unitCost: numeric("unit_cost", { precision: 12, scale:  2 }).notNull(),
	taxRate: numeric("tax_rate", { precision: 5, scale:  2 }).default('0.00'),
	discountRate: numeric("discount_rate", { precision: 5, scale:  2 }).default('0.00'),
	totalCost: numeric("total_cost", { precision: 12, scale:  2 }).notNull(),
	notes: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_po_items_lot_number").using("btree", table.lotNumber.asc().nullsLast().op("text_ops")),
	index("idx_po_items_product_id").using("btree", table.productId.asc().nullsLast().op("int4_ops")),
	index("idx_po_items_purchase_order_id").using("btree", table.purchaseOrderId.asc().nullsLast().op("int4_ops")),
	index("idx_po_items_store_id").using("btree", table.storeId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.productId],
			foreignColumns: [products.id],
			name: "purchase_order_items_product_id_fkey"
		}),
	foreignKey({
			columns: [table.purchaseOrderId],
			foreignColumns: [purchaseOrders.id],
			name: "purchase_order_items_purchase_order_id_fkey"
		}).onDelete("cascade"),
]);

export const orders = pgTable("orders", {
	id: serial().primaryKey().notNull(),
	orderNumber: text("order_number").notNull(),
	customerId: integer("customer_id").notNull(),
	status: text().default('pending'),
	totalAmount: numeric("total_amount", { precision: 10, scale:  2 }).notNull(),
	deliveryCost: numeric("delivery_cost", { precision: 10, scale:  2 }).default('0'),
	assignedTo: integer("assigned_to"),
	notes: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	storeId: integer("store_id"),
	deliveryAddress: text("delivery_address"),
	estimatedDelivery: timestamp("estimated_delivery", { mode: 'string' }),
	paymentMethod: text("payment_method"),
	paymentStatus: text("payment_status").default('pending'),
	assignedUserId: integer("assigned_user_id"),
	description: text(),
	priority: text().default('normal'),
	estimatedDeliveryTime: varchar("estimated_delivery_time", { length: 100 }),
	lastStatusUpdate: timestamp("last_status_update", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
	customerLastInteraction: timestamp("customer_last_interaction", { mode: 'string' }),
	modificationCount: integer("modification_count").default(0),
	contactNumber: text("contact_number"),
	customerProvince: text("customer_province"),
	customerMunicipality: text("customer_municipality"),
	customerSector: text("customer_sector"),
	autoAssigned: boolean("auto_assigned").default(false),
	assignedRuleId: integer("assigned_rule_id"),
	assignmentAttempts: integer("assignment_attempts").default(0),
	customerAddress: text("customer_address"),
	customerLatitude: numeric("customer_latitude", { precision: 10, scale:  8 }),
	customerLongitude: numeric("customer_longitude", { precision: 11, scale:  8 }),
	serviceType: text("service_type"),
	scheduledDate: timestamp("scheduled_date", { mode: 'string' }),
	completedDate: timestamp("completed_date", { mode: 'string' }),
	tripId: integer("trip_id"),
	loyaltyPointsPropertyName: text("loyalty_points_property_name"),
	loyaltyPointsValue: numeric("loyalty_points_value", { precision: 10, scale:  2 }),
	loyaltyPointsTotal: numeric("loyalty_points_total", { precision: 12, scale:  2 }).default('0'),
	loyaltyPointsCredited: boolean("loyalty_points_credited").default(false),
	loyaltyPointsCreditedAt: timestamp("loyalty_points_credited_at", { mode: 'string' }),
	receivedAmount: numeric("received_amount", { precision: 10, scale:  2 }),
	changeAmount: numeric("change_amount", { precision: 10, scale:  2 }),
	orderType: text("order_type").default('sale').notNull(),
	subtotalAmount: numeric("subtotal_amount", { precision: 10, scale:  2 }).default('0'),
	discountPercentage: numeric("discount_percentage", { precision: 5, scale:  2 }).default('0'),
	discountAmount: numeric("discount_amount", { precision: 10, scale:  2 }).default('0'),
}, (table) => [
	index("idx_orders_trip").using("btree", table.tripId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.tripId],
			foreignColumns: [trips.id],
			name: "orders_trip_id_fkey"
		}),
	unique("orders_order_number_key").on(table.orderNumber),
]);

export const shoppingCart = pgTable("shopping_cart", {
	id: serial().primaryKey().notNull(),
	sessionId: text("session_id").notNull(),
	productId: integer("product_id").notNull(),
	quantity: integer().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	storeId: integer("store_id"),
	userId: integer("user_id"),
	notes: text(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const storeCurrencySettings = pgTable("store_currency_settings", {
	id: serial().primaryKey().notNull(),
	defaultCurrency: text("default_currency").notNull(),
	supportedCurrencies: jsonb("supported_currencies").default(["DOP","USD"]),
	autoUpdateRates: boolean("auto_update_rates").default(false),
	rateUpdateFrequency: text("rate_update_frequency").default('manual'),
	showBothPrices: boolean("show_both_prices").default(true),
	primaryDisplayCurrency: text("primary_display_currency"),
	roundingMethod: text("rounding_method").default('normal'),
	roundingPrecision: integer("rounding_precision").default(2),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const storeSettings = pgTable("store_settings", {
	id: serial().primaryKey().notNull(),
	settingValue: text("setting_value"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	storeId: integer("store_id"),
	storeWhatsappNumber: text("store_whatsapp_number").notNull(),
	storeName: text("store_name").notNull(),
	storeAddress: text("store_address"),
	storeEmail: text("store_email"),
	businessHours: text("business_hours").default('09:00-18:00'),
	deliveryRadius: text("delivery_radius").default('50'),
	baseSiteUrl: text("base_site_url"),
	enableNotifications: boolean("enable_notifications").default(true),
	autoAssignOrders: boolean("auto_assign_orders").default(true),
	storePhone: text("store_phone"),
	logoUrl: text("logo_url"),
	logoStoragePath: text("logo_storage_path"),
	invoiceFooter: text("invoice_footer"),
	invoiceNumber: integer("invoice_number").default(1),
	currency: text().default('DOP'),
	taxPercentage: numeric("tax_percentage", { precision: 5, scale:  2 }).default('0'),
});

export const storeSubscriptions = pgTable("store_subscriptions", {
	id: integer().notNull(),
	storeId: integer("store_id").notNull(),
	planId: integer("plan_id").notNull(),
	status: text().default('active').notNull(),
	startDate: timestamp("start_date", { mode: 'string' }).defaultNow(),
	endDate: timestamp("end_date", { mode: 'string' }),
	autoRenew: boolean("auto_renew").default(true),
	currentProducts: integer("current_products").default(0),
	currentDbStorageGb: numeric("current_db_storage_gb").default('0.00'),
	currentWhatsappMessages: integer("current_whatsapp_messages").default(0),
	currentUsers: integer("current_users").default(0),
	currentOrders: integer("current_orders").default(0),
	currentCustomers: integer("current_customers").default(0),
	lastBillingDate: timestamp("last_billing_date", { mode: 'string' }),
	nextBillingDate: timestamp("next_billing_date", { mode: 'string' }),
	billingCycle: text("billing_cycle").default('monthly'),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
});

export const purchaseOrders = pgTable("purchase_orders", {
	id: serial().primaryKey().notNull(),
	storeId: integer("store_id").notNull(),
	purchaseNumber: text("purchase_number").notNull(),
	supplierId: integer("supplier_id"),
	supplierName: text("supplier_name"),
	orderDate: timestamp("order_date", { mode: 'string' }).defaultNow().notNull(),
	expectedDeliveryDate: timestamp("expected_delivery_date", { mode: 'string' }),
	receivedDate: timestamp("received_date", { mode: 'string' }),
	status: text().default('pending').notNull(),
	subtotal: numeric({ precision: 12, scale:  2 }).default('0.00'),
	tax: numeric({ precision: 12, scale:  2 }).default('0.00'),
	discount: numeric({ precision: 12, scale:  2 }).default('0.00'),
	shippingCost: numeric("shipping_cost", { precision: 12, scale:  2 }).default('0.00'),
	totalAmount: numeric("total_amount", { precision: 12, scale:  2 }).notNull(),
	currency: text().default('DOP'),
	invoiceNumber: text("invoice_number"),
	referenceNumber: text("reference_number"),
	notes: text(),
	paymentTerms: text("payment_terms"),
	paymentStatus: text("payment_status").default('unpaid'),
	createdBy: integer("created_by").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_purchase_orders_number").using("btree", table.purchaseNumber.asc().nullsLast().op("text_ops")),
	index("idx_purchase_orders_order_date").using("btree", table.orderDate.asc().nullsLast().op("timestamp_ops")),
	index("idx_purchase_orders_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("idx_purchase_orders_store_id").using("btree", table.storeId.asc().nullsLast().op("int4_ops")),
	index("idx_purchase_orders_supplier_id").using("btree", table.supplierId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.supplierId],
			foreignColumns: [suppliers.id],
			name: "purchase_orders_supplier_id_fkey"
		}),
	unique("purchase_orders_purchase_number_key").on(table.purchaseNumber),
	check("chk_payment_status", sql`payment_status = ANY (ARRAY['unpaid'::text, 'partial'::text, 'paid'::text])`),
	check("chk_purchase_status", sql`status = ANY (ARRAY['pending'::text, 'received'::text, 'partial'::text, 'cancelled'::text])`),
]);

export const subscriptionPlans = pgTable("subscription_plans", {
	id: integer().notNull(),
	name: text().notNull(),
	description: text(),
	type: text().default('fixed').notNull(),
	monthlyPrice: numeric("monthly_price").default('0.00'),
	maxProducts: integer("max_products").default(sql`'-1'`),
	maxWhatsappMessages: integer("max_whatsapp_messages").default(sql`'-1'`),
	maxUsers: integer("max_users").default(sql`'-1'`),
	maxOrders: integer("max_orders").default(sql`'-1'`),
	maxCustomers: integer("max_customers").default(sql`'-1'`),
	maxDbStorage: numeric("max_db_storage").default('-1'),
	pricePerProduct: numeric("price_per_product").default('0.00'),
	pricePerMessage: numeric("price_per_message").default('0.00'),
	pricePerGbStorage: numeric("price_per_gb_storage").default('0.00'),
	pricePerOrder: numeric("price_per_order").default('0.00'),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
});

export const trips = pgTable("trips", {
	id: serial().primaryKey().notNull(),
	tripNumber: text("trip_number").notNull(),
	assignedUserId: integer("assigned_user_id"),
	storeId: integer("store_id").notNull(),
	status: text().default('pending').notNull(),
	totalOrders: integer("total_orders").default(0),
	completedOrders: integer("completed_orders").default(0),
	totalAmount: numeric("total_amount", { precision: 10, scale:  2 }).default('0'),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	sentAt: timestamp("sent_at", { mode: 'string' }),
	startedAt: timestamp("started_at", { mode: 'string' }),
	completedAt: timestamp("completed_at", { mode: 'string' }),
	notes: text(),
	estimatedDuration: integer("estimated_duration"),
	actualDuration: integer("actual_duration"),
}, (table) => [
	index("idx_trips_assigned_user").using("btree", table.assignedUserId.asc().nullsLast().op("int4_ops")),
	index("idx_trips_created").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("idx_trips_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("idx_trips_store").using("btree", table.storeId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.assignedUserId],
			foreignColumns: [users.id],
			name: "trips_assigned_user_id_fkey"
		}),
	unique("trips_trip_number_key").on(table.tripNumber),
]);

export const systemAuditLog = pgTable("system_audit_log", {
	id: integer().notNull(),
	userId: integer("user_id"),
	storeId: integer("store_id"),
	action: text().notNull(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	resource: text().notNull(),
	resourceId: text("resource_id"),
	details: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
});

export const tripOrders = pgTable("trip_orders", {
	id: serial().primaryKey().notNull(),
	tripId: integer("trip_id").notNull(),
	orderId: integer("order_id").notNull(),
	storeId: integer("store_id").notNull(),
	status: text().default('pending').notNull(),
	pickedAt: timestamp("picked_at", { mode: 'string' }),
	scannedQr: boolean("scanned_qr").default(false),
	sequenceNumber: integer("sequence_number"),
	notes: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_trip_orders_order").using("btree", table.orderId.asc().nullsLast().op("int4_ops")),
	index("idx_trip_orders_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("idx_trip_orders_trip").using("btree", table.tripId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.orderId],
			foreignColumns: [orders.id],
			name: "trip_orders_order_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.tripId],
			foreignColumns: [trips.id],
			name: "trip_orders_trip_id_fkey"
		}).onDelete("cascade"),
	unique("trip_orders_trip_id_order_id_key").on(table.tripId, table.orderId),
]);

export const usageHistory = pgTable("usage_history", {
	id: integer().notNull(),
	storeId: integer("store_id").notNull(),
	subscriptionId: integer("subscription_id").notNull(),
	periodStart: timestamp("period_start", { mode: 'string' }).notNull(),
	periodEnd: timestamp("period_end", { mode: 'string' }).notNull(),
	productsUsed: integer("products_used").default(0),
	dbStorageUsedGb: numeric("db_storage_used_gb").default('0.00'),
	whatsappMessagesUsed: integer("whatsapp_messages_used").default(0),
	usersActive: integer("users_active").default(0),
	ordersProcessed: integer("orders_processed").default(0),
	customersActive: integer("customers_active").default(0),
	fixedCost: numeric("fixed_cost").default('0.00'),
	usageCost: numeric("usage_cost").default('0.00'),
	totalCost: numeric("total_cost").default('0.00'),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
});

export const suppliers = pgTable("suppliers", {
	id: serial().primaryKey().notNull(),
	storeId: integer("store_id").notNull(),
	name: text().notNull(),
	contactName: text("contact_name"),
	phone: text(),
	email: text(),
	address: text(),
	taxId: text("tax_id"),
	notes: text(),
	isActive: boolean("is_active").default(true),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_suppliers_is_active").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
	index("idx_suppliers_name").using("btree", table.name.asc().nullsLast().op("text_ops")),
	index("idx_suppliers_store_id").using("btree", table.storeId.asc().nullsLast().op("int4_ops")),
]);

export const whatsappLogs = pgTable("whatsapp_logs", {
	id: serial().primaryKey().notNull(),
	phoneNumberId: text("phone_number_id"),
	messageId: text("message_id"),
	direction: text(),
	messageType: text("message_type"),
	content: text(),
	fromNumber: text("from_number"),
	toNumber: text("to_number"),
	status: text(),
	errorMessage: text("error_message"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	storeId: integer("store_id"),
	type: text().notNull(),
	phoneNumber: text("phone_number"),
	messageContent: text("message_content"),
	rawData: text("raw_data"),
	timestamp: timestamp({ mode: 'string' }).defaultNow().notNull(),
});

export const whatsappSettings = pgTable("whatsapp_settings", {
	id: serial().primaryKey().notNull(),
	accessToken: text("access_token"),
	phoneNumberId: text("phone_number_id"),
	businessAccountId: text("business_account_id"),
	webhookVerifyToken: text("webhook_verify_token"),
	webhookUrl: text("webhook_url"),
	isActive: boolean("is_active").default(false),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	storeId: integer("store_id"),
	appId: text("app_id"),
	phoneNumber: text("phone_number"),
});

export const customerLoyaltyBalance = pgTable("customer_loyalty_balance", {
	id: serial().primaryKey().notNull(),
	customerId: integer("customer_id").notNull(),
	storeId: integer("store_id").notNull(),
	totalPointsEarned: numeric("total_points_earned", { precision: 12, scale:  2 }).default('0.00'),
	totalPointsRedeemed: numeric("total_points_redeemed", { precision: 12, scale:  2 }).default('0.00'),
	currentBalance: numeric("current_balance", { precision: 12, scale:  2 }).default('0.00'),
	loyaltyProgramName: text("loyalty_program_name"),
	pointsPropertyName: text("points_property_name"),
	lastEarnedAt: timestamp("last_earned_at", { mode: 'string' }),
	lastRedeemedAt: timestamp("last_redeemed_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_loyalty_balance_customer_id").using("btree", table.customerId.asc().nullsLast().op("int4_ops")),
	index("idx_loyalty_balance_store_id").using("btree", table.storeId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.customerId],
			foreignColumns: [customers.id],
			name: "customer_loyalty_balance_customer_id_fkey"
		}).onDelete("cascade"),
	unique("customer_loyalty_balance_customer_id_key").on(table.customerId),
]);

export const orderItems = pgTable("order_items", {
	id: serial().primaryKey().notNull(),
	orderId: integer("order_id").notNull(),
	productId: integer("product_id").notNull(),
	quantity: integer().notNull(),
	unitPrice: numeric("unit_price", { precision: 10, scale:  2 }).notNull(),
	totalPrice: numeric("total_price", { precision: 10, scale:  2 }).notNull(),
	storeId: integer("store_id"),
	installationCost: numeric("installation_cost", { precision: 10, scale:  2 }),
	partsCost: numeric("parts_cost", { precision: 10, scale:  2 }),
	laborHours: numeric("labor_hours", { precision: 4, scale:  2 }),
	laborRate: numeric("labor_rate", { precision: 10, scale:  2 }),
	deliveryCost: numeric("delivery_cost", { precision: 10, scale:  2 }).default('0'),
	deliveryDistance: numeric("delivery_distance", { precision: 8, scale:  2 }),
	notes: text(),
	unitId: integer("unit_id"),
	quantityInBaseUnit: numeric("quantity_in_base_unit", { precision: 12, scale:  4 }),
}, (table) => [
	index("idx_order_items_unit_id").using("btree", table.unitId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.unitId],
			foreignColumns: [measurementUnits.id],
			name: "fk_order_items_unit_id"
		}).onDelete("set null"),
]);

export const productUnitConversions = pgTable("product_unit_conversions", {
	id: serial().primaryKey().notNull(),
	productId: integer("product_id").notNull(),
	storeId: integer("store_id").notNull(),
	sourceUnitId: integer("source_unit_id").notNull(),
	targetUnitId: integer("target_unit_id").notNull(),
	conversionFactor: numeric("conversion_factor", { precision: 15, scale:  6 }).notNull(),
	isActive: boolean("is_active").default(true),
	notes: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_product_unit_conversions_active").using("btree", table.isActive.asc().nullsLast().op("bool_ops")).where(sql`(is_active = true)`),
	index("idx_product_unit_conversions_product_id").using("btree", table.productId.asc().nullsLast().op("int4_ops")),
	index("idx_product_unit_conversions_source_unit").using("btree", table.sourceUnitId.asc().nullsLast().op("int4_ops")),
	index("idx_product_unit_conversions_store_id").using("btree", table.storeId.asc().nullsLast().op("int4_ops")),
	index("idx_product_unit_conversions_target_unit").using("btree", table.targetUnitId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.productId],
			foreignColumns: [products.id],
			name: "fk_product_id"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.sourceUnitId],
			foreignColumns: [measurementUnits.id],
			name: "fk_source_unit_id"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.targetUnitId],
			foreignColumns: [measurementUnits.id],
			name: "fk_target_unit_id"
		}).onDelete("cascade"),
	unique("unique_product_conversion").on(table.productId, table.sourceUnitId, table.targetUnitId),
]);

export const users = pgTable("users", {
	id: serial().primaryKey().notNull(),
	username: text().notNull(),
	password: text().notNull(),
	name: text().notNull(),
	email: text(),
	phone: text(),
	role: text().default('technician').notNull(),
	status: text().default('active'),
	lastLogin: timestamp("last_login", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	storeId: integer("store_id"),
	permissions: text().array(),
	avatar: text(),
	address: text(),
	isActive: boolean("is_active").default(true).notNull(),
	employeeProfileId: integer("employee_profile_id"),
	hireDate: timestamp("hire_date", { mode: 'string' }).defaultNow(),
	department: text(),
	currentOrders: integer("current_orders"),
	province: text(),
	municipality: text(),
	sector: text(),
	coverageProvinces: text("coverage_provinces").array(),
	coverageMunicipalities: text("coverage_municipalities").array(),
	specializations: text().array(),
	skillLevel: integer("skill_level").default(1),
	coverageSectors: text("coverage_sectors").array(),
	maxDailyOrders: integer("max_daily_orders").array(),
	roleId: integer("role_id"),
}, (table) => [
	index("idx_users_current_orders").using("btree", table.currentOrders.asc().nullsLast().op("int4_ops")),
	index("idx_users_province").using("btree", table.province.asc().nullsLast().op("text_ops")),
	index("idx_users_role").using("btree", table.role.asc().nullsLast().op("text_ops")),
	index("idx_users_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.roleId],
			foreignColumns: [roles.id],
			name: "users_role_id_fkey"
		}),
	unique("users_username_key").on(table.username),
]);
export const activeOrdersView = pgView("active_orders_view", {	id: integer(),
	orderNumber: text("order_number"),
	customerId: integer("customer_id"),
	status: text(),
	totalAmount: numeric("total_amount", { precision: 10, scale:  2 }),
	deliveryCost: numeric("delivery_cost", { precision: 10, scale:  2 }),
	assignedTo: integer("assigned_to"),
	notes: text(),
	createdAt: timestamp("created_at", { mode: 'string' }),
	updatedAt: timestamp("updated_at", { mode: 'string' }),
	storeId: integer("store_id"),
	deliveryAddress: text("delivery_address"),
	estimatedDelivery: timestamp("estimated_delivery", { mode: 'string' }),
	paymentMethod: text("payment_method"),
	paymentStatus: text("payment_status"),
	assignedUserId: integer("assigned_user_id"),
	description: text(),
	priority: text(),
	estimatedDeliveryTime: varchar("estimated_delivery_time", { length: 100 }),
	lastStatusUpdate: timestamp("last_status_update", { mode: 'string' }),
	customerLastInteraction: timestamp("customer_last_interaction", { mode: 'string' }),
	modificationCount: integer("modification_count"),
	customerName: text("customer_name"),
	customerPhone: text("customer_phone"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	itemCount: bigint("item_count", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	totalItems: bigint("total_items", { mode: "number" }),
}).as(sql`SELECT o.id, o.order_number, o.customer_id, o.status, o.total_amount, o.delivery_cost, o.assigned_to, o.notes, o.created_at, o.updated_at, o.store_id, o.delivery_address, o.estimated_delivery, o.payment_method, o.payment_status, o.assigned_user_id, o.description, o.priority, o.estimated_delivery_time, o.last_status_update, o.customer_last_interaction, o.modification_count, c.name AS customer_name, c.phone AS customer_phone, count(oi.id) AS item_count, COALESCE(sum(oi.quantity), 0::bigint) AS total_items FROM orders o LEFT JOIN customers c ON o.customer_id = c.id LEFT JOIN order_items oi ON o.id = oi.order_id WHERE o.status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'processing'::text, 'shipped'::text]) GROUP BY o.id, c.name, c.phone`);