import { relations } from "drizzle-orm/relations";
import { roles, rolePermissions, views, users, userRoles, inventoryAdjustments, inventoryAdjustmentItems, products, customers, appointments, appointmentTitulares, appointmentServiceTypes, customerCreditAccounts, cashWithdrawals, creditTransactions, orders, cashRegisterSessions, customerTypes, exchangeRates, customerRegistrationFlows, inventoryMovements, suppliers, notificationConfigs, notificationHistory, loyaltyPointsTransactions, notificationChannels, notificationEvents, measurementUnits, purchaseOrderItems, purchaseOrders, trips, tripOrders, customerLoyaltyBalance, orderItems, productUnitConversions } from "./schema";

export const rolePermissionsRelations = relations(rolePermissions, ({one}) => ({
	role: one(roles, {
		fields: [rolePermissions.roleId],
		references: [roles.id]
	}),
	view: one(views, {
		fields: [rolePermissions.viewId],
		references: [views.id]
	}),
}));

export const rolesRelations = relations(roles, ({many}) => ({
	rolePermissions: many(rolePermissions),
	userRoles: many(userRoles),
	users: many(users),
}));

export const viewsRelations = relations(views, ({many}) => ({
	rolePermissions: many(rolePermissions),
}));

export const userRolesRelations = relations(userRoles, ({one}) => ({
	user: one(users, {
		fields: [userRoles.userId],
		references: [users.id]
	}),
	role: one(roles, {
		fields: [userRoles.roleId],
		references: [roles.id]
	}),
}));

export const usersRelations = relations(users, ({one, many}) => ({
	userRoles: many(userRoles),
	inventoryAdjustments: many(inventoryAdjustments),
	appointments: many(appointments),
	cashWithdrawals_cashierId: many(cashWithdrawals, {
		relationName: "cashWithdrawals_cashierId_users_id"
	}),
	cashWithdrawals_authorizedByUserId: many(cashWithdrawals, {
		relationName: "cashWithdrawals_authorizedByUserId_users_id"
	}),
	cashWithdrawals_voidedByUserId: many(cashWithdrawals, {
		relationName: "cashWithdrawals_voidedByUserId_users_id"
	}),
	creditTransactions: many(creditTransactions),
	cashRegisterSessions_cashierId: many(cashRegisterSessions, {
		relationName: "cashRegisterSessions_cashierId_users_id"
	}),
	cashRegisterSessions_closedByUserId: many(cashRegisterSessions, {
		relationName: "cashRegisterSessions_closedByUserId_users_id"
	}),
	cashRegisterSessions_approvedByUserId: many(cashRegisterSessions, {
		relationName: "cashRegisterSessions_approvedByUserId_users_id"
	}),
	exchangeRates: many(exchangeRates),
	trips: many(trips),
	role: one(roles, {
		fields: [users.roleId],
		references: [roles.id]
	}),
}));

export const inventoryAdjustmentsRelations = relations(inventoryAdjustments, ({one, many}) => ({
	user: one(users, {
		fields: [inventoryAdjustments.adjustedBy],
		references: [users.id]
	}),
	inventoryAdjustmentItems: many(inventoryAdjustmentItems),
}));

export const inventoryAdjustmentItemsRelations = relations(inventoryAdjustmentItems, ({one}) => ({
	inventoryAdjustment: one(inventoryAdjustments, {
		fields: [inventoryAdjustmentItems.adjustmentId],
		references: [inventoryAdjustments.id]
	}),
	product: one(products, {
		fields: [inventoryAdjustmentItems.productId],
		references: [products.id]
	}),
}));

export const productsRelations = relations(products, ({one, many}) => ({
	inventoryAdjustmentItems: many(inventoryAdjustmentItems),
	inventoryMovements: many(inventoryMovements),
	measurementUnit: one(measurementUnits, {
		fields: [products.baseUnitId],
		references: [measurementUnits.id]
	}),
	purchaseOrderItems: many(purchaseOrderItems),
	productUnitConversions: many(productUnitConversions),
}));

export const appointmentsRelations = relations(appointments, ({one}) => ({
	customer: one(customers, {
		fields: [appointments.customerId],
		references: [customers.id]
	}),
	user: one(users, {
		fields: [appointments.createdBy],
		references: [users.id]
	}),
	appointmentTitulare: one(appointmentTitulares, {
		fields: [appointments.titularId],
		references: [appointmentTitulares.id]
	}),
	appointmentServiceType: one(appointmentServiceTypes, {
		fields: [appointments.serviceTypeId],
		references: [appointmentServiceTypes.id]
	}),
}));

export const customersRelations = relations(customers, ({one, many}) => ({
	appointments: many(appointments),
	customerCreditAccounts: many(customerCreditAccounts),
	creditTransactions: many(creditTransactions),
	customerType: one(customerTypes, {
		fields: [customers.customerTypeId],
		references: [customerTypes.id]
	}),
	customerRegistrationFlows: many(customerRegistrationFlows),
	loyaltyPointsTransactions: many(loyaltyPointsTransactions),
	customerLoyaltyBalances: many(customerLoyaltyBalance),
}));

export const appointmentTitularesRelations = relations(appointmentTitulares, ({many}) => ({
	appointments: many(appointments),
}));

export const appointmentServiceTypesRelations = relations(appointmentServiceTypes, ({many}) => ({
	appointments: many(appointments),
}));

export const customerCreditAccountsRelations = relations(customerCreditAccounts, ({one}) => ({
	customer: one(customers, {
		fields: [customerCreditAccounts.customerId],
		references: [customers.id]
	}),
}));

export const cashWithdrawalsRelations = relations(cashWithdrawals, ({one}) => ({
	user_cashierId: one(users, {
		fields: [cashWithdrawals.cashierId],
		references: [users.id],
		relationName: "cashWithdrawals_cashierId_users_id"
	}),
	user_authorizedByUserId: one(users, {
		fields: [cashWithdrawals.authorizedByUserId],
		references: [users.id],
		relationName: "cashWithdrawals_authorizedByUserId_users_id"
	}),
	user_voidedByUserId: one(users, {
		fields: [cashWithdrawals.voidedByUserId],
		references: [users.id],
		relationName: "cashWithdrawals_voidedByUserId_users_id"
	}),
}));

export const creditTransactionsRelations = relations(creditTransactions, ({one}) => ({
	customer: one(customers, {
		fields: [creditTransactions.customerId],
		references: [customers.id]
	}),
	order: one(orders, {
		fields: [creditTransactions.orderId],
		references: [orders.id]
	}),
	user: one(users, {
		fields: [creditTransactions.createdBy],
		references: [users.id]
	}),
}));

export const ordersRelations = relations(orders, ({one, many}) => ({
	creditTransactions: many(creditTransactions),
	customerRegistrationFlows: many(customerRegistrationFlows),
	loyaltyPointsTransactions: many(loyaltyPointsTransactions),
	trip: one(trips, {
		fields: [orders.tripId],
		references: [trips.id]
	}),
	tripOrders: many(tripOrders),
}));

export const cashRegisterSessionsRelations = relations(cashRegisterSessions, ({one}) => ({
	user_cashierId: one(users, {
		fields: [cashRegisterSessions.cashierId],
		references: [users.id],
		relationName: "cashRegisterSessions_cashierId_users_id"
	}),
	user_closedByUserId: one(users, {
		fields: [cashRegisterSessions.closedByUserId],
		references: [users.id],
		relationName: "cashRegisterSessions_closedByUserId_users_id"
	}),
	user_approvedByUserId: one(users, {
		fields: [cashRegisterSessions.approvedByUserId],
		references: [users.id],
		relationName: "cashRegisterSessions_approvedByUserId_users_id"
	}),
}));

export const customerTypesRelations = relations(customerTypes, ({many}) => ({
	customers: many(customers),
}));

export const exchangeRatesRelations = relations(exchangeRates, ({one}) => ({
	user: one(users, {
		fields: [exchangeRates.updatedBy],
		references: [users.id]
	}),
}));

export const customerRegistrationFlowsRelations = relations(customerRegistrationFlows, ({one}) => ({
	customer: one(customers, {
		fields: [customerRegistrationFlows.customerId],
		references: [customers.id]
	}),
	order: one(orders, {
		fields: [customerRegistrationFlows.orderId],
		references: [orders.id]
	}),
}));

export const inventoryMovementsRelations = relations(inventoryMovements, ({one}) => ({
	product: one(products, {
		fields: [inventoryMovements.productId],
		references: [products.id]
	}),
	supplier: one(suppliers, {
		fields: [inventoryMovements.supplierId],
		references: [suppliers.id]
	}),
}));

export const suppliersRelations = relations(suppliers, ({many}) => ({
	inventoryMovements: many(inventoryMovements),
	purchaseOrders: many(purchaseOrders),
}));

export const notificationHistoryRelations = relations(notificationHistory, ({one}) => ({
	notificationConfig: one(notificationConfigs, {
		fields: [notificationHistory.configId],
		references: [notificationConfigs.id]
	}),
}));

export const notificationConfigsRelations = relations(notificationConfigs, ({one, many}) => ({
	notificationHistories: many(notificationHistory),
	notificationChannel: one(notificationChannels, {
		fields: [notificationConfigs.channelId],
		references: [notificationChannels.id]
	}),
	notificationEvent: one(notificationEvents, {
		fields: [notificationConfigs.eventId],
		references: [notificationEvents.id]
	}),
}));

export const loyaltyPointsTransactionsRelations = relations(loyaltyPointsTransactions, ({one}) => ({
	customer: one(customers, {
		fields: [loyaltyPointsTransactions.customerId],
		references: [customers.id]
	}),
	order: one(orders, {
		fields: [loyaltyPointsTransactions.orderId],
		references: [orders.id]
	}),
}));

export const notificationChannelsRelations = relations(notificationChannels, ({many}) => ({
	notificationConfigs: many(notificationConfigs),
}));

export const notificationEventsRelations = relations(notificationEvents, ({many}) => ({
	notificationConfigs: many(notificationConfigs),
}));

export const measurementUnitsRelations = relations(measurementUnits, ({many}) => ({
	products: many(products),
	orderItems: many(orderItems),
	productUnitConversions_sourceUnitId: many(productUnitConversions, {
		relationName: "productUnitConversions_sourceUnitId_measurementUnits_id"
	}),
	productUnitConversions_targetUnitId: many(productUnitConversions, {
		relationName: "productUnitConversions_targetUnitId_measurementUnits_id"
	}),
}));

export const purchaseOrderItemsRelations = relations(purchaseOrderItems, ({one}) => ({
	product: one(products, {
		fields: [purchaseOrderItems.productId],
		references: [products.id]
	}),
	purchaseOrder: one(purchaseOrders, {
		fields: [purchaseOrderItems.purchaseOrderId],
		references: [purchaseOrders.id]
	}),
}));

export const purchaseOrdersRelations = relations(purchaseOrders, ({one, many}) => ({
	purchaseOrderItems: many(purchaseOrderItems),
	supplier: one(suppliers, {
		fields: [purchaseOrders.supplierId],
		references: [suppliers.id]
	}),
}));

export const tripsRelations = relations(trips, ({one, many}) => ({
	orders: many(orders),
	user: one(users, {
		fields: [trips.assignedUserId],
		references: [users.id]
	}),
	tripOrders: many(tripOrders),
}));

export const tripOrdersRelations = relations(tripOrders, ({one}) => ({
	order: one(orders, {
		fields: [tripOrders.orderId],
		references: [orders.id]
	}),
	trip: one(trips, {
		fields: [tripOrders.tripId],
		references: [trips.id]
	}),
}));

export const customerLoyaltyBalanceRelations = relations(customerLoyaltyBalance, ({one}) => ({
	customer: one(customers, {
		fields: [customerLoyaltyBalance.customerId],
		references: [customers.id]
	}),
}));

export const orderItemsRelations = relations(orderItems, ({one}) => ({
	measurementUnit: one(measurementUnits, {
		fields: [orderItems.unitId],
		references: [measurementUnits.id]
	}),
}));

export const productUnitConversionsRelations = relations(productUnitConversions, ({one}) => ({
	product: one(products, {
		fields: [productUnitConversions.productId],
		references: [products.id]
	}),
	measurementUnit_sourceUnitId: one(measurementUnits, {
		fields: [productUnitConversions.sourceUnitId],
		references: [measurementUnits.id],
		relationName: "productUnitConversions_sourceUnitId_measurementUnits_id"
	}),
	measurementUnit_targetUnitId: one(measurementUnits, {
		fields: [productUnitConversions.targetUnitId],
		references: [measurementUnits.id],
		relationName: "productUnitConversions_targetUnitId_measurementUnits_id"
	}),
}));