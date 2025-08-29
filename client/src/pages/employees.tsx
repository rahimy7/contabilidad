import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { Plus, User, Users, Briefcase, Truck, Headphones, Shield, Search, Filter, Edit2, Trash2 } from "lucide-react";
import type { User as UserType, EmployeeProfile, InsertEmployeeProfile, InsertUser, CustomerRegistrationFlow } from "@shared/schema";
import { useAuth } from "@/contexts/AuthContext";



interface EmployeeUpdateData {
  position?: string;
  specializations?: string[]; // ← Array como espera la base de datos
  emergencyContact?: string | null;
  emergencyPhone?: string | null;
  vehicleInfo?: string | null;
  certifications?: string[]; // ← Array como espera la base de datos
  territory?: string | null;
  notes?: string | null;
  user?: {
    name?: string;
    username?: string;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    role?: "admin" | "technician" | "seller" | "delivery" | "support" | "customer_service";
    password?: string;
  };
}
// Validation schemas
const createEmployeeSchema = z.object({
  // User data
  username: z.string().min(3, "Usuario debe tener al menos 3 caracteres"),
  password: z.string().min(6, "Contraseña debe tener al menos 6 caracteres"),
  name: z.string().min(2, "Nombre es requerido"),
  role: z.enum(["admin", "technician", "seller", "delivery", "support", "customer_service"]),
  phone: z.string().optional(),
  email: z.string().email("Email inválido").optional(),
  address: z.string().optional(),
  
  // Employee profile data
  department: z.enum(["technical", "sales", "delivery", "support", "admin"]),
  position: z.string().min(2, "Posición es requerida"),
  specializations: z.string().optional(),
  emergencyContact: z.string().optional(),
  emergencyPhone: z.string().optional(),
  vehicleInfo: z.string().optional(),
  certifications: z.string().optional(),
  salary: z.string().optional(),
  commissionRate: z.string().optional(),
  territory: z.string().optional(),
  baseAddress: z.string().optional(),
  serviceRadius: z.string().optional(),
  maxDailyOrders: z.string().optional(),
  skillLevel: z.string().optional(),
  notes: z.string().optional(),
});

type CreateEmployeeForm = z.infer<typeof createEmployeeSchema>;

// Edit schema with optional password
const editEmployeeSchema = createEmployeeSchema.extend({
  password: z.string().optional(), // Make password optional for editing
});

type EditEmployeeForm = z.infer<typeof editEmployeeSchema>;

interface EmployeeWithUser extends EmployeeProfile {
  user: UserType;
}

const roleColors = {
  admin: "bg-red-100 text-red-800",
  technician: "bg-blue-100 text-blue-800", 
  seller: "bg-green-100 text-green-800",
  delivery: "bg-yellow-100 text-yellow-800",
  support: "bg-purple-100 text-purple-800",
  customer_service: "bg-pink-100 text-pink-800",
};

const departmentIcons = {
  technical: Briefcase,
  sales: Users,
  delivery: Truck,
  support: Headphones,
  admin: Shield,
};

const roleLabels = {
  admin: "Administrador",
  technician: "Técnico",
  seller: "Vendedor", 
  delivery: "Delivery",
  support: "Soporte",
  customer_service: "Atención al Cliente",
};

const departmentLabels = {
  technical: "Técnico",
  sales: "Ventas",
  delivery: "Delivery",
  support: "Soporte",
  admin: "Administración",
};

export default function Employees() {
  const { toast } = useToast();
  const { user } = useAuth(); 
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDepartment, setFilterDepartment] = useState("all");
  const [filterRole, setFilterRole] = useState("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<EmployeeWithUser | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [employeeToDelete, setEmployeeToDelete] = useState<EmployeeWithUser | null>(null);

  // Fetch employees
 const { data: employees = [], isLoading } = useQuery<EmployeeWithUser[]>({
  queryKey: ["/api/employees"], // ← Usar el endpoint real
});

  // Fetch registration flows
  const { data: registrationFlows = [] } = useQuery<CustomerRegistrationFlow[]>({
    queryKey: ["/api/registration-flows"],
  });

// Create employee mutation - CORREGIDO


     const createEmployeeMutation = useMutation({
  mutationFn: async (employeeData: CreateEmployeeForm) => {
    // 1. Crear usuario en schema de tienda
    const userData = {
      username: employeeData.username,
      password: employeeData.password,
      name: employeeData.name,
      role: employeeData.role,
      email: employeeData.email || null,
      phone: employeeData.phone || null,
      status: 'active',
      isActive: true
    };

    // ✅ USAR NUEVO ENDPOINT PARA USUARIOS DE TIENDA
    const newUser = await apiRequest("POST", "/api/tenant-users", userData) as { id: number };

    // 2. Generar ID de empleado
    const { employeeId } = await apiRequest("POST", "/api/employees/generate-id", { 
      department: employeeData.department 
    }) as { employeeId: string };

    // 3. Crear perfil de empleado
    const profileData = {
      userId: newUser.id,
      employeeId,
      department: employeeData.department,
      position: employeeData.position,
      specializations: employeeData.specializations ? 
        employeeData.specializations.split(',').map(s => s.trim()) : [],
      emergencyContact: employeeData.emergencyContact || null,
      emergencyPhone: employeeData.emergencyPhone || null,
      vehicleInfo: employeeData.vehicleInfo || null,
      certifications: employeeData.certifications ? 
        employeeData.certifications.split(',').map(s => s.trim()) : [],
      territory: employeeData.territory || null,
      notes: employeeData.notes || null,
    };

    return apiRequest("POST", "/api/employees", profileData);
  },
    
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
    setIsCreateDialogOpen(false);
    toast({
      title: "Empleado creado",
      description: "El empleado ha sido creado exitosamente.",
    });
  },
  onError: (error: Error) => {
    console.error('❌ Employee creation failed:', error);
    toast({
      title: "Error",
      description: error.message,
      variant: "destructive",
    });
  },
});

// Update employee mutation - CORREGIDO
const updateEmployeeMutation = useMutation({
  mutationFn: async (data: { employeeId: number; updates: EmployeeUpdateData }) => {
    const { updates } = data;
    
    // ✅ ACTUALIZAR USUARIO EN TENANT SCHEMA
    if (updates.user && (updates.user.name || updates.user.username || updates.user.role || updates.user.password)) {
      const employee = employees.find(emp => emp.id === data.employeeId);
      if (employee?.userId) {
        await apiRequest("PUT", `/api/users/${employee.userId}`, updates.user);
      }
    }
    
    // ✅ ACTUALIZAR PERFIL DE EMPLEADO
    const employeeUpdates = { ...updates };
    delete employeeUpdates.user;
    
    return apiRequest("PUT", `/api/employees/${data.employeeId}`, employeeUpdates);
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
    setIsEditDialogOpen(false);
    setEditingEmployee(null);
    toast({
      title: "Empleado actualizado",
      description: "Los datos del empleado se han actualizado correctamente.",
    });
  },
  onError: (error: Error) => {
    toast({
      title: "Error",
      description: error.message,
      variant: "destructive",
    });
  },
});

// Delete employee mutation - CORREGIDO
const deleteEmployeeMutation = useMutation({
  mutationFn: async (employeeId: number) => {
    // ✅ SOLO UNA LLAMADA - El endpoint ya elimina usuario y perfil
    return apiRequest("DELETE", `/api/employees/${employeeId}`);
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
    toast({
      title: "Empleado eliminado",
      description: "El empleado ha sido eliminado exitosamente.",
    });
  },
  onError: (error: Error) => {
    toast({
      title: "Error",
      description: error.message,
      variant: "destructive",
    });
  },
});

  const form = useForm<CreateEmployeeForm>({
    resolver: zodResolver(createEmployeeSchema),
    defaultValues: {
      role: "technician",
      department: "technical",
    },
  });

  const onSubmit = (data: CreateEmployeeForm) => {
    createEmployeeMutation.mutate(data);
  };

  // Edit form
  const editForm = useForm<EditEmployeeForm>({
    resolver: zodResolver(editEmployeeSchema),
  });

  const onEditSubmit = (data: EditEmployeeForm) => {
  if (!editingEmployee) return;
  
  const updates: EmployeeUpdateData = {
    position: data.position,
    specializations: data.specializations ? 
      data.specializations.split(',').map(s => s.trim()) : [],
    emergencyContact: data.emergencyContact || null,
    emergencyPhone: data.emergencyPhone || null,
    vehicleInfo: data.vehicleInfo || null,
    certifications: data.certifications ? 
      data.certifications.split(',').map(s => s.trim()) : [],
    territory: data.territory || null,
    notes: data.notes || null,
    user: {
      name: data.name,
      username: data.username,
      phone: data.phone || null,
      email: data.email || null,
      address: data.address || null,
      role: data.role,
      ...(data.password && { password: data.password }),
    }
  };

  updateEmployeeMutation.mutate({
    employeeId: editingEmployee.id,
    updates
  });
};

  const openEditModal = (employee: EmployeeWithUser) => {
    setEditingEmployee(employee);
    editForm.reset({
      name: employee.user?.name || "",
      username: employee.user?.username || "",
      password: "", // Don't populate password for security
      role: (employee.user?.role || "technician") as "admin" | "technician" | "seller" | "delivery" | "support" | "customer_service",
      phone: employee.user?.phone || "",
      email: employee.user?.email || "",
      address: employee.user?.address || "",
      department: employee.department as "admin" | "delivery" | "support" | "technical" | "sales", // ✅ Type assertion
      position: employee.position,
      specializations: employee.specializations?.join(', ') || "",
      emergencyContact: employee.emergencyContact || "",
      emergencyPhone: employee.emergencyPhone || "",
      vehicleInfo: employee.vehicleInfo || "",
      certifications: employee.certifications?.join(', ') || "",
      territory: employee.territory || "",
      baseAddress: employee.baseAddress || "",
      serviceRadius: employee.serviceRadius?.toString() || "",
      maxDailyOrders: employee.maxDailyOrders?.toString() || "",
      skillLevel: employee.skillLevel?.toString() || "",
      notes: employee.notes || "",
    });
    setIsEditDialogOpen(true);
  };

  const openDeleteModal = (employee: EmployeeWithUser) => {
    setEmployeeToDelete(employee);
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (employeeToDelete) {
      deleteEmployeeMutation.mutate(employeeToDelete.id);
      setIsDeleteDialogOpen(false);
      setEmployeeToDelete(null);
    }
  };

  // Filter employees
  const filteredEmployees = employees.filter(employee => {
    // Defensive check to ensure user exists
    if (!employee.user) return false;
    
    const matchesSearch = employee.user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         employee.employeeId.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         employee.position.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesDepartment = filterDepartment === "all" || employee.department === filterDepartment;
    const matchesRole = filterRole === "all" || employee.user.role === filterRole;
    
    return matchesSearch && matchesDepartment && matchesRole;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Gestión de Empleados</h1>
          <p className="text-muted-foreground">Administra técnicos, delivery, soporte y demás personal</p>
        </div>
        
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Nuevo Empleado
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Crear Nuevo Empleado</DialogTitle>
              <DialogDescription>
                Completa la información del empleado para registrarlo en el sistema.
              </DialogDescription>
            </DialogHeader>
            
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nombre Completo</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Juan Pérez" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Usuario</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="jperez" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contraseña</FormLabel>
                        <FormControl>
                          <Input {...field} type="password" placeholder="••••••••" />
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
                          <Input {...field} placeholder="+52 55 1234 5678" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input {...field} type="email" placeholder="juan@empresa.com" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Rol</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar rol" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="admin">Administrador</SelectItem>
                            <SelectItem value="technician">Técnico</SelectItem>
                            <SelectItem value="seller">Vendedor</SelectItem>
                            <SelectItem value="delivery">Delivery</SelectItem>
                            <SelectItem value="support">Soporte</SelectItem>
                            <SelectItem value="customer_service">Atención al Cliente</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="department"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Departamento</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar departamento" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="admin">Administración</SelectItem>
                            <SelectItem value="technical">Técnico</SelectItem>
                            <SelectItem value="sales">Ventas</SelectItem>
                            <SelectItem value="delivery">Delivery</SelectItem>
                            <SelectItem value="support">Soporte</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="position"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Posición</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Técnico Senior, Repartidor, etc." />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="specializations"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Especializaciones (separadas por comas)</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Aires acondicionados, Refrigeración, Electricidad" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="emergencyContact"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contacto de Emergencia</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="María Pérez" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="emergencyPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Teléfono de Emergencia</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="+52 55 8765 4321" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notas</FormLabel>
                      <FormControl>
                        <Textarea {...field} placeholder="Notas adicionales sobre el empleado..." />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsCreateDialogOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={createEmployeeMutation.isPending}>
                    {createEmployeeMutation.isPending ? "Creando..." : "Crear Empleado"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Buscar empleados..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        
        <Select value={filterDepartment} onValueChange={setFilterDepartment}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filtrar por departamento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los departamentos</SelectItem>
            <SelectItem value="admin">Administración</SelectItem>
            <SelectItem value="technical">Técnico</SelectItem>
            <SelectItem value="sales">Ventas</SelectItem>
            <SelectItem value="delivery">Delivery</SelectItem>
            <SelectItem value="support">Soporte</SelectItem>
          </SelectContent>
        </Select>
        
        <Select value={filterRole} onValueChange={setFilterRole}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filtrar por rol" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los roles</SelectItem>
            <SelectItem value="admin">Administrador</SelectItem>
            <SelectItem value="technician">Técnico</SelectItem>
            <SelectItem value="seller">Vendedor</SelectItem>
            <SelectItem value="delivery">Delivery</SelectItem>
            <SelectItem value="support">Soporte</SelectItem>
            <SelectItem value="customer_service">Atención al Cliente</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Employee Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredEmployees.map((employee) => {
          const DepartmentIcon = departmentIcons[employee.department as keyof typeof departmentIcons];
          
          return (
            <Card key={employee.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                      <DepartmentIcon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{employee.user?.name || "Sin nombre"}</CardTitle>
                      <CardDescription>{employee.position}</CardDescription>
                    </div>
                  </div>
                  <Badge variant="secondary" className={roleColors[employee.user?.role as keyof typeof roleColors] || "bg-gray-100 text-gray-800"}>
                    {roleLabels[employee.user?.role as keyof typeof roleLabels] || "Sin rol"}
                  </Badge>
                </div>
              </CardHeader>
              
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">ID Empleado:</span>
                    <span className="font-mono">{employee.employeeId}</span>
                  </div>
                  
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Departamento:</span>
                    <span>{departmentLabels[employee.department as keyof typeof departmentLabels]}</span>
                  </div>
                  
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Estado:</span>
                    <Badge variant={employee.user?.status === "active" ? "default" : "secondary"}>
                      {employee.user?.status === "active" ? "Activo" : employee.user?.status || "Sin estado"}
                    </Badge>
                  </div>
                  
                  {employee.user?.phone && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Teléfono:</span>
                      <span>{employee.user.phone}</span>
                    </div>
                  )}
                  
                  {employee.specializations && employee.specializations.length > 0 && (
                    <div className="pt-2">
                      <div className="text-sm text-muted-foreground mb-1">Especializaciones:</div>
                      <div className="flex flex-wrap gap-1">
                        {employee.specializations.map((spec, index) => (
                          <Badge key={index} variant="outline" className="text-xs">
                            {spec}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <div className="pt-4 border-t mt-4 space-y-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full"
                      onClick={() => openEditModal(employee)}
                    >
                      <Edit2 className="w-4 h-4 mr-2" />
                      Editar Empleado
                    </Button>
                    <Button 
                      variant="destructive" 
                      size="sm" 
                      className="w-full"
                      onClick={() => openDeleteModal(employee)}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Eliminar Empleado
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filteredEmployees.length === 0 && (
        <div className="text-center py-12">
          <User className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No se encontraron empleados</h3>
          <p className="text-muted-foreground mb-4">
            {searchTerm || filterDepartment !== "all" || filterRole !== "all"
              ? "Prueba ajustando los filtros de búsqueda"
              : "Comienza agregando tu primer empleado"}
          </p>
          {!searchTerm && filterDepartment === "all" && filterRole === "all" && (
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Agregar Primer Empleado
            </Button>
          )}
        </div>
      )}

      {/* Customer Registration Summary */}
      {registrationFlows.length > 0 && (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Registros de Clientes Pendientes</CardTitle>
            <CardDescription>
              Clientes que han iniciado el proceso de registro vía WhatsApp
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground">
              Hay {registrationFlows.length} registros de clientes en proceso.
              Los clientes pueden completar su registro directamente desde WhatsApp.
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit Employee Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Empleado</DialogTitle>
            <DialogDescription>
              Modifica la información del empleado
            </DialogDescription>
          </DialogHeader>
          
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {/* Basic User Information */}
                <FormField
                  control={editForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre Completo</FormLabel>
                      <FormControl>
                        <Input placeholder="Juan Pérez" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre de Usuario</FormLabel>
                      <FormControl>
                        <Input placeholder="usuario123" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Credentials Section */}
              <div className="border rounded-lg p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium">Credenciales de Acceso</h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      editForm.setValue("password", "temp123");
                      toast({
                        title: "Contraseña temporal asignada",
                        description: "Se ha asignado la contraseña temporal 'temp123'. El usuario deberá cambiarla en su primer inicio de sesión.",
                      });
                    }}
                  >
                    Asignar Contraseña Temporal
                  </Button>
                </div>
                
                <FormField
                  control={editForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nueva Contraseña (opcional)</FormLabel>
                      <FormControl>
                        <Input 
                          type="password" 
                          placeholder="Dejar vacío para mantener contraseña actual" 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                      <p className="text-sm text-muted-foreground">
                        Si asignas una nueva contraseña, el usuario deberá cambiarla en su próximo inicio de sesión.
                      </p>
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={editForm.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Rol</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar rol" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="admin">Administrador</SelectItem>
                          <SelectItem value="technician">Técnico</SelectItem>
                          <SelectItem value="seller">Vendedor</SelectItem>
                          <SelectItem value="delivery">Delivery</SelectItem>
                          <SelectItem value="support">Soporte</SelectItem>
                          <SelectItem value="customer_service">Atención al Cliente</SelectItem>
                        </SelectContent>
                      </Select>
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
                        <Input placeholder="+52 555 123 4567" {...field} />
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
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="juan@empresa.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
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
                          <SelectItem value="admin">Administrativo</SelectItem>
                          <SelectItem value="delivery">Delivery</SelectItem>
                          <SelectItem value="support">Soporte</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="position"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cargo</FormLabel>
                      <FormControl>
                        <Input placeholder="Técnico Senior" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={editForm.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dirección</FormLabel>
                    <FormControl>
                      <Input placeholder="Calle Principal 123, Colonia Centro" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={editForm.control}
                  name="emergencyContact"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contacto de Emergencia</FormLabel>
                      <FormControl>
                        <Input placeholder="María Pérez" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="emergencyPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Teléfono de Emergencia</FormLabel>
                      <FormControl>
                        <Input placeholder="+52 555 987 6543" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={editForm.control}
                name="specializations"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Especializaciones (separadas por coma)</FormLabel>
                    <FormControl>
                      <Input placeholder="Aires Acondicionados, Refrigeración, Mantenimiento" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="vehicleInfo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Información del Vehículo</FormLabel>
                    <FormControl>
                      <Input placeholder="Honda CRV 2020 - ABC-123" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="certifications"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Certificaciones (separadas por coma)</FormLabel>
                    <FormControl>
                      <Input placeholder="EPA 608, NATE, HVAC Excellence" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="territory"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Territorio</FormLabel>
                    <FormControl>
                      <Input placeholder="Zona Norte" {...field} />
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
                    <FormLabel>Notas</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Notas adicionales sobre el empleado..."
                        className="min-h-[100px]"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end space-x-2 pt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsEditDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  disabled={updateEmployeeMutation.isPending}
                >
                  {updateEmployeeMutation.isPending ? "Actualizando..." : "Actualizar Empleado"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar empleado?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará permanentemente el empleado{" "}
              <strong>{employeeToDelete?.user?.name}</strong> y todos sus datos asociados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleteEmployeeMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteEmployeeMutation.isPending ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
