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
  Database, Server, Store
} from "lucide-react";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

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

const createUserSchema = z.object({
  name: z.string().min(2, "Nombre requerido"),
  email: z.string().email("Email válido"),
  username: z.string().min(3, "Usuario mínimo 3 caracteres").optional(),
  password: z.string().min(6, "Contraseña mínimo 6 caracteres").optional(),
  role: z.string().min(1, "Rol requerido"),
  level: z.enum(['global', 'store', 'tenant']),
  storeId: z.number().optional(),
});

type CreateUserForm = z.infer<typeof createUserSchema>;

export default function SuperAdminUsers() {
  const [activeTab, setActiveTab] = useState("global");
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
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

  const form = useForm<CreateUserForm>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      level: "global",
      role: "admin",
    },
  });

  // Queries
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

  // Mutations
  const createUserMutation = useMutation({
    mutationFn: (userData: CreateUserForm) => 
      apiRequest("POST", "/api/super-admin/users", userData),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/user-metrics"] });
      setIsCreateDialogOpen(false);
      form.reset();

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

  const handleCreateUser = (data: CreateUserForm) => {
    createUserMutation.mutate(data);
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
    if (selectedUser) {
      deleteUserMutation.mutate({
        id: selectedUser.id,
        level: selectedUser.level,
        storeId: selectedUser.storeId
      });
    }
  };

  const getContextIcon = (level: string) => {
    switch (level) {
      case 'global': return <Crown className="h-4 w-4" />;
      case 'store': return <Building2 className="h-4 w-4" />;
      case 'tenant': return <Users className="h-4 w-4" />;
      default: return <Users className="h-4 w-4" />;
    }
  };

  const getContextColor = (level: string) => {
    switch (level) {
      case 'global': return 'bg-purple-100 text-purple-800';
      case 'store': return 'bg-blue-100 text-blue-800';
      case 'tenant': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const users = usersResponse?.users || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Gestión de Usuarios</h1>
          <p className="text-muted-foreground">Administrar usuarios por contexto</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="h-4 w-4 mr-2" />
              Nuevo Usuario
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Crear Usuario</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleCreateUser)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="level"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contexto</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="global">Global (Super Admin)</SelectItem>
                          <SelectItem value="store">Tienda (System Users)</SelectItem>
                          <SelectItem value="tenant">Tenant (Schema Tienda)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {form.watch("level") !== "global" && (
                  <FormField
                    control={form.control}
                    name="storeId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tienda</FormLabel>
                        <Select 
                          onValueChange={(value) => field.onChange(parseInt(value))} 
                          value={field.value?.toString() || ""}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar tienda" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {stores?.map((store) => (
                              <SelectItem key={store.id} value={store.id.toString()}>
                                {store.name} ({store.userCount} usuarios)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Rol</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="admin, user, etc." />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end space-x-2">
                  <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={createUserMutation.isPending}>
                    {createUserMutation.isPending ? "Creando..." : "Crear"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Métricas */}
      {metrics && (
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Usuarios</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.totalUsers}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Usuarios Globales</CardTitle>
              <Crown className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.totalGlobalUsers}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Usuarios Tienda</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.totalStoreUsers}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Activos</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.activeStoreUsers}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Pestañas */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="global" className="flex items-center gap-2">
            <Crown className="h-4 w-4" />
            Usuarios Globales
          </TabsTrigger>
          <TabsTrigger value="store" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Usuarios de Tienda
          </TabsTrigger>
          <TabsTrigger value="tenant" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Usuarios Operacionales
          </TabsTrigger>
        </TabsList>

        {/* Filtros */}
        <div className="flex gap-4 mt-4">
          <Input
            placeholder="Buscar usuarios..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-sm"
          />
          
          {(activeTab === "store" || activeTab === "tenant") && (
            <Select 
              value={selectedStoreId?.toString() || ""} 
              onValueChange={(value) => {
                setSelectedStoreId(value ? parseInt(value) : null);
              }}
            >
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Seleccionar tienda" />
              </SelectTrigger>
              <SelectContent>
                {stores?.map((store) => (
                  <SelectItem key={store.id} value={store.id.toString()}>
                    {store.name} ({store.userCount} usuarios)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <TabsContent value={activeTab} className="space-y-4">
          {/* Info del contexto */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getContextIcon(activeTab)}
                  <div>
                    <h3 className="font-semibold">
                      {activeTab === 'global' && 'Usuarios Globales'}
                      {activeTab === 'store' && 'Usuarios de Tienda'} 
                      {activeTab === 'tenant' && 'Usuarios Operacionales'}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {activeTab !== 'global' && !selectedStoreId 
                        ? 'Selecciona una tienda para ver usuarios' 
                        : `Fuente: ${usersResponse?.metadata.source || 'N/A'}`}
                    </p>
                  </div>
                </div>
                <Badge variant="outline">
                  {usersResponse?.pagination.total || 0} usuarios
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Lista de usuarios */}
          {activeTab !== 'global' && !selectedStoreId ? (
            <Card>
              <CardContent className="py-12">
                <div className="text-center text-muted-foreground">
                  <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-semibold mb-2">Selecciona una tienda</h3>
                  <p>Elige una tienda del selector para ver sus usuarios</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Usuarios ({users.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : users.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No se encontraron usuarios
                  </div>
                ) : (
                  <div className="space-y-4">
                    {users.map((user) => (
                      <div key={`${user.level}-${user.id}`} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <div>
                              <h3 className="font-semibold flex items-center gap-2">
                                {user.name}
                                <Badge className={getContextColor(user.level)}>
                                  {user.level}
                                </Badge>
                              </h3>
                              <p className="text-sm text-muted-foreground">
                                @{user.username} • {user.email}
                              </p>
                              {user.storeName && (
                                <p className="text-sm text-muted-foreground">
                                  <Building2 className="h-3 w-3 inline mr-1" />
                                  {user.storeName}
                                </p>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex space-x-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleResetPassword(user)}
                              disabled={resetPasswordMutation.isPending}
                            >
                              <Key className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDeleteUser(user)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        
                        <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Rol:</span>
                            <div className="font-medium">{user.role}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Estado:</span>
                            <Badge variant={user.status === 'active' ? 'default' : 'secondary'}>
                              {user.status}
                            </Badge>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Creado:</span>
                            <div className="font-medium">
                              {new Date(user.createdAt).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialog de credenciales */}
      <Dialog open={isCredentialsDialogOpen} onOpenChange={setIsCredentialsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Credenciales de Acceso</DialogTitle>
            <DialogDescription>
              Credenciales generadas para el usuario
            </DialogDescription>
          </DialogHeader>
          {userCredentials && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-800 mb-3">Información del Usuario</h3>
                <div className="space-y-2">
                  <div><strong>Nombre:</strong> {userCredentials.name}</div>
                  <div><strong>Email:</strong> {userCredentials.email}</div>
                  {userCredentials.storeName && (
                    <div><strong>Tienda:</strong> {userCredentials.storeName}</div>
                  )}
                </div>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h3 className="font-semibold text-green-800 mb-3">Credenciales de Acceso</h3>
                <div className="space-y-2">
                  <div>
                    <strong>Usuario:</strong>
                    <div className="font-mono bg-white border rounded px-3 py-2 text-sm mt-1">
                      {userCredentials.username}
                    </div>
                  </div>
                  <div>
                    <strong>Contraseña Temporal:</strong>
                    <div className="font-mono bg-white border rounded px-3 py-2 text-sm mt-1">
                      {userCredentials.tempPassword}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `Usuario: ${userCredentials.username}\nContraseña: ${userCredentials.tempPassword}`
                    );
                    toast({ title: "Credenciales copiadas al portapapeles" });
                  }}
                >
                  Copiar Credenciales
                </Button>
                <Button onClick={() => setIsCredentialsDialogOpen(false)}>
                  Cerrar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmación de eliminación */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Eliminación</DialogTitle>
            <DialogDescription>
              ¿Eliminar este usuario? Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <div className="py-4">
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="font-semibold">{selectedUser.name}</p>
                <p className="text-sm text-muted-foreground">
                  {selectedUser.email} • Contexto: {selectedUser.level}
                </p>
              </div>
            </div>
          )}
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              variant="destructive" 
              onClick={confirmDeleteUser}
              disabled={deleteUserMutation.isPending}
            >
              {deleteUserMutation.isPending ? "Eliminando..." : "Eliminar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}