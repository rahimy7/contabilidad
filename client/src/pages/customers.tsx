import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Phone, MapPin, Calendar, DollarSign, Search, Star, History, Edit, Trash2, Users, TrendingUp } from "lucide-react";
import { Customer, insertCustomerSchema } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

// Extender el tipo Customer con propiedades opcionales que podrían venir del backend
interface ExtendedCustomer extends Customer {
  status?: string;
  customerType?: string;
  lastOrderDate?: string | Date | null;
  email?: string;
}

// Form validation schema
const customerFormSchema = insertCustomerSchema.extend({
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
  phone: z.string().min(10, "El teléfono debe tener al menos 10 dígitos"),
});

type CustomerFormData = z.infer<typeof customerFormSchema>;

export default function CustomersPage() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<ExtendedCustomer | null>(null);
  const [customerToEdit, setCustomerToEdit] = useState<ExtendedCustomer | null>(null);
  const [customerToDelete, setCustomerToDelete] = useState<ExtendedCustomer | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<'all' | 'vip' | 'active' | 'recent'>('all');
  const { toast } = useToast();
  const { user } = useAuth();

  // Check if user is admin
  const isAdmin = user?.role === 'admin' || user?.role === 'store_admin';

  // Fetch customers - usando el endpoint existente
  const { data: customers = [], isLoading } = useQuery<ExtendedCustomer[]>({
    queryKey: ["/api/customers"],
  });

  // Procesar customers en el frontend para diferentes categorías
  const processedCustomers = useMemo(() => {
    if (!customers?.length) return {
      all: [],
      vip: [],
      active: [],
      recent: [],
      stats: {
        total: 0,
        vipCount: 0,
        recentCount: 0,
        activeCount: 0
      }
    };

    const now = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(now.getDate() - 30);
    const today = new Date().toDateString();

    const all = customers;
    
    // Filtrar VIP customers basado en diferentes criterios
    const vip = customers.filter((customer: ExtendedCustomer) => {
      return customer.status === 'vip' || 
             customer.isVip === true ||
             customer.customerType === 'vip' ||
             (customer.totalOrders && customer.totalOrders > 10) ||
             (customer.totalSpent && parseFloat(customer.totalSpent) > 5000);
    });

    // Customers activos (con actividad reciente)
    const active = customers.filter((customer: ExtendedCustomer) => {
      const lastActivity = customer.lastOrderDate || customer.updatedAt;
      if (!lastActivity) return false;
      const dateToCompare = lastActivity instanceof Date ? lastActivity : new Date(lastActivity);
      return dateToCompare > thirtyDaysAgo;
    });

    // Customers registrados hoy
    const recent = customers.filter((customer: ExtendedCustomer) => {
      const regDate = customer.registrationDate || customer.createdAt;
      if (!regDate) return false;
      const dateToCompare = regDate instanceof Date ? regDate : new Date(regDate);
      return dateToCompare.toDateString() === today;
    });

    return {
      all,
      vip,
      active,
      recent,
      stats: {
        total: all.length,
        vipCount: vip.length,
        recentCount: recent.length,
        activeCount: active.length
      }
    };
  }, [customers]);

  // Filtrar customers según el tipo seleccionado
  const currentCustomers = useMemo(() => {
    let baseCustomers = processedCustomers.all;
    
    switch (filterType) {
      case 'vip':
        baseCustomers = processedCustomers.vip;
        break;
      case 'active':
        baseCustomers = processedCustomers.active;
        break;
      case 'recent':
        baseCustomers = processedCustomers.recent;
        break;
      default:
        baseCustomers = processedCustomers.all;
    }

    // Aplicar filtro de búsqueda
    if (searchTerm) {
      return baseCustomers.filter((customer: ExtendedCustomer) =>
        customer.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        customer.phone?.includes(searchTerm) ||
        customer.email?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    return baseCustomers;
  }, [processedCustomers, filterType, searchTerm]);

  // Fetch customer details - usando endpoint existente con ID
  const { data: customerDetails } = useQuery({
    queryKey: ["/api/customers", selectedCustomer?.id],
    queryFn: async () => {
      if (!selectedCustomer?.id) return null;
      try {
        // Intentar obtener detalles extendidos si existe el endpoint
        const response = await fetch(`/api/customers/${selectedCustomer.id}/details`);
        if (response.ok) {
          return response.json();
        }
        // Fallback: usar los datos básicos del customer
        return {
          ...selectedCustomer,
          totalOrders: selectedCustomer.totalOrders || 0,
          totalSpent: selectedCustomer.totalSpent || 0,
          history: []
        };
      } catch (error) {
        console.warn('Error fetching customer details, using basic data:', error);
        return {
          ...selectedCustomer,
          totalOrders: selectedCustomer.totalOrders || 0,
          totalSpent: selectedCustomer.totalSpent || 0,
          history: []
        };
      }
    },
    enabled: !!selectedCustomer?.id,
  });

  // Create customer mutation
  const createCustomerMutation = useMutation({
    mutationFn: async (data: CustomerFormData) => {
      return apiRequest("POST", "/api/customers", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      setShowCreateDialog(false);
      form.reset();
      toast({
        title: "Cliente creado",
        description: "El cliente ha sido registrado exitosamente",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo crear el cliente",
        variant: "destructive",
      });
    },
  });

  // Edit customer mutation
  const editCustomerMutation = useMutation({
    mutationFn: async (data: CustomerFormData & { id: number }) => {
      return apiRequest("PUT", `/api/customers/${data.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      setShowEditDialog(false);
      setCustomerToEdit(null);
      editForm.reset();
      toast({
        title: "Cliente actualizado",
        description: "Los datos del cliente han sido actualizados exitosamente",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo actualizar el cliente",
        variant: "destructive",
      });
    },
  });

  // Delete customer mutation
  const deleteCustomerMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/customers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      setShowDeleteDialog(false);
      setCustomerToDelete(null);
      setSelectedCustomer(null);
      toast({
        title: "Cliente eliminado",
        description: "El cliente ha sido eliminado exitosamente",
      });
    },
    onError: (error: any) => {
      console.error('Error deleting customer:', error);
      toast({
        title: "Error al eliminar cliente",
        description: error.message || "No se pudo eliminar el cliente. Es posible que tenga pedidos o conversaciones asociadas.",
        variant: "destructive",
      });
    },
  });

  // Form setup for creating customers
  const form = useForm<CustomerFormData>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: {
      name: "",
      phone: "",
      address: "",
      notes: "",
    },
  });

  // Form setup for editing customers
  const editForm = useForm<CustomerFormData>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: {
      name: "",
      phone: "",
      address: "",
      notes: "",
    },
  });

  const onSubmit = (data: CustomerFormData) => {
    createCustomerMutation.mutate(data);
  };

  const onEditSubmit = (data: CustomerFormData) => {
    if (customerToEdit) {
      editCustomerMutation.mutate({ ...data, id: customerToEdit.id });
    }
  };

  const handleEditCustomer = (customer: ExtendedCustomer) => {
    setCustomerToEdit(customer);
    editForm.reset({
      name: customer.name || "",
      phone: customer.phone || "",
      address: customer.address || "",
      notes: customer.notes || "",
    });
    setShowEditDialog(true);
  };

  const handleDeleteCustomer = (customer: ExtendedCustomer) => {
    setCustomerToDelete(customer);
    setShowDeleteDialog(true);
  };

  const confirmDelete = () => {
    if (customerToDelete) {
      deleteCustomerMutation.mutate(customerToDelete.id);
    }
  };

  const formatDate = (date: string | Date | null | undefined) => {
    if (!date) return "No registrado";
    try {
      const dateToFormat = date instanceof Date ? date : new Date(date);
      return dateToFormat.toLocaleDateString("es-ES", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "Fecha inválida";
    }
  };

  const isVipCustomer = (customer: ExtendedCustomer) => {
    return customer.status === 'vip' || 
           customer.isVip === true ||
           customer.customerType === 'vip' ||
           (customer.totalOrders && customer.totalOrders > 10) ||
           (customer.totalSpent && parseFloat(customer.totalSpent) > 5000);
  };

  const getCustomerDisplayName = (customer: ExtendedCustomer) => {
    return customer.name || "Sin nombre";
  };

  const getCustomerDisplayPhone = (customer: ExtendedCustomer) => {
    return customer.phone || "Sin teléfono";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground mt-1">
            Gestiona la base de datos de clientes y su historial
          </p>
        </div>
        {isAdmin && (
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button className="bg-primary hover:bg-primary-hover">
                <Plus className="h-4 w-4 mr-2" />
                Nuevo Cliente
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Registrar Nuevo Cliente</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nombre completo</FormLabel>
                        <FormControl>
                          <Input placeholder="Juan Pérez" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Teléfono</FormLabel>
                        <FormControl>
                          <Input placeholder="+52 55 1234 5678" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Dirección (opcional)</FormLabel>
                        <FormControl>
                          <Input placeholder="Calle 123, Colonia, Ciudad" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notas (opcional)</FormLabel>
                        <FormControl>
                          <Input placeholder="Información adicional" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex justify-end space-x-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowCreateDialog(false)}
                      disabled={createCustomerMutation.isPending}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="submit"
                      disabled={createCustomerMutation.isPending}
                      className="bg-primary hover:bg-primary-hover"
                    >
                      {createCustomerMutation.isPending ? "Creando..." : "Crear Cliente"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Clientes</p>
                <p className="text-2xl font-bold text-foreground">{processedCustomers.stats.total}</p>
              </div>
              <div className="w-12 h-12 bg-accent rounded-lg flex items-center justify-center">
                <Users className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Clientes VIP</p>
                <p className="text-2xl font-bold text-warning">{processedCustomers.stats.vipCount}</p>
              </div>
              <div className="w-12 h-12 bg-warning/15 rounded-lg flex items-center justify-center">
                <Star className="h-6 w-6 text-warning" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Activos (30 días)</p>
                <p className="text-2xl font-bold text-success">{processedCustomers.stats.activeCount}</p>
              </div>
              <div className="w-12 h-12 bg-success/10 rounded-lg flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-success" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Registrados Hoy</p>
                <p className="text-2xl font-bold text-primary">{processedCustomers.stats.recentCount}</p>
              </div>
              <div className="w-12 h-12 bg-accent rounded-lg flex items-center justify-center">
                <Calendar className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Buscar clientes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 w-64"
          />
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={filterType === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterType('all')}
          >
            Todos ({processedCustomers.stats.total})
          </Button>
          <Button
            variant={filterType === 'vip' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterType('vip')}
          >
            VIP ({processedCustomers.stats.vipCount})
          </Button>
          <Button
            variant={filterType === 'active' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterType('active')}
          >
            Activos ({processedCustomers.stats.activeCount})
          </Button>
          <Button
            variant={filterType === 'recent' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterType('recent')}
          >
            Recientes ({processedCustomers.stats.recentCount})
          </Button>
        </div>
      </div>

      {/* Customers List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Customers Table */}
        <Card>
          <CardHeader>
            <CardTitle>
              Lista de Clientes 
              {filterType !== 'all' && (
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  ({currentCustomers.length} {filterType === 'vip' ? 'VIP' : filterType === 'active' ? 'activos' : 'recientes'})
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="animate-pulse">
                    <div className="h-4 bg-secondary rounded w-3/4 mb-2"></div>
                    <div className="h-3 bg-secondary rounded w-1/2"></div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {currentCustomers.map((customer: ExtendedCustomer) => (
                  <div
                    key={customer.id}
                    className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                      selectedCustomer?.id === customer.id
                        ? "border-primary bg-accent"
                        : "border-border hover:border-border"
                    }`}
                    onClick={() => setSelectedCustomer(customer)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <h3 className="font-medium text-foreground">{getCustomerDisplayName(customer)}</h3>
                          {isVipCustomer(customer) && (
                            <Badge className="bg-warning/15 text-warning border-warning/40">
                              ⭐ VIP
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center space-x-4 text-sm text-muted-foreground mt-1">
                          <span className="flex items-center">
                            <Phone className="h-3 w-3 mr-1" />
                            {getCustomerDisplayPhone(customer)}
                          </span>
                          {customer.totalOrders && customer.totalOrders > 0 && (
                            <span className="flex items-center">
                              <DollarSign className="h-3 w-3 mr-1" />
                              {customer.totalOrders} pedidos
                            </span>
                          )}
                        </div>
                      </div>
                      {isAdmin && (
                        <div className="flex items-center space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditCustomer(customer);
                            }}
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteCustomer(customer);
                            }}
                            className="text-destructive hover:text-destructive/80 hover:border-destructive/40"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {currentCustomers.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    {searchTerm ? "No se encontraron clientes que coincidan con la búsqueda" : "No hay clientes en esta categoría"}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Customer Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <History className="h-5 w-5 mr-2" />
              Detalles del Cliente
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selectedCustomer ? (
              <div className="space-y-6">
                {/* Customer Info */}
                <div>
                  <div className="flex items-center space-x-2 mb-3">
                    <h3 className="text-lg font-semibold">{getCustomerDisplayName(selectedCustomer)}</h3>
                    {isVipCustomer(selectedCustomer) && (
                      <Badge className="bg-warning/15 text-warning border-warning/40">
                        ⭐ VIP
                      </Badge>
                    )}
                  </div>
                  
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center">
                      <Phone className="h-4 w-4 mr-2 text-muted-foreground" />
                      <span>{getCustomerDisplayPhone(selectedCustomer)}</span>
                    </div>
                    
                    {selectedCustomer.address && (
                      <div className="flex items-center">
                        <MapPin className="h-4 w-4 mr-2 text-muted-foreground" />
                        <span>{selectedCustomer.address}</span>
                      </div>
                    )}
                    
                    <div className="flex items-center">
                      <Calendar className="h-4 w-4 mr-2 text-muted-foreground" />
                      <span>Registrado: {formatDate(selectedCustomer.registrationDate || selectedCustomer.createdAt)}</span>
                    </div>
                  </div>
                </div>

                {/* Statistics */}
                {customerDetails && ((customerDetails.totalOrders && customerDetails.totalOrders > 0) || (customerDetails.totalSpent && customerDetails.totalSpent > 0)) && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-accent p-3 rounded-lg">
                      <p className="text-sm text-primary font-medium">Total Pedidos</p>
                      <p className="text-xl font-bold text-accent-foreground">{customerDetails.totalOrders || 0}</p>
                    </div>
                    <div className="bg-success/10 p-3 rounded-lg">
                      <p className="text-sm text-success font-medium">Total Gastado</p>
                      <p className="text-xl font-bold text-success">${customerDetails.totalSpent || 0}</p>
                    </div>
                  </div>
                )}

                {/* Recent History */}
                {customerDetails?.history && Array.isArray(customerDetails.history) && customerDetails.history.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-3">Historial Reciente</h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {customerDetails.history.slice(0, 10).map((entry: any) => (
                        <div key={entry.id} className="flex items-center justify-between p-2 bg-subtle rounded">
                          <div>
                            <p className="text-sm font-medium">{entry.description}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatDate(entry.timestamp)}
                            </p>
                          </div>
                          {entry.amount && (
                            <Badge variant="outline" className="text-xs">
                              ${entry.amount}
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(!customerDetails || (!customerDetails.totalOrders && !customerDetails.history?.length)) && (
                  <div className="text-center py-8 text-muted-foreground">
                    <History className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p>Sin historial de pedidos</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Phone className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p>Selecciona un cliente para ver sus detalles</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Customer Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Cliente</DialogTitle>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre completo</FormLabel>
                    <FormControl>
                      <Input placeholder="Juan Pérez" {...field} />
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
                      <Input placeholder="+52 55 1234 5678" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dirección (opcional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Calle 123, Colonia, Ciudad" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notas (opcional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Información adicional del cliente" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowEditDialog(false)}
                  disabled={editCustomerMutation.isPending}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={editCustomerMutation.isPending}
                  className="bg-primary hover:bg-primary-hover"
                >
                  {editCustomerMutation.isPending ? "Actualizando..." : "Actualizar Cliente"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Customer Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar Cliente</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              ¿Estás seguro de que quieres eliminar a <strong>{getCustomerDisplayName(customerToDelete || {} as ExtendedCustomer)}</strong>?
              Esta acción no se puede deshacer.
            </p>
            
            <div className="bg-warning/15 border border-warning/40 rounded-lg p-3">
              <p className="text-sm text-warning">
                <strong>Advertencia:</strong> Se eliminarán automáticamente todos los datos relacionados:
              </p>
              <ul className="list-disc list-inside text-xs text-warning mt-2 space-y-1">
                <li>Historial del cliente</li>
                <li>Conversaciones de WhatsApp</li>
                <li>Mensajes intercambiados</li>
                <li>Pedidos realizados</li>
                <li>Historial de pedidos</li>
              </ul>
            </div>

            <div className="flex justify-end space-x-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowDeleteDialog(false)}
                disabled={deleteCustomerMutation.isPending}
              >
                Cancelar
              </Button>
              <Button
                onClick={confirmDelete}
                disabled={deleteCustomerMutation.isPending}
                className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              >
                {deleteCustomerMutation.isPending ? "Eliminando..." : "Eliminar Cliente"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}