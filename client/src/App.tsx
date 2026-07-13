// App.tsx
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";

import ConversationsTest from './components/ConversationsTest';
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { WarehouseProvider } from "@/contexts/WarehouseContext";
import { CompanyProvider } from "@/contexts/CompanyContext";
import { hasPermission } from "@shared/auth";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Orders from "@/pages/orders";
import Conversations from "@/pages/conversations";
import Team from "@/pages/team";
import Products from "@/pages/products";
import Reports from "@/pages/reports";
import Settings from "@/pages/settings";
import WhatsAppSettings from "@/pages/whatsapp-settings";
import AutoResponses from "@/pages/auto-responses";
import Employees from "@/pages/employees";
import Customers from "@/pages/customers";
import AssignmentRules from "@/pages/assignment-rules";
import Notifications from "@/pages/notifications";
import TechnicianDashboard from "@/pages/technician-dashboard";
import UserSettings from "@/pages/user-settings";
import Catalog from "@/pages/catalog";
import PublicCatalogClean from "@/pages/public-catalog-clean";
import SimpleCatalog from "@/pages/simple-catalog";
import Cart from "@/pages/cart";
import Billing from "@/pages/billing";
import OrderManagement from "@/pages/order-management";
import MultiTenantLogin from "@/pages/multi-tenant-login";
import AppLayout from "@/components/layout/app-layout";
import { useEffect, useRef } from 'react';
import { ErrorBoundary } from "./ErrorBoundary";
import React from "react";
import { ToastProvider } from '@/components/ui/use-toast';
import ProductManagement from "./pages/product-management";
import AddProduct from "@/pages/add-product";
import ExchangeRateManagement from '@/pages/exchange-rates';
import CategoriesBrandsManagement from './pages/categories-brands-management';
import TechnicianConversations from "./pages/technician-conversations";
import BrandsManagement from "./pages/brands";
import MeasurementUnitsManagement from "./pages/measurement-units";
import StoreSettingsPage from "@/pages/store-settings";

// ✅ NUEVO: Importar componente de compartir producto y HelmetProvider
import ShareProduct from '@/pages/share-product';
import { HelmetProvider } from 'react-helmet-async';
import DeliveryDashboardPage from "./pages/delivery-dashboard";
import TripsPage from "./pages/trips";
import PublicOrder from "./pages/public-order";
import POSScreen from "./pages/pos-screen";
import CustomerManagement from "./pages/customer-management";
import PurchaseManagement from "./pages/purchase-management";
import InventoryTraceability from "./pages/inventory-traceability";
import ReceivePurchaseOrder from "./pages/receive-purchase-order";
import AppointmentsPage from "./pages/appointments";
import AppointmentServicesPage from "./pages/appointment-services";
import DoctorDashboard from "./pages/doctor-dashboard";
import InventoryAdjustmentPage from "./pages/inventory-adjustment";
import SalesHistoryPage from "./pages/sales-history";
import CashRegisterPage from "./pages/cash-register";import WarehousesPage from "@/pages/warehouses";
import CompaniesPage from "@/pages/companies";
import ChartOfAccountsPage from "@/pages/accounting/chart-of-accounts";
import TrialBalancePage from "@/pages/accounting/trial-balance";
import FinancialStatementsPage from "@/pages/accounting/financial-statements";
import FiscalDocumentsPage from "@/pages/fiscal/fiscal-documents";
import DgiiReportsPage from "@/pages/fiscal/dgii-reports";
import ReceivablesPage from "@/pages/receivables";
import PayablesPage from "@/pages/payables";
import FixedAssetsPage from "@/pages/fixed-assets";
import BudgetPage from "@/pages/budget";
import PayrollPage from "@/pages/payroll";
import TreasuryPage from "@/pages/treasury";
import InventoryCostingPage from "@/pages/inventory-costing";
import ConsolidationPage from "@/pages/consolidation";
import WarehouseTransfersPage from "@/pages/warehouse-transfers";
import WarehouseReportsPage from "@/pages/warehouse-reports";
function ProtectedRoute({ component: Component, permission }: { component: React.ComponentType, permission?: string }) {
  const { user, isLoading } = useAuth();

  // Cargar vistas asignadas por RBAC (usa el mismo cache que el sidebar)
  const { data: rbacViews = [], isLoading: rbacLoading } = useQuery<any[]>({
    queryKey: ["/api/roles/me/permissions"],
    queryFn: () => apiRequest("GET", "/api/roles/me/permissions"),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading || (!!user && rbacLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return <MultiTenantLogin />;
  }

  if (permission) {
    // Admin siempre tiene acceso total
    const isAdmin = user.role === 'admin' || user.role === 'super_admin';
    // Para otros roles: verificar que la vista está asignada en el sistema RBAC
    const hasRbacAccess = isAdmin ||
      rbacViews.some((v: any) => v.permission_required === permission);

    if (!hasRbacAccess) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              Acceso Denegado
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              No tienes permisos para acceder a esta página.
            </p>
          </div>
        </div>
      );
    }
  }

 // console.log('✅ ProtectedRoute: Acceso permitido, renderizando componente');
  return <Component />;
}

function RoleDashboard() {
  const { user } = useAuth();

  // Redireccionar técnicos a su dashboard específico
  if (user?.role === 'technician') {
    return <ProtectedRoute component={TechnicianDashboard} permission="technician_work" />;
  }

  if (user?.role === 'delivery') {
    return <ProtectedRoute component={DeliveryDashboardPage} permission="view_dashboard_delivery" />;
  }

  // Administradores al Dashboard Principal
  if (user?.role === 'admin') {
    return <ProtectedRoute component={Dashboard} permission="view_dashboard" />;
  }

  // Otros roles a conversaciones
  return <ProtectedRoute component={Conversations} permission="view_conversations" />;
}

function ConversationsWrapper() {
  const { user } = useAuth();
  
  console.log('🔍 ConversationsWrapper - User role:', user?.role); // DEBUG
  
  if (user?.role === 'technician') {
    console.log('👨‍🔧 Loading TechnicianConversations'); // DEBUG
    return <ProtectedRoute component={TechnicianConversations} permission="view_conversations" />;
  }
  
  console.log('👤 Loading regular Conversations'); // DEBUG
  return <ProtectedRoute component={Conversations} permission="view_conversations" />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={RoleDashboard} />
      <Route path="/dashboard" component={() => <ProtectedRoute component={Dashboard} permission="view_dashboard" />} />
      <Route path="/technician-dashboard" component={() => <ProtectedRoute component={TechnicianDashboard} permission="technician_work" />} />
      <Route path="/conversations" component={ConversationsWrapper} />
      <Route path="/orders" component={() => <ProtectedRoute component={Orders} permission="manage_orders" />} />
      <Route path="/order-management" component={() => <ProtectedRoute component={OrderManagement} permission="manage_orders" />} />
      <Route path="/conversations" component={() => <ProtectedRoute component={Conversations} permission="view_conversations" />} />
      <Route path="/team" component={() => <ProtectedRoute component={Team} permission="manage_users" />} />
      <Route path="/products" component={() => <ProtectedRoute component={Products} permission="manage_orders" />} />
      <Route path="/exchange-rates" component={() => <ProtectedRoute component={ExchangeRateManagement} permission="manage_settings" />} />
      <Route path="/store-settings" component={() => <ProtectedRoute component={StoreSettingsPage} permission="manage_settings" />} />
      <Route path="/product-management" component={() => <ProtectedRoute component={ProductManagement} permission="manage_products" />} />
      <Route path="/add-product" component={() => <ProtectedRoute component={AddProduct} permission="manage_products" />} />
      <Route path="/reports" component={() => <ProtectedRoute component={Reports} permission="view_reports" />} />
      <Route path="/billing" component={() => <ProtectedRoute component={Billing} permission="manage_settings" />} />
      <Route path="/settings" component={() => <ProtectedRoute component={Settings} permission="manage_settings" />} />
      <Route path="/whatsapp-settings" component={() => <ProtectedRoute component={WhatsAppSettings} permission="manage_settings" />} />
      <Route path="/auto-responses" component={() => <ProtectedRoute component={AutoResponses} permission="manage_settings" />} />
      <Route path="/customers" component={() => <ProtectedRoute component={Customers} permission="manage_customers" />} />
      <Route path="/assignment-rules" component={() => <ProtectedRoute component={AssignmentRules} permission="manage_assignments" />} />
      <Route path="/notifications" component={() => <ProtectedRoute component={Notifications} permission="view_notifications" />} />
      <Route path="/admin/categories-brands" component={() => <ProtectedRoute component={CategoriesBrandsManagement} permission="manage_products" />} />
      <Route path="/admin/brands" component={() => <ProtectedRoute component={BrandsManagement} permission="manage_products" />} />
      <Route path="/admin/measurement-units" component={() => <ProtectedRoute component={MeasurementUnitsManagement} permission="manage_products" />} />
      <Route path="/employees" component={() => <ProtectedRoute component={Employees} permission="manage_users" />} />
      <Route path="/catalog" component={Catalog} />
      <Route path="/public-catalog" component={PublicCatalogClean} />
      <Route path="/simple-catalog" component={SimpleCatalog} />
     <Route path="/trips" component={TripsPage} />
      <Route path="/delivery-dashboard" component={() => <ProtectedRoute component={DeliveryDashboardPage} permission="view_dashboard_delivery" />} />
      <Route path="/customer-management" component={() => <ProtectedRoute component={CustomerManagement} permission="manage_customers" />} />
      <Route path="/purchase-management" component={() => <ProtectedRoute component={PurchaseManagement} permission="manage_products" />} />
      <Route path="/receive-purchase-order/:id" component={() => <ProtectedRoute component={ReceivePurchaseOrder} permission="manage_products" />} />
      <Route path="/inventory-traceability" component={() => <ProtectedRoute component={InventoryTraceability} permission="manage_products" />} />
      <Route path="/appointments" component={() => <ProtectedRoute component={AppointmentsPage} permission="manage_appointments" />} />
      <Route path="/appointment-services" component={() => <ProtectedRoute component={AppointmentServicesPage} permission="manage_appointments" />} />
      <Route path="/doctor-dashboard" component={() => <ProtectedRoute component={DoctorDashboard} permission="manage_appointments" />} />
      <Route path="/inventory-adjustment" component={() => <ProtectedRoute component={InventoryAdjustmentPage} permission="manage_inventory_adjustments" />} />
      <Route path="/sales-history" component={() => <ProtectedRoute component={SalesHistoryPage} permission="manage_orders" />} />
      <Route path="/cash-register" component={() => <ProtectedRoute component={CashRegisterPage} permission="manage_cash_register" />} />
      <Route path="/warehouses" component={() => <ProtectedRoute component={WarehousesPage} permission="manage_products" />} />
      <Route path="/warehouse-transfers" component={() => <ProtectedRoute component={WarehouseTransfersPage} permission="manage_products" />} />
      <Route path="/warehouse-reports" component={() => <ProtectedRoute component={WarehouseReportsPage} permission="view_reports" />} />
      {/* Contabilidad y fiscal (DGII) */}
      <Route path="/companies" component={() => <ProtectedRoute component={CompaniesPage} permission="manage_settings" />} />
      <Route path="/accounting/accounts" component={() => <ProtectedRoute component={ChartOfAccountsPage} permission="manage_accounting" />} />
      <Route path="/accounting/trial-balance" component={() => <ProtectedRoute component={TrialBalancePage} permission="view_financial_reports" />} />
      <Route path="/accounting/financial-statements" component={() => <ProtectedRoute component={FinancialStatementsPage} permission="view_financial_reports" />} />
      <Route path="/fiscal/documents" component={() => <ProtectedRoute component={FiscalDocumentsPage} permission="manage_invoicing" />} />
      <Route path="/fiscal/reports" component={() => <ProtectedRoute component={DgiiReportsPage} permission="view_fiscal_reports" />} />
      <Route path="/receivables" component={() => <ProtectedRoute component={ReceivablesPage} permission="manage_accounting" />} />
      <Route path="/payables" component={() => <ProtectedRoute component={PayablesPage} permission="manage_accounting" />} />
      <Route path="/fixed-assets" component={() => <ProtectedRoute component={FixedAssetsPage} permission="manage_accounting" />} />
      <Route path="/budget" component={() => <ProtectedRoute component={BudgetPage} permission="manage_accounting" />} />
      <Route path="/payroll" component={() => <ProtectedRoute component={PayrollPage} permission="manage_accounting" />} />
      <Route path="/treasury" component={() => <ProtectedRoute component={TreasuryPage} permission="manage_accounting" />} />
      <Route path="/inventory-costing" component={() => <ProtectedRoute component={InventoryCostingPage} permission="manage_accounting" />} />
      <Route path="/consolidation" component={() => <ProtectedRoute component={ConsolidationPage} permission="view_financial_reports" />} />
      <Route path="/user-settings" component={UserSettings} />
    </Switch>
  );
}

function AppWithAuth() {
  const { user, isLoading } = useAuth();
  
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <Switch>
      {/* Rutas públicas sin layout */}
      <Route path="/public-catalog" component={PublicCatalogClean} />
      <Route path="/simple-catalog" component={SimpleCatalog} />
      <Route path="/login" component={MultiTenantLogin} />
      <Route path="/multi-tenant-login" component={MultiTenantLogin} />
      <Route path="/orders/public/:storeId/:orderId" component={PublicOrder} />

      {/* ✅ NUEVA RUTA: Página de compartir producto (pública, sin layout) */}
      <Route path="/share-product" component={ShareProduct} />

      {/* ✅ NUEVA RUTA: POS (protegido, sin layout - pantalla completa) */}
      {user && <Route path="/pos" component={() => <ProtectedRoute component={POSScreen} permission="manage_orders" />} />}

      {/* Rutas que requieren autenticación con layout */}
      <Route>
        {!user ? (
          <MultiTenantLogin />
        ) : (
          <AppLayout>
            <Router />
          </AppLayout>
        )}
      </Route>
    </Switch>
  );
}

// ✅ FUNCIÓN TEMPORALMENTE DESHABILITADA
export function ReactDebugComponent() {
  return null; // Componente deshabilitado temporalmente
}

function App() {
  return (
    // ✅ NUEVO: Envolver con HelmetProvider para meta tags de Open Graph
    <HelmetProvider>
      <ToastProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <AuthProvider>
              <CompanyProvider>
              <WarehouseProvider>
              <ErrorBoundary>
                <Toaster />
                <AppWithAuth />
              </ErrorBoundary>
              </WarehouseProvider>
              </CompanyProvider>
            </AuthProvider>
          </TooltipProvider>
        </QueryClientProvider>
      </ToastProvider>
    </HelmetProvider>
  );
}

export default App;
