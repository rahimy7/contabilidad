import { Link, useLocation } from "wouter";
import { 
  ChartLine, ShoppingCart, MessageCircle, Users, Package, BarChart3, Settings, 
  X, Bot, UserPlus, Zap, Bell, Wrench, ClipboardList, ShoppingBag, Shield, 
  CreditCard, Truck, DollarSign, ShoppingBasket, Sliders, Scale, FileText, PackageSearch, CalendarDays, Stethoscope
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";

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

  // ================================
  // CARGA DE VISTAS DINÁMICAS - SISTEMA RBAC
  // ================================
  
  const { data: dynamicViews = [], isLoading: viewsLoading } = useQuery({
    queryKey: ["/api/roles/me/permissions"],
    queryFn: () => apiRequest("GET", "/api/roles/me/permissions"),
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // 5 minutos
  });

  // ================================
  // QUERIES PARA BADGES
  // ================================
  
  const { data: orders = [] } = useQuery({
    queryKey: ["/api/orders"],
    enabled: !!user,
  });

  const { data: conversations = [] } = useQuery({
    queryKey: ["/api/conversations"],
    enabled: !!user,
  });

  const { data: notificationCounts = { total: 0, unread: 0 } } = useQuery({
    queryKey: ["/api/notifications/count", { userId: user?.id }],
    queryFn: () => apiRequest("GET", `/api/notifications/count?userId=${user?.id}`),
    refetchInterval: 30000,
    enabled: !!user,
  });

  const { data: activeTrip } = useQuery<ActiveTrip | null>({
    queryKey: ["/api/trips/my-active"],
    enabled: !!user && user?.role === 'delivery',
    refetchInterval: 30000,
  });

  const { data: tripStats } = useQuery({
    queryKey: ["/api/trips", { status: 'pending' }],
    enabled: !!user && (user?.role === 'admin' || user?.role === 'sales_rep'),
    refetchInterval: 30000,
  });

  // ================================
  // CÁLCULO DE BADGES
  // ================================
  
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
  const pendingTrips = Array.isArray(tripStats) ? tripStats.filter((trip: any) => trip.status === 'pending').length : 0;
  const hasActiveTrip = activeTrip?.status === 'active' || activeTrip?.status === 'processing';

  // ================================
  // CONSTRUCCIÓN DE ITEMS DE NAVEGACIÓN
  // ================================
  
  // Mapa de iconos
  const iconMap: Record<string, any> = {
    ChartLine, ShoppingCart, MessageCircle, Users, Package, BarChart3, Settings,
    UserPlus, Zap, Bell, Wrench, ClipboardList, ShoppingBag, Truck, DollarSign,
    ShoppingBasket, Sliders, Scale, FileText, PackageSearch, CreditCard, Bot, Shield, CalendarDays, Stethoscope,
  };

  // Mapa de badges por ruta
  const getBadgeForRoute = (routePath: string): number | string | null => {
    switch (routePath) {
      case '/conversations':
        return activeConversations > 0 ? activeConversations : null;
      case '/notifications':
        return unreadNotifications > 0 ? unreadNotifications : null;
      case '/orders':
        return pendingOrders > 0 ? pendingOrders : null;
      case '/trips':
        return pendingTrips > 0 ? pendingTrips : null;
      case '/delivery-dashboard':
        return hasActiveTrip ? "●" : null;
      default:
        return null;
    }
  };

  // Convertir vistas dinámicas a NavItems
  const navItems: NavItem[] = dynamicViews.map((view: any) => ({
    href: view.route_path,
    icon: iconMap[view.icon_name] || Package,
    label: view.label,
    badge: getBadgeForRoute(view.route_path),
  }));

  // Función para manejar el clic en las opciones del menú
  const handleMenuItemClick = () => {
    if (isMobile && onClose) {
      onClose();
    }
  };

  // ================================
  // RENDERIZADO
  // ================================

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
              src="/image.png"
              alt="Metabella Logo"
              className="h-8 md:h-10 w-auto drop-shadow-lg"
            />
            <div>
              <h1 className="font-bold text-white text-base md:text-lg drop-shadow-sm">Metabella</h1>
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
              <p className="font-medium text-white text-sm drop-shadow-sm">{user?.name || 'Usuario'}</p>
              <p className="text-xs text-white/90 capitalize">{user?.role || 'Sistema'}</p>
            </div>
            <button className="text-white/90 hover:text-white transition-colors">
              <ChartLine className="h-4 w-4 drop-shadow-sm" />
            </button>
          </div>
        </div>

        {/* Navigation Menu - CON SCROLL */}
        <nav className="flex-1 overflow-y-auto px-3 py-2">
          {viewsLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-white/70 text-sm">Cargando menú...</div>
            </div>
          ) : navItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
              <Shield className="w-12 h-12 text-white/50 mb-3" />
              <p className="text-white/70 text-sm">No tienes vistas asignadas</p>
              <p className="text-white/50 text-xs mt-1">Contacta al administrador</p>
            </div>
          ) : (
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
          )}
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
