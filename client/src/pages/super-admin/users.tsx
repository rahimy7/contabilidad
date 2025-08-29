// client/src/pages/super-admin/users.tsx - ACTUALIZADO CON ROLES CORRECTOS DEL BACKEND

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Users, UserPlus, Eye, Edit, Trash2, Building2, Mail, Phone, Calendar, 
  Shield, Crown, CheckCircle, XCircle, AlertCircle, UserCheck, Key, 
  Database, Server, Store, Save, Briefcase, Truck, Headphones
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

// ====================================
// TIPOS Y INTERFACES ACTUALIZADAS
// ====================================

interface User {
  id: number;
  username: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  status: 'active' | 'inactive' | 'suspended';
  level: 'global' | 'store' | 'tenant';
  storeId?: number;
  storeName?: string;
  source: string;
  createdAt: string;
  lastLogin?: string;
  permissions?: string[];
  profileImage?: string;
  department?: string;
}

interface UserResponse {
  users: User[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
  metadata: {
    source: string;
    storeId: number | null;
    level: string;
  };
}

interface VirtualStore {
  id: number;
  name: string;
  isActive: boolean;
  userCount: number;
  hasSchema: boolean;
}

interface UserMetrics {
  totalGlobalUsers: number;
  totalStoreUsers: number;
  activeStoreUsers: number;
  totalUsers: number;
}

// ====================================
// ROLES ALINEADOS CON EL BACKEND
// ====================================

// Roles por nivel según el backend
const GLOBAL_ROLES = ['super_admin', 'system_admin'] as const;
const STORE_ROLES = ['store_owner', 'store_admin'] as const;
const TENANT_ROLES = ['admin', 'technician', 'seller', 'delivery', 'support', 'customer_service'] as const;

// Configuración de roles con sus respectivos niveles, etiquetas y colores
const ROLE_CONFIG = {
  // Roles globales
  super_admin: {
    label: 'Super Administrador',
    level: 'global',
    color: 'bg-red-100 text-red-800 border-red-200',
    icon: Crown,
    description: 'Acceso completo al sistema'
  },
  system_admin: {
    label: 'Administrador del Sistema',
    level: 'global', 
    color: 'bg-orange-100 text-orange-800 border-orange-200',
    icon: Shield,
    description: 'Administración del sistema'
  },
  
  // Roles de tienda
  store_owner: {
    label: 'Propietario de Tienda',
    level: 'store',
    color: 'bg-purple-100 text-purple-800 border-purple-200',
    icon: Building2,
    description: 'Propietario y administrador principal de la tienda'
  },
  store_admin: {
    label: 'Administrador de Tienda',
    level: 'store',
    color: 'bg-blue-100 text-blue-800 border-blue-200',
    icon: Database,
    description: 'Administrador de tienda con permisos limitados'
  },
  
  // Roles operacionales (tenant)
  admin: {
    label: 'Administrador',
    level: 'tenant',
    color: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    icon: Shield,
    description: 'Administrador local de operaciones'
  },
  technician: {
    label: 'Técnico',
    level: 'tenant',
    color: 'bg-blue-100 text-blue-800 border-blue-200',
    icon: Briefcase,
    description: 'Técnico especializado'
  },
  seller: {
    label: 'Vendedor',
    level: 'tenant',
    color: 'bg-green-100 text-green-800 border-green-200',
    icon: Users,
    description: 'Agente de ventas'
  },
  delivery: {
    label: 'Repartidor',
    level: 'tenant',
    color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    icon: Truck,
    description: 'Personal de entrega'
  },
  support: {
    label: 'Soporte',
    level: 'tenant',
    color: 'bg-purple-100 text-purple-800 border-purple-200',
    icon: Headphones,
    description: 'Soporte técnico y atención'
  },
  customer_service: {
    label: 'Atención al Cliente',
    level: 'tenant',
    color: 'bg-pink-100 text-pink-800 border-pink-200',
    icon: UserCheck,
    description: 'Servicio al cliente'
  }
} as const;

// ====================================
// ESQUEMAS DE VALIDACIÓN ACTUALIZADOS
// ====================================

// Esquema unificado que coincide con el backend
const createUserSchema = z.object({
  name: z.string().min(2, "Nombre requerido"),
  email: z.string().email("Email válido"),
  username: z.string().min(3, "Usuario mínimo 3 caracteres").optional(),
  password: z.string().min(6, "Contraseña mínimo 6 caracteres").optional(),
  phone: z.string().optional(),
  level: z.enum(['global', 'store', 'tenant']),
  role: z.string().min(1, "Rol requerido"),
  storeId: z.number().optional(),
  department: z.enum(['technical', 'sales', 'delivery', 'support', 'admin']).optional(),
  permissions: z.array(z.string()).optional(),
}).refine((data) => {
  // Validación: storeId requerido para niveles store y tenant
  if ((data.level === 'store' || data.level === 'tenant') && !data.storeId) {
    return false;
  }
  return true;
}, {
  message: "Store ID es requerido para usuarios de tienda y operacionales",
  path: ["storeId"]
});

const editUserSchema = z.object({
  name: z.string().min(2, "Nombre requerido"),
  email: z.string().email("Email válido"),
  phone: z.string().optional(),
  role: z.string().min(1, "Rol requerido"),
  status: z.enum(['active', 'inactive', 'suspended']),
  storeId: z.number().optional(),
  department: z.enum(['technical', 'sales', 'delivery', 'support', 'admin']).optional(),
  permissions: z.array(z.string()).optional(),
  changePassword: z.boolean().default(false),
  newPassword: z.string().optional(),
});

const changePasswordSchema = z.object({
  newPassword: z.string().min(6, "Contraseña mínimo 6 caracteres"),
  confirmPassword: z.string().min(6, "Confirmación requerida"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Las contraseñas no coinciden",
  path: ["confirmPassword"],
});

type CreateUserForm = z.infer<typeof createUserSchema>;
type EditUserForm = z.infer<typeof editUserSchema>;
type ChangePasswordForm = z.infer<typeof changePasswordSchema>;

// ====================================
// FUNCIONES HELPER
// ====================================

// Obtener roles permitidos según el nivel seleccionado
const getRolesForLevel = (level: string) => {
  switch (level) {
    case 'global':
      return GLOBAL_ROLES.map(role => ({
        value: role,
        label: ROLE_CONFIG[role].label,
        description: ROLE_CONFIG[role].description
      }));
    case 'store':
      return STORE_ROLES.map(role => ({
        value: role,
        label: ROLE_CONFIG[role].label,
        description: ROLE_CONFIG[role].description
      }));
    case 'tenant':
      return TENANT_ROLES.map(role => ({
        value: role,
        label: ROLE_CONFIG[role].label,
        description: ROLE_CONFIG[role].description
      }));
    default:
      return [];
  }
};

// Renderizar badge de rol con colores y iconos apropiados
const RoleBadge = ({ role }: { role: string }) => {
  const config = ROLE_CONFIG[role as keyof typeof ROLE_CONFIG];
  if (!config) {
    return <Badge variant="outline">{role}</Badge>;
  }

  const IconComponent = config.icon;
  return (
    <Badge className={`${config.color} flex items-center gap-1`}>
      <IconComponent className="w-3 h-3" />
      {config.label}
    </Badge>
  );
};

// Renderizar badge de nivel
const LevelBadge = ({ level }: { level: string }) => {
  const levelConfig = {
    global: { label: 'Global', color: 'bg-red-50 text-red-700 border-red-200' },
    store: { label: 'Tienda', color: 'bg-blue-50 text-blue-700 border-blue-200' },
    tenant: { label: 'Operacional', color: 'bg-green-50 text-green-700 border-green-200' }
  };

  const config = levelConfig[level as keyof typeof levelConfig];
  return (
    <Badge className={config?.color || 'bg-gray-50 text-gray-700'}>
      {config?.label || level}
    </Badge>
  );
};

// ====================================
// COMPONENTE PRINCIPAL
// ====================================

export default function SuperAdminUsers() {
  const [activeTab, setActiveTab] = useState("global");
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [userCredentials, setUserCredentials] = useState<{
    username: string;
    tempPassword: string;
    name: string;
    email: string;
    storeName?: string;
  } | null>(null);
  const [isCredentialsDialogOpen, setIsCredentialsDialogOpen] = useState(false);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createForm = useForm<CreateUserForm>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      level: "global",
      permissions: [],
    },
  });

  const editForm = useForm<EditUserForm>({
    resolver: zodResolver(editUserSchema),
    defaultValues: {
      status: "active",
      changePassword: false,
      permissions: [],
    },
  });

  const passwordForm = useForm<ChangePasswordForm>({
    resolver: zodResolver(changePasswordSchema),
  });

  // ====================================
  // QUERIES
  // ====================================

  const { data: stores } = useQuery<VirtualStore[]>({
    queryKey: ["/api/super-admin/stores"],
  });

  const { data: metrics } = useQuery<UserMetrics>({
    queryKey: ["/api/super-admin/user-metrics"],
  });

  const { data: usersResponse, isLoading } = useQuery<UserResponse>({
    queryKey: ["/api/super-admin/users", { 
      level: activeTab, 
      storeId: selectedStoreId,
      search: searchTerm 
    }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (activeTab !== 'global') params.append('level', activeTab);
      if (selectedStoreId) params.append('storeId', selectedStoreId.toString());
      if (searchTerm) params.append('search', searchTerm);
      
      return apiRequest("GET", `/api/super-admin/users?${params.toString()}`);
    },
  });

  // ====================================
  // MUTATIONS
  // ====================================

  const createUserMutation = useMutation({
    mutationFn: (userData: CreateUserForm) => 
      apiRequest("POST", "/api/super-admin/users", userData),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/user-metrics"] });
      setIsCreateDialogOpen(false);
      createForm.reset();

      if (data.tempPassword) {
        const store = stores?.find(s => s.id === data.user.storeId);
        setUserCredentials({
          username: data.user.username,
          tempPassword: data.tempPassword,
          name: data.user.name,
          email: data.user.email,
          storeName: store?.name
        });
        setIsCredentialsDialogOpen(true);
      }
      
      toast({ title: "Usuario creado exitosamente" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo crear el usuario",
        variant: "destructive",
      });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: EditUserForm & { level: string } }) => 
      apiRequest("PUT", `/api/super-admin/users/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/users"] });
      setIsEditDialogOpen(false);
      setSelectedUser(null);
      editForm.reset();
      toast({ title: "Usuario actualizado exitosamente" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo actualizar el usuario",
        variant: "destructive",
      });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({ id, level, storeId }: any) => 
      apiRequest("POST", `/api/super-admin/users/${id}/reset-password`, { 
        level, 
        storeId
      }),
    onSuccess: (data: any, variables: any) => {
      const user = users.find(u => u.id === variables.id);
      const store = stores?.find(s => s.id === user?.storeId);
      
      setUserCredentials({
        username: user?.username || '',
        tempPassword: data.newPassword,
        name: user?.name || '',
        email: user?.email || '',
        storeName: store?.name
      });
      setIsCredentialsDialogOpen(true);
      
      toast({ title: "Contraseña reseteada" });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: ({ id, level, storeId }: any) => 
      apiRequest("DELETE", `/api/super-admin/users/${id}?level=${level}&storeId=${storeId || ''}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/user-metrics"] });
      setIsDeleteDialogOpen(false);
      setSelectedUser(null);
      toast({ title: "Usuario eliminado" });
    },
  });

  // ====================================
  // HANDLERS
  // ====================================

  const handleCreateUser = (data: CreateUserForm) => {
    createUserMutation.mutate(data);
  };

  const handleEditUser = (user: User) => {
    setSelectedUser(user);
    editForm.reset({
      name: user.name,
      email: user.email,
      phone: user.phone || "",
      role: user.role,
      status: user.status,
      storeId: user.storeId,
      department: user.department as any,
      permissions: user.permissions || [],
      changePassword: false,
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdateUser = (data: EditUserForm) => {
    if (!selectedUser) return;
    
    const updateData = {
      ...data,
      level: selectedUser.level
    };
    
    updateUserMutation.mutate({ 
      id: selectedUser.id, 
      data: updateData 
    });
  };

  const handleResetPassword = (user: User) => {
    resetPasswordMutation.mutate({
      id: user.id,
      level: user.level,
      storeId: user.storeId
    });
  };

  const handleDeleteUser = (user: User) => {
    setSelectedUser(user);
    setIsDeleteDialogOpen(true);
  };

  const confirmDeleteUser = () => {
    if (!selectedUser) return;
    
    deleteUserMutation.mutate({
      id: selectedUser.id,
      level: selectedUser.level,
      storeId: selectedUser.storeId
    });
  };

  // ====================================
  // DATOS PROCESADOS
  // ====================================

  const users = usersResponse?.users || [];
  const pagination = usersResponse?.pagination;

  // Estadísticas por tab activo
  const getStatsForActiveTab = () => {
    if (!metrics) return null;
    
    switch (activeTab) {
      case 'global':
        return {
          total: metrics.totalGlobalUsers,
          active: metrics.totalGlobalUsers, // Asumimos que todos están activos
          subtitle: 'Usuarios del sistema global'
        };
      case 'store':
        return {
          total: metrics.totalStoreUsers,
          active: metrics.activeStoreUsers,
          subtitle: 'Usuarios administrativos de tiendas'
        };
      case 'tenant':
        return {
          total: metrics.totalUsers - metrics.totalGlobalUsers - metrics.totalStoreUsers,
          active: metrics.totalUsers - metrics.totalGlobalUsers - metrics.totalStoreUsers,
          subtitle: 'Usuarios operacionales'
        };
      default:
        return null;
    }
  };

  const currentStats = getStatsForActiveTab();

  // ====================================
  // RENDER DEL COMPONENTE
  // ====================================

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Users className="h-8 w-8 text-blue-600" />
              Gestión de Usuarios
            </h1>
            <p className="text-gray-600 mt-2">
              Administra usuarios globales, de tienda y operacionales del sistema
            </p>
          </div>
          <Button
            onClick={() => setIsCreateDialogOpen(true)}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <UserPlus className="w-4 h-4 mr-2" />
            Crear Usuario
          </Button>
        </div>

        {/* Métricas */}
        {currentStats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Total</p>
                    <p className="text-2xl font-bold">{currentStats.total}</p>
                  </div>
                  <Users className="h-8 w-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Activos</p>
                    <p className="text-2xl font-bold text-green-600">{currentStats.active}</p>
                  </div>
                  <CheckCircle className="h-8 w-8 text-green-500" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Tipo</p>
                    <p className="text-sm font-medium">{currentStats.subtitle}</p>
                  </div>
                  <Database className="h-8 w-8 text-purple-500" />
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Pestañas y Filtros */}
      <div className="mb-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between mb-4">
            <TabsList className="grid w-full lg:w-auto grid-cols-3">
              <TabsTrigger value="global" className="flex items-center gap-2">
                <Crown className="w-4 h-4" />
                Globales
              </TabsTrigger>
              <TabsTrigger value="store" className="flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                Tienda
              </TabsTrigger>
              <TabsTrigger value="tenant" className="flex items-center gap-2">
                <Briefcase className="w-4 h-4" />
                Operacionales
              </TabsTrigger>
            </TabsList>

            <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
              <div className="flex-1 lg:w-64">
                <Input
                  placeholder="Buscar usuarios..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full"
                />
              </div>
              
              {(activeTab === 'store' || activeTab === 'tenant') && (
                <Select 
                  value={selectedStoreId?.toString() || "all"} 
                  onValueChange={(value) => setSelectedStoreId(value === "all" ? null : parseInt(value))}
                >
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue placeholder="Filtrar por tienda" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las tiendas</SelectItem>
                    {stores?.map((store) => (
                      <SelectItem key={store.id} value={store.id.toString()}>
                        {store.name} ({store.userCount} usuarios)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {/* Contenido de las pestañas */}
          <TabsContent value={activeTab} className="mt-6">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : (
              <div className="grid gap-4">
                {users.length === 0 ? (
                  <Card>
                    <CardContent className="p-12 text-center">
                      <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">
                        No se encontraron usuarios
                      </h3>
                      <p className="text-gray-500 mb-4">
                        {searchTerm 
                          ? `No hay usuarios que coincidan con "${searchTerm}"`
                          : `No hay usuarios ${activeTab === 'global' ? 'globales' : activeTab === 'store' ? 'de tienda' : 'operacionales'} registrados`
                        }
                      </p>
                      {!searchTerm && (
                        <Button
                          onClick={() => setIsCreateDialogOpen(true)}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          <UserPlus className="w-4 h-4 mr-2" />
                          Crear Primer Usuario
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ) : (
                  users.map((user) => (
                    <Card key={user.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-4">
                            <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold text-lg">
                              {user.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="space-y-1">
                              <div className="flex items-center space-x-2">
                                <h3 className="font-semibold text-lg">{user.name}</h3>
                                <RoleBadge role={user.role} />
                                <LevelBadge level={user.level} />
                              </div>
                              <div className="flex items-center space-x-4 text-sm text-gray-600">
                                <span className="flex items-center">
                                  <Mail className="w-4 h-4 mr-1" />
                                  {user.email}
                                </span>
                                {user.phone && (
                                  <span className="flex items-center">
                                    <Phone className="w-4 h-4 mr-1" />
                                    {user.phone}
                                  </span>
                                )}
                                {user.storeName && (
                                  <span className="flex items-center">
                                    <Store className="w-4 h-4 mr-1" />
                                    {user.storeName}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center space-x-4 text-xs text-gray-500">
                                <span>@{user.username}</span>
                                <span>•</span>
                                <span>ID: {user.id}</span>
                                <span>•</span>
                                <span>Creado: {new Date(user.createdAt).toLocaleDateString()}</span>
                                {user.lastLogin && (
                                  <>
                                    <span>•</span>
                                    <span>Último acceso: {new Date(user.lastLogin).toLocaleDateString()}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Badge
                              className={
                                user.status === 'active'
                                  ? 'bg-green-100 text-green-800 border-green-200'
                                  : user.status === 'suspended'
                                  ? 'bg-red-100 text-red-800 border-red-200'
                                  : 'bg-gray-100 text-gray-800 border-gray-200'
                              }
                            >
                              {user.status === 'active' && <CheckCircle className="w-3 h-3 mr-1" />}
                              {user.status === 'suspended' && <XCircle className="w-3 h-3 mr-1" />}
                              {user.status === 'inactive' && <AlertCircle className="w-3 h-3 mr-1" />}
                              {user.status === 'active' ? 'Activo' : user.status === 'suspended' ? 'Suspendido' : 'Inactivo'}
                            </Badge>
                            <div className="flex space-x-1">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleEditUser(user)}
                                className="text-blue-600 border-blue-200 hover:bg-blue-50"
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleResetPassword(user)}
                                className="text-green-600 border-green-200 hover:bg-green-50"
                              >
                                <Key className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDeleteUser(user)}
                                className="text-red-600 border-red-200 hover:bg-red-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* ====================================
          DIÁLOGOS
          ==================================== */}

      {/* Diálogo Crear Usuario */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-blue-600" />
              Crear Nuevo Usuario
            </DialogTitle>
            <DialogDescription>
              Complete los datos del nuevo usuario. Los campos marcados son obligatorios.
            </DialogDescription>
          </DialogHeader>

          <Form {...createForm}>
            <form onSubmit={createForm.handleSubmit(handleCreateUser)} className="space-y-4">
              {/* Nivel de Usuario */}
              <FormField
                control={createForm.control}
                name="level"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nivel de Usuario</FormLabel>
                    <Select onValueChange={(value) => {
                      field.onChange(value);
                      createForm.setValue('role', ''); // Reset role when level changes
                      if (value === 'global') {
                        createForm.setValue('storeId', undefined);
                      }
                    }} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar nivel" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="global">
                          <div className="flex items-center gap-2">
                            <Crown className="w-4 h-4" />
                            Global - Acceso completo al sistema
                          </div>
                        </SelectItem>
                        <SelectItem value="store">
                          <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4" />
                            Tienda - Administración de tienda
                          </div>
                        </SelectItem>
                        <SelectItem value="tenant">
                          <div className="flex items-center gap-2">
                            <Briefcase className="w-4 h-4" />
                            Operacional - Trabajo diario
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Tienda (requerido para store y tenant) */}
              {(createForm.watch('level') === 'store' || createForm.watch('level') === 'tenant') && (
                <FormField
                  control={createForm.control}
                  name="storeId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tienda *</FormLabel>
                      <Select onValueChange={(value) => field.onChange(parseInt(value))} value={field.value?.toString()}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar tienda" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {stores?.map((store) => (
                            <SelectItem key={store.id} value={store.id.toString()}>
                              <div className="flex items-center justify-between w-full">
                                <span>{store.name}</span>
                                <Badge variant="outline" className="ml-2">
                                  {store.userCount} usuarios
                                </Badge>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Rol */}
              <FormField
                control={createForm.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rol *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar rol" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {getRolesForLevel(createForm.watch('level')).map((role) => (
                          <SelectItem key={role.value} value={role.value}>
                            <div className="flex flex-col">
                              <span className="font-medium">{role.label}</span>
                              <span className="text-xs text-gray-500">{role.description}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Departamento (solo para tenant) */}
              {createForm.watch('level') === 'tenant' && (
                <FormField
                  control={createForm.control}
                  name="department"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Departamento</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar departamento" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="technical">Técnico</SelectItem>
                          <SelectItem value="sales">Ventas</SelectItem>
                          <SelectItem value="delivery">Delivery</SelectItem>
                          <SelectItem value="support">Soporte</SelectItem>
                          <SelectItem value="admin">Administración</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Información Personal */}
              <div className="grid grid-cols-1 gap-4">
                <FormField
                  control={createForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre Completo *</FormLabel>
                      <FormControl>
                        <Input placeholder="Juan Pérez" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={createForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email *</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="juan@empresa.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={createForm.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Usuario</FormLabel>
                      <FormControl>
                        <Input placeholder="jperez (opcional)" {...field} />
                      </FormControl>
                      <FormDescription>
                        Si no se especifica, se generará automáticamente
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={createForm.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Teléfono</FormLabel>
                      <FormControl>
                        <Input placeholder="+1 (809) 123-4567" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={createForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contraseña</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Mínimo 6 caracteres (opcional)" {...field} />
                      </FormControl>
                      <FormDescription>
                        Si no se especifica, se generará una contraseña temporal
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex justify-end space-x-2 pt-4 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700"
                  disabled={createUserMutation.isPending}
                >
                  {createUserMutation.isPending ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Creando...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Crear Usuario
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Diálogo Editar Usuario */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="w-5 h-5 text-blue-600" />
              Editar Usuario: {selectedUser?.name}
            </DialogTitle>
            <DialogDescription>
              Modifique la información del usuario seleccionado.
            </DialogDescription>
          </DialogHeader>

          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(handleUpdateUser)} className="space-y-4">
              {/* Información Personal */}
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre Completo *</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email *</FormLabel>
                    <FormControl>
                      <Input type="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Teléfono</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Rol */}
              <FormField
                control={editForm.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rol *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {getRolesForLevel(selectedUser?.level || 'tenant').map((role) => (
                          <SelectItem key={role.value} value={role.value}>
                            <div className="flex flex-col">
                              <span className="font-medium">{role.label}</span>
                              <span className="text-xs text-gray-500">{role.description}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Departamento (solo para tenant) */}
              {selectedUser?.level === 'tenant' && (
                <FormField
                  control={editForm.control}
                  name="department"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Departamento</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="technical">Técnico</SelectItem>
                          <SelectItem value="sales">Ventas</SelectItem>
                          <SelectItem value="delivery">Delivery</SelectItem>
                          <SelectItem value="support">Soporte</SelectItem>
                          <SelectItem value="admin">Administración</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Estado */}
              <FormField
                control={editForm.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estado *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="active">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-green-600" />
                            Activo
                          </div>
                        </SelectItem>
                        <SelectItem value="inactive">
                          <div className="flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 text-yellow-600" />
                            Inactivo
                          </div>
                        </SelectItem>
                        <SelectItem value="suspended">
                          <div className="flex items-center gap-2">
                            <XCircle className="w-4 h-4 text-red-600" />
                            Suspendido
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end space-x-2 pt-4 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700"
                  disabled={updateUserMutation.isPending}
                >
                  {updateUserMutation.isPending ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Guardar Cambios
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Diálogo Eliminar Usuario */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-600" />
              Confirmar Eliminación
            </DialogTitle>
            <DialogDescription>
              Esta acción no se puede deshacer. Se eliminará permanentemente el usuario y todos sus datos asociados.
            </DialogDescription>
          </DialogHeader>

          {selectedUser && (
            <div className="bg-gray-50 rounded-lg p-4 my-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold">
                  {selectedUser.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h4 className="font-semibold">{selectedUser.name}</h4>
                  <p className="text-sm text-gray-600">{selectedUser.email}</p>
                  <div className="flex items-center space-x-2 mt-1">
                    <RoleBadge role={selectedUser.role} />
                    <LevelBadge level={selectedUser.level} />
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end space-x-2 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteUser}
              disabled={deleteUserMutation.isPending}
            >
              {deleteUserMutation.isPending ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Eliminando...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Eliminar Usuario
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Diálogo Credenciales */}
      <Dialog open={isCredentialsDialogOpen} onOpenChange={setIsCredentialsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="w-5 h-5 text-green-600" />
              Credenciales Generadas
            </DialogTitle>
            <DialogDescription>
              Se han generado las credenciales para el usuario. Guarde esta información de forma segura.
            </DialogDescription>
          </DialogHeader>

          {userCredentials && (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h4 className="font-semibold text-green-800 mb-3">Información del Usuario</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Nombre:</span>
                    <span className="font-medium">{userCredentials.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Email:</span>
                    <span className="font-medium">{userCredentials.email}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Usuario:</span>
                    <span className="font-mono bg-gray-100 px-2 py-1 rounded">{userCredentials.username}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Contraseña:</span>
                    <span className="font-mono bg-yellow-100 px-2 py-1 rounded text-yellow-800">{userCredentials.tempPassword}</span>
                  </div>
                  {userCredentials.storeName && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Tienda:</span>
                      <span className="font-medium">{userCredentials.storeName}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-sm text-amber-800">
                  <strong>Importante:</strong> Esta contraseña temporal debe cambiarse en el primer inicio de sesión.
                </p>
              </div>
            </div>
          )}

          <div className="flex justify-end pt-4 border-t">
            <Button
              onClick={() => {
                setIsCredentialsDialogOpen(false);
                setUserCredentials(null);
              }}
              className="bg-green-600 hover:bg-green-700"
            >
              Entendido
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}