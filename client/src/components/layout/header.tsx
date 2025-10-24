import { useState } from "react";
import { Plus, Bell, Settings, Menu, LogOut, User, ChevronDown, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import CreateOrderModal from "@/components/orders/create-order-modal";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";

interface HeaderProps {
  title?: string;
  subtitle?: string;
  onMenuClick?: () => void;
  showMenuButton?: boolean;
}

export default function Header({ 
  title = "Dashboard Principal", 
  subtitle = "Gestión de pedidos y conversaciones de WhatsApp",
  onMenuClick,
  showMenuButton = false
}: HeaderProps) {
  const [isCreateOrderModalOpen, setIsCreateOrderModalOpen] = useState(false);
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();

  const handleLogout = () => {
    logout();
  };

  const handleUserSettings = () => {
    setLocation('/user-settings');
  };

  const switchUser = async (username: string, password: string) => {
    try {
      await logout();
      // Small delay to ensure logout completes
      setTimeout(async () => {
        const { login } = useAuth();
        await login(username, password);
        setLocation('/');
      }, 100);
    } catch (error) {
      console.error('Error switching user:', error);
    }
  };

  return (
    <header className="bg-gradient-to-r from-emerald-500 to-teal-500 border-b border-emerald-400 px-3 md:px-6 py-3 md:py-4 shadow-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          {showMenuButton && (
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={onMenuClick}
              className="lg:hidden text-white hover:bg-white/20"
            >
              <Menu className="h-5 w-5" />
            </Button>
          )}
          <div>
            <h2 className="text-lg md:text-2xl font-bold text-white">
              {user?.storeName ? `${user.storeName}` : title}
            </h2>
            <p className="text-sm md:text-base text-emerald-100 hidden sm:block">
              {user?.name ? `Bienvenido, ${user.name}` : subtitle}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2 md:space-x-4">
          <Button 
            className="bg-white/20 backdrop-blur hover:bg-white/30 text-white text-sm md:text-base px-3 md:px-4 border border-white/30"
            onClick={() => setIsCreateOrderModalOpen(true)}
          >
            <Plus className="h-4 w-4 mr-0 md:mr-2" />
            <span className="hidden sm:inline">🛍️ Nuevo Pedido</span>
            <span className="sm:hidden">Nuevo</span>
          </Button>
          <div className="flex items-center space-x-1 md:space-x-2">
            <Button variant="ghost" size="icon" className="relative text-white hover:bg-white/20">
              <Bell className="h-4 md:h-5 w-4 md:w-5" />
              <Badge className="absolute -top-1 -right-1 bg-red-500 text-white text-xs h-4 md:h-5 w-4 md:w-5 rounded-full flex items-center justify-center p-0">
                3
              </Badge>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="hidden md:flex text-white hover:bg-white/20">
                  <Settings className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="flex items-center space-x-2 p-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
                    {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                  </div>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium">{user?.name || 'Usuario'}</p>
                    <p className="text-xs text-muted-foreground capitalize">{user?.role || 'usuario'}</p>
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleUserSettings}>
                  <User className="mr-2 h-4 w-4" />
                  <span>Ajustes del Usuario</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <div className="px-2 py-1">
                  <p className="text-xs text-muted-foreground mb-2">Cambio rápido de usuario:</p>
                  {user?.role !== 'admin' && (
                    <DropdownMenuItem 
                      onClick={() => switchUser('admin', 'password')}
                      className="text-xs py-1 mb-1"
                    >
                      <RefreshCw className="mr-2 h-3 w-3" />
                      <span>👑 Administrador</span>
                    </DropdownMenuItem>
                  )}
                  {user?.role !== 'technician' && (
                    <DropdownMenuItem 
                      onClick={() => switchUser('tech1', 'password')}
                      className="text-xs py-1 mb-1"
                    >
                      <RefreshCw className="mr-2 h-3 w-3" />
                      <span>🔧 Técnico (Dashboard Nuevo)</span>
                    </DropdownMenuItem>
                  )}
                  {user?.role !== 'seller' && (
                    <DropdownMenuItem 
                      onClick={() => switchUser('seller1', 'password')}
                      className="text-xs py-1"
                    >
                      <RefreshCw className="mr-2 h-3 w-3" />
                      <span>💼 Vendedor</span>
                    </DropdownMenuItem>
                  )}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Cerrar Sesión</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <CreateOrderModal
        isOpen={isCreateOrderModalOpen}
        onClose={() => setIsCreateOrderModalOpen(false)}
      />
    </header>
  );
}