import { Link, useLocation } from "wouter";
import { ChartLine, ShoppingCart, MessageCircle, Users, Package, BarChart3, Settings, Menu, X, Smartphone, Bot, UserPlus, Zap, Bell, Wrench, ClipboardList, ShoppingBag, Store, Shield, CreditCard, MessageSquare, Cog, Database, Palette } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@shared/auth";
import { DollarSign } from "lucide-react";

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

interface NavItem {
  href: string;
  icon: any;
  label: string;
  badge: number | string | null;
  permission: string;
  roles?: string[];
  excludeRoles?: string[];
}

export default function Sidebar({ isOpen = true, onClose }: SidebarProps) {
  const [location] = useLocation();
  const [isMobile, setIsMobile] = useState(false);
  const { user } = useAuth();
  
  // Check if mobile view
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const isSuperAdmin = user?.role === 'super_admin';
  const isStoreUser = user && !isSuperAdmin;

  const { data: orders = [] } = useQuery({
    queryKey: ["/api/orders"],
    enabled: isStoreUser && hasPermission(user.role, 'view_orders'),
  });

  const { data: conversations = [] } = useQuery({
    queryKey: ["/api/conversations"],
    enabled: isStoreUser && hasPermission(user.role, 'view_conversations'),
  });

  const { data: notificationCounts = { total: 0, unread: 0 } } = useQuery({
    queryKey: ["/api/notifications/count", { userId: user?.id }],
    queryFn: () => apiRequest("GET", `/api/notifications/count?userId=${user?.id}`),
    refetchInterval: 30000,
    enabled: isStoreUser && hasPermission(user.role, 'view_notifications'),
  });

  const { data: superAdminMetrics } = useQuery({
    queryKey: ["/api/super-admin/metrics"],
    enabled: isSuperAdmin,
    refetchInterval: 60000,
  });

  const pendingOrders = Array.isArray(orders) ? orders.filter((order: any) => order.status === "pending").length : 0;
  const activeConversations = Array.isArray(conversations) ? conversations.filter((conv: any) => conv.unreadCount > 0).length : 0;
  const unreadNotifications = (() => {
    if (!notificationCounts || typeof notificationCounts !== 'object') return 0;
    if ('unread' in notificationCounts) {
      const unread = notificationCounts.unread;
      return typeof unread === 'number' ? unread : 0;
    }
    return 0;
  })();

  const allNavItems: NavItem[] = [
    // === MENU PARA TIENDAS (admin, manager, technician) ===
    {
      href: "/",
      icon: ChartLine,
      label: "Dashboard Principal",
      badge: null,
      permission: "view_dashboard",
      excludeRoles: ["super_admin"],
    },
    {
      href: "/conversations",
      icon: MessageCircle,
      label: "Conversaciones",
      badge: activeConversations > 0 ? activeConversations : null,
      permission: "view_conversations",
      excludeRoles: ["super_admin"],
    },
    {
      href: "/notifications",
      icon: Bell,
      label: "Notificaciones",
      badge: unreadNotifications > 0 ? unreadNotifications : null,
      permission: "view_notifications",
      excludeRoles: ["super_admin"],
    },
    {
      href: "/team",
      icon: Users,
      label: "Equipo",
      badge: null,
      permission: "manage_users",
      excludeRoles: ["super_admin", "technician"],
    },
    {
      href: "/customers",
      icon: UserPlus,
      label: "Clientes",
      badge: null,
      permission: "manage_customers",
      excludeRoles: ["super_admin", "technician"],
    },
    {
      href: "/orders",
      icon: ShoppingBag,
      label: "Gestión de Órdenes",
      badge: pendingOrders > 0 ? pendingOrders : null,
      permission: "manage_orders",
      excludeRoles: ["super_admin", "technician"],
    },
    {
      href: "/employees",
      icon: UserPlus,
      label: "Empleados",
      badge: null,
      permission: "manage_users",
      excludeRoles: ["super_admin", "technician"],
    },
    {
      href: "/product-management",
      icon: Package,
      label: "Gestión de Productos",
      badge: null,
      permission: "manage_products",
      excludeRoles: ["super_admin", "technician"],
    },
    {
      href: "/exchange-rates",
      icon: DollarSign,
      label: "Tasas de Cambio",
      badge: null,
      permission: "manage_settings",
    },
    {
      href: "/reports",
      icon: BarChart3,
      label: "Reportes",
      badge: null,
      permission: "view_reports",
      excludeRoles: ["super_admin", "technician"],
    },
    {
      href: "/billing",
      icon: CreditCard,
      label: "Facturación",
      badge: null,
      permission: "view_reports",
      excludeRoles: ["super_admin", "technician"],
    },
    {
      href: "/settings",
      icon: Settings,
      label: "Configuración",
      badge: null,
      permission: "manage_settings",
      excludeRoles: ["super_admin", "technician"],
    },
    {
      href: "/auto-responses",
      icon: Bot,
      label: "Respuestas Automáticas",
      badge: null,
      permission: "manage_settings",
      excludeRoles: ["super_admin", "technician"],
    },
    {
      href: "/assignment-rules",
      icon: Zap,
      label: "Asignación Automática",
      badge: null,
      permission: "manage_assignments",
      excludeRoles: ["super_admin", "technician"],
    },
    // === MENU ESPECÍFICO PARA TÉCNICOS ===
    {
      href: "/technician-dashboard",
      icon: Wrench,
      label: "Mi Trabajo",
      badge: null,
      permission: "technician_work",
      roles: ["technician"],
    },
    // === MENU PARA SUPER ADMIN ===
    {
      href: "/",
      icon: Shield,
      label: "Panel de Control General",
      badge: null,
      permission: "super_admin",
      roles: ["super_admin"],
    },
    {
      href: "/super-admin/stores",
      icon: Store,
      label: "Tiendas Registradas",
      badge: null,
      permission: "super_admin",
      roles: ["super_admin"],
    },
    {
      href: "/super-admin/subscriptions",
      icon: CreditCard,
      label: "Suscripciones",
      badge: null,
      permission: "super_admin",
      roles: ["super_admin"],
    },
    {
      href: "/super-admin/subscription-plans",
      icon: Package,
      label: "Planes de Suscripción",
      badge: null,
      permission: "super_admin",
      roles: ["super_admin"],
    },
    {
      href: "/super-admin/global-orders",
      icon: ShoppingCart,
      label: "Pedidos Globales",
      badge: null,
      permission: "super_admin",
      roles: ["super_admin"],
    },
    {
      href: "/super-admin/users",
      icon: Users,
      label: "Usuarios/Propietarios",
      badge: null,
      permission: "super_admin",
      roles: ["super_admin"],
    },
    {
      href: "/super-admin/reports",
      icon: BarChart3,
      label: "Reportes/Estadísticas",
      badge: null,
      permission: "super_admin",
      roles: ["super_admin"],
    },
    {
      href: "/super-admin/support",
      icon: MessageSquare,
      label: "Soporte/Tickets",
      badge: null,
      permission: "super_admin",
      roles: ["super_admin"],
    },
    {
      href: "/super-admin/store-settings",
      icon: Database,
      label: "Configuración de Tiendas",
      badge: null,
      permission: "super_admin",
      roles: ["super_admin"],
    },
    {
      href: "/super-admin/store-products",
      icon: Package,
      label: "Productos de Tiendas",
      badge: null,
      permission: "super_admin",
      roles: ["super_admin"],
    },
    {
      href: "/super-admin/store-themes",
      icon: Palette,
      label: "Temas y Personalización",
      badge: null,
      permission: "super_admin",
      roles: ["super_admin"],
    },
    {
      href: "/super-admin/whatsapp-management",
      icon: MessageCircle,
      label: "Gestión de WhatsApp",
      badge: null,
      permission: "super_admin",
      roles: ["super_admin"],
    },
    {
      href: "/super-admin/settings",
      icon: Settings,
      label: "Configuración Global",
      badge: null,
      permission: "super_admin",
      roles: ["super_admin"],
    },
  ];

  const navItems = allNavItems.filter(item => {
    if (!user) return false;
    
    if (item.roles && !item.roles.includes(user.role)) {
      return false;
    }
    
    if (item.excludeRoles && item.excludeRoles.includes(user.role)) {
      return false;
    }
    
    return hasPermission(user.role, item.permission);
  });

  if (isMobile && !isOpen) return null;

  return (
    <div className="relative">
      {/* Mobile backdrop */}
      {isMobile && isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
          onClick={onClose}
        />
      )}
      
      <aside className={`w-72 bg-gradient-to-b from-emerald-500 to-teal-600 shadow-xl border-r border-emerald-400 flex flex-col h-full ${
        isMobile 
          ? 'fixed left-0 top-0 z-50 transform transition-transform duration-300' 
          : 'relative'
      } ${
        isMobile && !isOpen ? '-translate-x-full' : 'translate-x-0'
      } md:w-72 md:relative md:transform-none`}>
        
        {/* Mobile close button */}
        {isMobile && (
          <div className="flex justify-end p-4 md:hidden">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={onClose}
              className="p-2 text-white hover:bg-white/20"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        )}

        {/* Logo Header */}
        <div className="p-4 md:p-6 border-b border-white/20 flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-8 md:w-10 h-8 md:h-10 bg-white/20 backdrop-blur rounded-lg flex items-center justify-center">
              <MessageCircle className="text-white h-5 md:h-6 w-5 md:w-6" />
            </div>
            <div>
              <h1 className="font-bold text-white text-base md:text-lg">🏪 OrderManager</h1>
              <p className="text-xs md:text-sm text-emerald-100">WhatsApp Business</p>
            </div>
          </div>
        </div>

        {/* User Profile */}
        <div className="p-4 border-b border-white/20 flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-white/20 backdrop-blur rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-medium">👤</span>
            </div>
            <div className="flex-1">
              <p className="font-medium text-white text-sm">Administrador</p>
              <p className="text-xs text-emerald-100">Sistema</p>
            </div>
            <button className="text-emerald-100 hover:text-white">
              <ChartLine className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Navigation Menu - CON SCROLL */}
        <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href === "/dashboard" && location === "/");
            const Icon = item.icon;
            
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center space-x-3 px-3 py-2 rounded-lg font-medium transition-colors ${
                  isActive
                    ? "bg-white/25 backdrop-blur text-white shadow-lg"
                    : "text-emerald-100 hover:bg-white/15 hover:text-white"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
                {item.badge && (
                  <Badge 
                    variant={item.href === "/conversations" ? "default" : "destructive"}
                    className={`ml-auto text-xs px-2 py-1 ${
                      item.href === "/conversations" ? "whatsapp-bg text-white" : ""
                    }`}
                  >
                    {item.badge}
                  </Badge>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-white/20 flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
            <span className="text-sm text-emerald-100">✅ WhatsApp API Conectado</span>
          </div>
        </div>
      </aside>
    </div>
  );
}