import { Link, useLocation } from "wouter";
import { ChartLine, ShoppingCart, MessageCircle, Users, Package, BarChart3, Settings, Menu, X, Smartphone, Bot, UserPlus, Zap, Bell, Wrench, ClipboardList, ShoppingBag, Store, Shield, CreditCard, MessageSquare, Cog, Database, Palette, Truck, DollarSign, ShoppingBasket, Sliders, TrendingUp, Coins, Receipt, Layout, Scale, FileText, PackageSearch } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@shared/auth";

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

interface ActiveTrip {
  id: number;
  status: 'active' | 'processing' | 'pending' | 'completed';
  tripNumber: string;
  totalOrders: number;
  completedOrders: number;
}

interface NavItem {
  href: string;
  icon: any;
  label: string;
  badge: number | string | null;
  permission: string;
  roles?: string[];
  excludeRoles?: string[];
  section?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

export default function Sidebar({ isOpen = true, onClose }: SidebarProps) {
  const [location] = useLocation();
  const [isMobile, setIsMobile] = useState(false);
  const { user } = useAuth();
  
  // Check if mobile view
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1025);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const { data: orders = [] } = useQuery({
    queryKey: ["/api/orders"],
    enabled: user && hasPermission(user.role, 'view_orders'),
  });

  const { data: conversations = [] } = useQuery({
    queryKey: ["/api/conversations"],
    enabled: user && hasPermission(user.role, 'view_conversations'),
  });

  const { data: notificationCounts = { total: 0, unread: 0 } } = useQuery({
    queryKey: ["/api/notifications/count", { userId: user?.id }],
    queryFn: () => apiRequest("GET", `/api/notifications/count?userId=${user?.id}`),
    refetchInterval: 30000,
    enabled: user && hasPermission(user.role, 'view_notifications'),
  });

const { data: activeTrip } = useQuery<ActiveTrip | null>({
  queryKey: ["/api/trips/my-active"],
  enabled: user && user?.role === 'delivery',
  refetchInterval: 30000,
});

  // Query para obtener stats de viajes (para admin/sales)
  const { data: tripStats } = useQuery({
    queryKey: ["/api/trips", { status: 'pending' }],
    enabled: user && (user?.role === 'admin' || user?.role === 'sales_rep'),
    refetchInterval: 30000,
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

  // Badge para viajes pendientes (admin/sales)
  const pendingTrips = Array.isArray(tripStats) ? tripStats.filter((trip: any) => trip.status === 'pending').length : 0;
  
  // Badge para delivery (muestra si tiene viaje activo)
const hasActiveTrip = activeTrip?.status === 'active' || activeTrip?.status === 'processing';
  // Función para manejar el clic en las opciones del menú
  const handleMenuItemClick = () => {
    if (isMobile && onClose) {
      onClose();
    }
  };

  const allNavItems: NavItem[] = [
    {
      href: "/dashboard",
      icon: ChartLine,
      label: "Dashboard",
      badge: null,
      permission: "view_dashboard",
    },
    {
      href: "/conversations",
      icon: MessageCircle,
      label: "Conversaciones WhatsApp",
      badge: activeConversations > 0 ? activeConversations : null,
      permission: "view_conversations",
    },
    {
      href: "/notifications",
      icon: Bell,
      label: "Notificaciones",
      badge: unreadNotifications > 0 ? unreadNotifications : null,
      permission: "view_notifications",
      excludeRoles: ["technician"],
    },
    {
      href: "/orders",
      icon: ShoppingCart,
      label: "Pedidos",
      badge: pendingOrders > 0 ? pendingOrders : null,
      permission: "manage_orders",
      excludeRoles: ["technician"],
    },
    // === VIAJES - PARA ADMIN Y SALES ===
    {
      href: "/trips",
      icon: Truck,
      label: "Gestión de Viajes",
      badge: pendingTrips > 0 ? pendingTrips : null,
      permission: "manage_orders",
      roles: ["admin", "sales_rep"],
    },
    {
      href: "/employees",
      icon: UserPlus,
      label: "Empleados",
      badge: null,
      permission: "manage_users",
      excludeRoles: ["technician"],
    },
    {
      href: "/product-management",
      icon: Package,
      label: "Gestión de Productos",
      badge: null,
      permission: "manage_products",
      excludeRoles: ["technician"],
    },
    {
      href: "/admin/measurement-units",
      icon: Scale,
      label: "Unidades de Medida",
      badge: null,
      permission: "manage_products",
      excludeRoles: ["technician"],
    },
    {
      href: "/purchase-management",
      icon: FileText,
      label: "Gestión de Compras",
      badge: null,
      permission: "manage_products",
      excludeRoles: ["technician"],
    },
    {
      href: "/inventory-traceability",
      icon: PackageSearch,
      label: "Trazabilidad de Inventario",
      badge: null,
      permission: "manage_products",
      excludeRoles: ["technician"],
    },
    {
      href: "/customer-management",
      icon: Users,
      label: "Gestión de Clientes",
      badge: null,
      permission: "manage_customers",
      excludeRoles: ["technician"],
    },
    // === VENTAS Y PUNTO DE VENTA ===
    {
      href: "/pos",
      icon: ShoppingBasket,
      label: "Punto de Venta (POS)",
      badge: null,
      permission: "manage_orders",
      roles: ["admin", "sales_rep"],
    },
    {
      href: "/store-settings",
      icon: Sliders,
      label: "Configuración de Tienda",
      badge: null,
      permission: "manage_settings",
      roles: ["admin"],
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
      excludeRoles: ["technician"],
    },
    {
      href: "/billing",
      icon: CreditCard,
      label: "Facturación",
      badge: null,
      permission: "view_reports",
      excludeRoles: ["technician"],
    },
    {
      href: "/settings",
      icon: Settings,
      label: "Configuración",
      badge: null,
      permission: "manage_settings",
      excludeRoles: ["technician"],
    },
    {
      href: "/auto-responses",
      icon: Bot,
      label: "Respuestas Automáticas",
      badge: null,
      permission: "manage_settings",
      excludeRoles: ["technician"],
    },
    {
      href: "/assignment-rules",
      icon: Zap,
      label: "Asignación Automática",
      badge: null,
      permission: "manage_assignments",
      excludeRoles: ["technician"],
    },
    // === MENU ESPECÍFICO PARA TÉCNICOS ===
    {
      href: "/technician-dashboard",
      icon: Wrench,
      label: "Panel Técnico",
      badge: null,
      permission: "view_technician",
      roles: ["technician"],
    },
    {
      href: "/installation-requests",
      icon: ClipboardList,
      label: "Solicitudes de Instalación",
      badge: null,
      permission: "manage_installations",
      roles: ["technician"],
    },
    {
      href: "/my-installations",
      icon: ShoppingBag,
      label: "Mis Instalaciones",
      badge: null,
      permission: "view_installations",
      roles: ["technician"],
    },
    // === MENU ESPECÍFICO PARA DELIVERY ===
    {
      href: "/delivery-dashboard",
      icon: Truck,
      label: "Mi Viaje",
      badge: hasActiveTrip ? "●" : null,
      permission: "view_orders",
      roles: ["delivery"],
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
      
      <aside className={`w-72 bg-gradient-to-b from-[#4a5eba] to-[#3d4e9f] shadow-xl border-r border-white/10 flex flex-col h-full ${
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
        <div className="p-4 md:p-6 border-b border-white/30 flex-shrink-0 bg-black/10">
          <div className="flex items-center space-x-3">
            <img
              src="/4life-logo-white.svg"
              alt="4Life Logo"
              className="h-8 md:h-10 w-auto drop-shadow-lg"
            />
            <div>
              <h1 className="font-bold text-white text-base md:text-lg drop-shadow-sm">Bella Vista</h1>
            </div>
          </div>
        </div>

        {/* User Profile */}
        <div className="p-4 border-b border-white/30 flex-shrink-0 bg-black/5">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-white/30 backdrop-blur rounded-full flex items-center justify-center shadow-md">
              <span className="text-white text-sm font-medium drop-shadow-sm">👤</span>
            </div>
            <div className="flex-1">
              <p className="font-medium text-white text-sm drop-shadow-sm">Administrador</p>
              <p className="text-xs text-white/90">Sistema</p>
            </div>
            <button className="text-white/90 hover:text-white transition-colors">
              <ChartLine className="h-4 w-4 drop-shadow-sm" />
            </button>
          </div>
        </div>

        {/* Navigation Menu - CON SCROLL */}
        <nav className="flex-1 overflow-y-auto px-3 py-2">
          <div className="space-y-1">
            {navItems.map((item) => {
              const isActive = location === item.href || (item.href === "/dashboard" && location === "/");
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={handleMenuItemClick}
                  className={`flex items-center space-x-3 px-3 py-2 rounded-lg font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-white text-[#4a5eba] shadow-lg font-semibold"
                      : "text-white/95 hover:bg-white/20 hover:text-white hover:shadow-md"
                  }`}
                >
                  <Icon className={`h-5 w-5 ${
                    isActive ? "" : "drop-shadow-sm"
                  }`} />
                  <span className={isActive ? "" : "drop-shadow-sm"}>{item.label}</span>
                  {item.badge && (
                    <Badge
                      variant={item.href === "/conversations" ? "default" : "destructive"}
                      className={`ml-auto text-xs px-2 py-1 ${
                        item.href === "/conversations" ? "whatsapp-bg text-white" : ""
                      } ${
                        item.badge === "●" ? "bg-green-500 text-white animate-pulse" : ""
                      }`}
                    >
                      {item.badge}
                    </Badge>
                  )}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-white/30 flex-shrink-0 bg-black/5">
          <div className="flex items-center space-x-3">
            <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse shadow-lg"></div>
            <span className="text-sm text-white/95 drop-shadow-sm font-medium">✅ WhatsApp API Conectado</span>
          </div>
        </div>
      </aside>
    </div>
  );
}