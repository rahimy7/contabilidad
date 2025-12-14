// App.tsx
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";

import ConversationsTest from './components/ConversationsTest';
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@shared/auth";
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

function ProtectedRoute({ component: Component, permission }: { component: React.ComponentType, permission?: string }) {
  const { user, isLoading } = useAuth();
  
  // 🔍 LOG: Debug de ProtectedRoute
 /*  console.log('🔍 ProtectedRoute - Debug:', {
    component: Component.name,
    permission,
    user: user ? {
      username: user.username,
      role: user.role,
      level: user.level,
      storeId: user.storeId
    } : null,
    isLoading
  }); */
  
  if (isLoading) {
    // console.log('⏳ ProtectedRoute: Cargando...');
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
   // console.log('❌ ProtectedRoute: Sin usuario, redirigiendo a login');
    return <MultiTenantLogin />;
  }

  if (permission) {
    const hasRequiredPermission = hasPermission(user.role, permission);
   /*  console.log('🔐 ProtectedRoute - Verificando permisos:', {
      userRole: user.role,
      requiredPermission: permission,
      hasPermission: hasRequiredPermission
    }); */
    
    if (!hasRequiredPermission) {
     // console.log('❌ ProtectedRoute: ACCESO DENEGADO');
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
      <Route path="/billing" component={() => <ProtectedRoute component={Billing} permission="view_reports" />} />
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
              <ErrorBoundary>
                <Toaster />
                <AppWithAuth />
              </ErrorBoundary>
            </AuthProvider>
          </TooltipProvider>
        </QueryClientProvider>
      </ToastProvider>
    </HelmetProvider>
  );
}

export default App;