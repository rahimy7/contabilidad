import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  UserPlus,
  Tag,
  TrendingUp,
  Award,
  Settings,
  Search,
  Filter,
  Download,
  Phone,
  Mail,
  MapPin,
  Calendar,
  DollarSign,
  Star,
  Edit,
  Trash2,
  Plus,
  Link2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const getAuthToken = () => {
  return localStorage.getItem('auth_token') || localStorage.getItem('token') || '';
};

type CustomerType = {
  id: number;
  name: string;
  description?: string;
  discountPercentage: string;
  color: string;
  isActive: boolean;
};

type Customer = {
  id: number;
  name: string;
  phone: string;
  email: string;
  address?: string;
  category: string;
  customerTypeId?: number;
  parentCustomerId?: number;
  totalOrders: number;
  totalSpent: string;
  isVip: boolean;
  isActive: boolean;
  registrationDate: string;
  lastContact?: string;
  customerType?: {
    id: number;
    name: string;
    discountPercentage: string;
    color: string;
  };
  parentCustomer?: {
    id: number;
    name: string;
  };
  loyaltyBalance?: {
    currentBalance: string;
    totalPointsEarned: string;
    pointsPropertyName?: string;
  };
};

type CustomerStats = {
  totalCustomers: number;
  activeCustomers: number;
  vipCustomers: number;
  categoryDistribution: Array<{ category: string; count: number }>;
  typeDistribution: Array<{ typeId?: number; typeName?: string; count: number }>;
};

export default function CustomerManagement() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showCustomerTypeDialog, setShowCustomerTypeDialog] = useState(false);
  const [showCustomerDialog, setShowCustomerDialog] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [newCustomerType, setNewCustomerType] = useState({
    name: '',
    description: '',
    discountPercentage: '0',
    color: '#3b82f6',
  });

  const [customerFormData, setCustomerFormData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    category: 'regular',
    customerTypeId: undefined as number | undefined,
    parentCustomerId: undefined as number | undefined,
    isVip: false,
    isActive: true,
  });

  const [parentSearchQuery, setParentSearchQuery] = useState('');
  const [parentSearchResults, setParentSearchResults] = useState<Customer[]>([]);
  const [selectedParent, setSelectedParent] = useState<{ id: number; name: string } | null>(null);
  const [showParentDropdown, setShowParentDropdown] = useState(false);
  const parentSearchRef = useRef<HTMLDivElement>(null);

  // Fetch customer stats
  const { data: stats } = useQuery<CustomerStats>({
    queryKey: ['customer-stats'],
    queryFn: async () => {
      const token = getAuthToken();
      const response = await fetch('/api/customers-stats', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch customer stats');
      return response.json();
    },
  });

  // Fetch customers
  const { data: customers = [], isLoading } = useQuery<Customer[]>({
    queryKey: ['customers'],
    queryFn: async () => {
      const token = getAuthToken();
      const response = await fetch('/api/customers', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch customers');
      const data = await response.json();
      console.log('🔍 Customers data received:', data);
      console.log('🔍 First customer loyaltyBalance:', data[0]?.loyaltyBalance);
      return data;
    },
  });

  // Fetch customer types
  const { data: customerTypes = [] } = useQuery<CustomerType[]>({
    queryKey: ['customer-types'],
    queryFn: async () => {
      const token = getAuthToken();
      const response = await fetch('/api/customer-types', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch customer types');
      return response.json();
    },
  });

  // Create customer type mutation
  const createCustomerTypeMutation = useMutation({
    mutationFn: async (data: typeof newCustomerType) => {
      const token = getAuthToken();
      const response = await fetch('/api/customer-types', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to create customer type');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-types'] });
      setShowCustomerTypeDialog(false);
      setNewCustomerType({ name: '', description: '', discountPercentage: '0', color: '#3b82f6' });
    },
  });

  // Create customer mutation
  const createCustomerMutation = useMutation({
    mutationFn: async (data: typeof customerFormData) => {
      const token = getAuthToken();
      const response = await fetch('/api/customers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to create customer');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customer-stats'] });
      setShowCustomerDialog(false);
      resetCustomerForm();
    },
  });

  // Update customer mutation
  const updateCustomerMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Customer> }) => {
      const token = getAuthToken();
      const response = await fetch(`/api/customers/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to update customer');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customer-stats'] });
      setShowCustomerDialog(false);
      resetCustomerForm();
    },
  });

  // Delete customer mutation
  const deleteCustomerMutation = useMutation({
    mutationFn: async (id: number) => {
      const token = getAuthToken();
      const response = await fetch(`/api/customers/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!response.ok) throw new Error('Failed to delete customer');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customer-stats'] });
    },
  });

  // Filter customers
  const filteredCustomers = customers.filter(customer => {
    const matchesSearch =
      (customer.name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
      (customer.phone || '').includes(searchQuery) ||
      (customer.email?.toLowerCase() || '').includes(searchQuery.toLowerCase());

    const matchesCategory = selectedCategory === 'all' || customer.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  const handleCreateCustomerType = () => {
    createCustomerTypeMutation.mutate(newCustomerType);
  };

  const resetCustomerForm = () => {
    setCustomerFormData({
      name: '',
      phone: '',
      email: '',
      address: '',
      category: 'regular',
      customerTypeId: undefined,
      parentCustomerId: undefined,
      isVip: false,
      isActive: true,
    });
    setSelectedCustomer(null);
    setSelectedParent(null);
    setParentSearchQuery('');
    setParentSearchResults([]);
    setShowParentDropdown(false);
  };

  const handleOpenNewCustomer = () => {
    resetCustomerForm();
    setShowCustomerDialog(true);
  };

  const handleOpenEditCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setCustomerFormData({
      name: customer.name,
      phone: customer.phone,
      email: customer.email || '',
      address: customer.address || '',
      category: customer.category,
      customerTypeId: customer.customerTypeId,
      parentCustomerId: customer.parentCustomerId,
      isVip: customer.isVip,
      isActive: customer.isActive,
    });

    // Si tiene padre, configurar el padre seleccionado
    if (customer.parentCustomerId && customer.parentCustomer) {
      setSelectedParent(customer.parentCustomer);
    } else {
      setSelectedParent(null);
    }

    setShowCustomerDialog(true);
  };

  const handleSaveCustomer = () => {
    if (selectedCustomer) {
      updateCustomerMutation.mutate({ id: selectedCustomer.id, data: customerFormData });
    } else {
      createCustomerMutation.mutate(customerFormData);
    }
  };

  const handleDeleteCustomer = (id: number) => {
    if (window.confirm('¿Estás seguro de que deseas eliminar este cliente?')) {
      deleteCustomerMutation.mutate(id);
    }
  };

  // Búsqueda de cliente padre con debounce
  useEffect(() => {
    const searchParentCustomer = async () => {
      if (parentSearchQuery.trim().length < 2) {
        setParentSearchResults([]);
        return;
      }

      try {
        const token = getAuthToken();
        const response = await fetch(`/api/customers/search?q=${encodeURIComponent(parentSearchQuery)}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });

        if (response.ok) {
          const results = await response.json();
          // Filtrar el cliente actual si estamos editando
          const filteredResults = selectedCustomer
            ? results.filter((c: Customer) => c.id !== selectedCustomer.id)
            : results;
          setParentSearchResults(filteredResults);
        }
      } catch (error) {
        console.error('Error searching customers:', error);
      }
    };

    const timeoutId = setTimeout(searchParentCustomer, 300);
    return () => clearTimeout(timeoutId);
  }, [parentSearchQuery, selectedCustomer]);

  // Cerrar dropdown al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (parentSearchRef.current && !parentSearchRef.current.contains(event.target as Node)) {
        setShowParentDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectParent = (customer: Customer) => {
    setSelectedParent(customer);
    setCustomerFormData({ ...customerFormData, parentCustomerId: customer.id });
    setParentSearchQuery('');
    setShowParentDropdown(false);
  };

  const handleClearParent = () => {
    setSelectedParent(null);
    setCustomerFormData({ ...customerFormData, parentCustomerId: undefined });
    setParentSearchQuery('');
  };

  const formatCurrency = (amount: string | number) => {
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP',
    }).format(parseFloat(amount.toString()));
  };

  const categoryColors: Record<string, string> = {
    regular: 'bg-blue-100 text-blue-800',
    vip: 'bg-purple-100 text-purple-800',
    wholesale: 'bg-green-100 text-green-800',
    reseller: 'bg-orange-100 text-orange-800',
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Gestión de Clientes</h1>
            <p className="text-gray-600 mt-1">Administra tus clientes, tipos y programas de lealtad</p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setShowCustomerTypeDialog(true)}
              className="flex items-center gap-2"
            >
              <Settings className="w-4 h-4" />
              Tipos de Clientes
            </Button>
            <Button className="flex items-center gap-2" onClick={handleOpenNewCustomer}>
              <UserPlus className="w-4 h-4" />
              Nuevo Cliente
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Clientes</p>
                  <p className="text-2xl font-bold">{stats?.totalCustomers || 0}</p>
                </div>
                <Users className="w-10 h-10 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Clientes Activos</p>
                  <p className="text-2xl font-bold">{stats?.activeCustomers || 0}</p>
                </div>
                <TrendingUp className="w-10 h-10 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Clientes VIP</p>
                  <p className="text-2xl font-bold">{stats?.vipCustomers || 0}</p>
                </div>
                <Star className="w-10 h-10 text-purple-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Tipos Definidos</p>
                  <p className="text-2xl font-bold">{customerTypes.length}</p>
                </div>
                <Tag className="w-10 h-10 text-orange-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Search */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input
                  placeholder="Buscar por nombre, teléfono o email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant={selectedCategory === 'all' ? 'default' : 'outline'}
                  onClick={() => setSelectedCategory('all')}
                >
                  Todos
                </Button>
                <Button
                  variant={selectedCategory === 'regular' ? 'default' : 'outline'}
                  onClick={() => setSelectedCategory('regular')}
                >
                  Regular
                </Button>
                <Button
                  variant={selectedCategory === 'vip' ? 'default' : 'outline'}
                  onClick={() => setSelectedCategory('vip')}
                >
                  VIP
                </Button>
                <Button
                  variant={selectedCategory === 'wholesale' ? 'default' : 'outline'}
                  onClick={() => setSelectedCategory('wholesale')}
                >
                  Mayorista
                </Button>
                <Button
                  variant={selectedCategory === 'reseller' ? 'default' : 'outline'}
                  onClick={() => setSelectedCategory('reseller')}
                >
                  Revendedor
                </Button>
              </div>
              <Button variant="outline">
                <Download className="w-4 h-4 mr-2" />
                Exportar
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Customers Table */}
        <Card>
          <CardHeader>
            <CardTitle>Lista de Clientes</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">
                <p className="text-gray-500">Cargando clientes...</p>
              </div>
            ) : filteredCustomers.length === 0 ? (
              <div className="text-center py-8">
                <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">No se encontraron clientes</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Cliente</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Contacto</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Tipo</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Categoría</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Órdenes</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Total Gastado</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Puntos</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Crédito</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Estado</th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredCustomers.map((customer) => (
                      <tr key={customer.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white font-semibold">
                              {(customer.name || 'S').charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{customer.name || 'Sin nombre'}</p>
                              <div className="flex gap-1 mt-1">
                                {customer.isVip && (
                                  <Badge className="bg-purple-100 text-purple-800 text-xs">
                                    <Star className="w-3 h-3 mr-1" />
                                    VIP
                                  </Badge>
                                )}
                                {customer.parentCustomerId && customer.parentCustomer && (
                                  <Badge className="bg-blue-100 text-blue-800 text-xs">
                                    <Link2 className="w-3 h-3 mr-1" />
                                    Vinculado a: {customer.parentCustomer.name}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                              <Phone className="w-4 h-4" />
                              {customer.phone || 'N/A'}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                              <Mail className="w-4 h-4" />
                              {customer.email || 'N/A'}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {customer.customerType && customer.customerType.name ? (
                            <Badge
                              style={{ backgroundColor: (customer.customerType.color || '#3b82f6') + '20', color: customer.customerType.color || '#3b82f6' }}
                            >
                              {customer.customerType.name}
                              {customer.customerType.discountPercentage && parseFloat(customer.customerType.discountPercentage) > 0 && (
                                <span className="ml-1 font-bold">
                                  (-{customer.customerType.discountPercentage}%)
                                </span>
                              )}
                            </Badge>
                          ) : (
                            <span className="text-gray-400 text-sm">Sin tipo</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={categoryColors[customer.category] || 'bg-gray-100 text-gray-800'}>
                            {customer.category}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">{customer.totalOrders || 0}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                          {formatCurrency(customer.totalSpent || '0')}
                        </td>
                        <td className="px-4 py-3">
                          {customer.loyaltyBalance && customer.loyaltyBalance.currentBalance !== null && customer.loyaltyBalance.currentBalance !== undefined ? (
                            <div className="flex items-center gap-1 text-sm">
                              <Award className={parseFloat(customer.loyaltyBalance.currentBalance) > 0 ? "w-4 h-4 text-amber-500" : "w-4 h-4 text-gray-400"} />
                              <span className={parseFloat(customer.loyaltyBalance.currentBalance) > 0 ? "font-semibold text-amber-700" : "text-gray-600"}>
                                {parseFloat(customer.loyaltyBalance.currentBalance).toFixed(2)} {customer.loyaltyBalance.pointsPropertyName || 'pts'}
                              </span>
                            </div>
                          ) : (
                            <span className="text-gray-400 text-sm">Sin datos</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {customer.creditBalance && parseFloat(customer.creditBalance) > 0 ? (
                            <span className="text-sm font-semibold text-red-600">
                              RD$ {parseFloat(customer.creditBalance).toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-sm">Sin deuda</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={customer.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                            {customer.isActive ? 'Activo' : 'Inactivo'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenEditCustomer(customer)}
                              title="Editar cliente"
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteCustomer(customer.id)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              title="Eliminar cliente"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create Customer Type Dialog */}
      <Dialog open={showCustomerTypeDialog} onOpenChange={setShowCustomerTypeDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Crear Tipo de Cliente</DialogTitle>
            <DialogDescription>
              Define un nuevo tipo de cliente con descuentos personalizados
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nombre</label>
              <Input
                placeholder="Ej: Mayorista"
                value={newCustomerType.name}
                onChange={(e) => setNewCustomerType({ ...newCustomerType, name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Descripción</label>
              <Input
                placeholder="Descripción opcional"
                value={newCustomerType.description}
                onChange={(e) => setNewCustomerType({ ...newCustomerType, description: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Descuento (%)</label>
              <Input
                type="number"
                min="0"
                max="100"
                placeholder="0"
                value={newCustomerType.discountPercentage}
                onChange={(e) => setNewCustomerType({ ...newCustomerType, discountPercentage: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Color</label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={newCustomerType.color}
                  onChange={(e) => setNewCustomerType({ ...newCustomerType, color: e.target.value })}
                  className="w-20 h-10"
                />
                <Input
                  value={newCustomerType.color}
                  onChange={(e) => setNewCustomerType({ ...newCustomerType, color: e.target.value })}
                  placeholder="#3b82f6"
                />
              </div>
            </div>
            <Button
              onClick={handleCreateCustomerType}
              disabled={!newCustomerType.name || createCustomerTypeMutation.isPending}
              className="w-full"
            >
              {createCustomerTypeMutation.isPending ? 'Creando...' : 'Crear Tipo de Cliente'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Customer Dialog */}
      <Dialog open={showCustomerDialog} onOpenChange={(open) => {
        setShowCustomerDialog(open);
        if (!open) resetCustomerForm();
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedCustomer ? 'Editar Cliente' : 'Nuevo Cliente'}</DialogTitle>
            <DialogDescription>
              {selectedCustomer ? 'Actualiza la información del cliente' : 'Registra un nuevo cliente en el sistema'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-sm font-medium">Nombre completo *</label>
              <Input
                placeholder="Ej: Juan Pérez"
                value={customerFormData.name}
                onChange={(e) => setCustomerFormData({ ...customerFormData, name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Teléfono *</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="(809) 123-4567"
                  value={customerFormData.phone}
                  onChange={(e) => setCustomerFormData({ ...customerFormData, phone: e.target.value })}
                  className="pl-10"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  type="email"
                  placeholder="cliente@ejemplo.com"
                  value={customerFormData.email}
                  onChange={(e) => setCustomerFormData({ ...customerFormData, email: e.target.value })}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium">Dirección</label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Calle, número, sector"
                  value={customerFormData.address}
                  onChange={(e) => setCustomerFormData({ ...customerFormData, address: e.target.value })}
                  className="pl-10"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Categoría</label>
              <select
                value={customerFormData.category}
                onChange={(e) => setCustomerFormData({ ...customerFormData, category: e.target.value })}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="regular">Regular</option>
                <option value="vip">VIP</option>
                <option value="wholesale">Mayorista</option>
                <option value="reseller">Revendedor</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Tipo de Cliente</label>
              <select
                value={customerFormData.customerTypeId || ''}
                onChange={(e) => setCustomerFormData({
                  ...customerFormData,
                  customerTypeId: e.target.value ? parseInt(e.target.value) : undefined
                })}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="">Sin tipo específico</option>
                {customerTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name} {type.discountPercentage && parseFloat(type.discountPercentage) > 0 ? `(-${type.discountPercentage}%)` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium">Cliente Padre (Opcional)</label>

              {selectedParent ? (
                <div className="flex items-center gap-2 p-3 border rounded-md bg-blue-50">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Link2 className="w-4 h-4 text-blue-600" />
                      <span className="font-medium text-blue-900">{selectedParent.name}</span>
                    </div>
                    <p className="text-xs text-blue-600 mt-1">Cliente padre seleccionado</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleClearParent}
                    className="p-1 hover:bg-blue-100 rounded-full transition-colors"
                    title="Eliminar cliente padre"
                  >
                    <X className="w-4 h-4 text-blue-600" />
                  </button>
                </div>
              ) : (
                <div className="relative" ref={parentSearchRef}>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      placeholder="Buscar por nombre o teléfono..."
                      value={parentSearchQuery}
                      onChange={(e) => {
                        setParentSearchQuery(e.target.value);
                        setShowParentDropdown(true);
                      }}
                      onFocus={() => setShowParentDropdown(true)}
                      className="pl-10"
                    />
                  </div>

                  {showParentDropdown && parentSearchResults.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-y-auto">
                      {parentSearchResults.map((customer) => (
                        <button
                          key={customer.id}
                          type="button"
                          onClick={() => handleSelectParent(customer)}
                          className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center gap-3 border-b last:border-b-0"
                        >
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-sm font-semibold">
                            {customer.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1">
                            <p className="font-medium text-gray-900">{customer.name}</p>
                            <p className="text-xs text-gray-500">{customer.phone}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {showParentDropdown && parentSearchQuery.length >= 2 && parentSearchResults.length === 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border rounded-md shadow-lg p-4 text-center text-gray-500 text-sm">
                      No se encontraron clientes
                    </div>
                  )}
                </div>
              )}

              <p className="text-xs text-gray-500 mt-1">
                Los puntos de lealtad ganados por este cliente se acumularán al cliente padre seleccionado
              </p>
            </div>
            <div className="col-span-2 flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={customerFormData.isVip}
                  onChange={(e) => setCustomerFormData({ ...customerFormData, isVip: e.target.checked })}
                  className="w-4 h-4"
                />
                <Star className="w-4 h-4 text-purple-500" />
                <span className="text-sm font-medium">Cliente VIP</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={customerFormData.isActive}
                  onChange={(e) => setCustomerFormData({ ...customerFormData, isActive: e.target.checked })}
                  className="w-4 h-4"
                />
                <span className="text-sm font-medium">Cliente Activo</span>
              </label>
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <Button
              variant="outline"
              onClick={() => {
                setShowCustomerDialog(false);
                resetCustomerForm();
              }}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSaveCustomer}
              disabled={!customerFormData.name || !customerFormData.phone || createCustomerMutation.isPending || updateCustomerMutation.isPending}
              className="flex-1"
            >
              {createCustomerMutation.isPending || updateCustomerMutation.isPending
                ? 'Guardando...'
                : selectedCustomer
                ? 'Actualizar Cliente'
                : 'Crear Cliente'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
