import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { Plus, User, Search, Edit2, Trash2, Briefcase, Users, Award, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const roleLabels = {
  admin: "Administrador",
  store_admin: "Admin Tienda",
  technician: "Técnico",
  seller: "Vendedor",
  delivery: "Delivery",
  support: "Soporte",
  customer_service: "Atención al Cliente"
};

const roleColors = {
  admin: "bg-red-100 text-red-800",
  store_admin: "bg-orange-100 text-orange-800",
  technician: "bg-blue-100 text-blue-800",
  seller: "bg-green-100 text-green-800",
  delivery: "bg-yellow-100 text-yellow-800",
  support: "bg-purple-100 text-purple-800",
  customer_service: "bg-pink-100 text-pink-800"
};

const createEmployeeSchema = z.object({
  username: z.string().min(3, "Mínimo 3 caracteres"),
  password: z.string().min(6, "Mínimo 6 caracteres"),
  name: z.string().min(2, "Nombre requerido"),
  role: z.enum(["admin", "technician", "seller", "delivery", "support", "customer_service", "store_admin"]),
  phone: z.string().optional(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  address: z.string().optional(),
  employeeProfileId: z.number().optional().nullable(),
});

const editEmployeeSchema = createEmployeeSchema.extend({
  password: z.string().min(6, "Mínimo 6 caracteres").optional().or(z.literal(""))
});

const createProfileSchema = z.object({
  department: z.string().min(2, "Departamento requerido"),
  position: z.string().min(2, "Posición requerida"),
  specializations: z.string().optional(),
  maxDailyOrders: z.string().optional(),
  skillLevel: z.string().optional(),
  notes: z.string().optional(),
});

type CreateEmployeeForm = z.infer<typeof createEmployeeSchema>;
type EditEmployeeForm = z.infer<typeof editEmployeeSchema>;
type CreateProfileForm = z.infer<typeof createProfileSchema>;

async function apiCall(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem("auth_token");
  const response = await fetch(endpoint, {
    ...options,
    headers: {
      ...options.headers,
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Error en la petición");
  }

  return response.json();
}

export default function EmployeesManagement() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [filterDepartment, setFilterDepartment] = useState("all");
  const [isCreateEmployeeOpen, setIsCreateEmployeeOpen] = useState(false);
  const [isEditEmployeeOpen, setIsEditEmployeeOpen] = useState(false);
  const [isCreateProfileOpen, setIsCreateProfileOpen] = useState(false);
  const [employeeToDelete, setEmployeeToDelete] = useState<any>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("employees");

  const { data: employees = [], isLoading: loadingEmployees, refetch: refetchEmployees } = useQuery({
    queryKey: ["/api/employees"],
    queryFn: () => apiCall("/api/employees")
  });

  const { data: profiles = [], isLoading: loadingProfiles, refetch: refetchProfiles } = useQuery({
    queryKey: ["/api/employee-profiles"],
    queryFn: () => apiCall("/api/employee-profiles")
  });

  // Departamentos dinámicos desde perfiles
  const departmentLabels = useMemo(() => {
    const depts: Record<string, string> = {};
    profiles.forEach((p: any) => {
      if (p.department) {
        depts[p.department] = p.department.charAt(0).toUpperCase() + p.department.slice(1);
      }
    });
    return depts;
  }, [profiles]);

  const createEmployeeMutation = useMutation({
    mutationFn: async (data: CreateEmployeeForm) => {
      return apiCall("/api/employees", {
        method: "POST",
        body: JSON.stringify({
          username: data.username,
          password: data.password,
          name: data.name,
          role: data.role,
          email: data.email || null,
          phone: data.phone || null,
          address: data.address || null,
          status: 'active',
          employeeProfileId: data.employeeProfileId || null
        })
      });
    },
    onSuccess: () => {
      toast({ title: "Empleado creado exitosamente" });
      setIsCreateEmployeeOpen(false);
      employeeForm.reset();
      refetchEmployees();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const updateEmployeeMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: EditEmployeeForm }) => {
      const updateData: any = {
        username: data.username,
        name: data.name,
        role: data.role,
        email: data.email || null,
        phone: data.phone || null,
        address: data.address || null,
        employeeProfileId: data.employeeProfileId || null
      };
      if (data.password) {
        updateData.password = data.password;
      }
      return apiCall(`/api/employees/${id}`, {
        method: "PUT",
        body: JSON.stringify(updateData)
      });
    },
    onSuccess: () => {
      toast({ title: "Empleado actualizado" });
      setIsEditEmployeeOpen(false);
      setSelectedEmployee(null);
      refetchEmployees();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const deleteEmployeeMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiCall(`/api/employees/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      toast({ title: "Empleado eliminado" });
      setEmployeeToDelete(null);
      refetchEmployees();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const createProfileMutation = useMutation({
    mutationFn: async (data: CreateProfileForm) => {
      return apiCall("/api/employee-profiles", {
        method: "POST",
        body: JSON.stringify({
          ...data,
          specializations: data.specializations 
            ? data.specializations.split(',').map(s => s.trim()) 
            : [],
          maxDailyOrders: data.maxDailyOrders ? parseInt(data.maxDailyOrders) : 5,
          skillLevel: data.skillLevel ? parseInt(data.skillLevel) : 3,
        })
      });
    },
    onSuccess: () => {
      toast({ title: "Perfil creado exitosamente" });
      setIsCreateProfileOpen(false);
      profileForm.reset();
      refetchProfiles();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const deleteProfileMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiCall(`/api/employee-profiles/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      toast({ title: "Perfil eliminado" });
      refetchProfiles();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const employeeForm = useForm<CreateEmployeeForm>({
    resolver: zodResolver(createEmployeeSchema),
    defaultValues: { role: "technician", employeeProfileId: null }
  });

  const editEmployeeForm = useForm<EditEmployeeForm>({
    resolver: zodResolver(editEmployeeSchema),
    defaultValues: { role: "technician", employeeProfileId: null }
  });

  const profileForm = useForm<CreateProfileForm>({
    resolver: zodResolver(createProfileSchema),
    defaultValues: { maxDailyOrders: "5", skillLevel: "3" }
  });

  const handleEditEmployee = (emp: any) => {
    setSelectedEmployee(emp);
    editEmployeeForm.reset({
      username: emp.username,
      name: emp.name,
      role: emp.role,
      phone: emp.phone || "",
      email: emp.email || "",
      address: emp.address || "",
      password: "",
      employeeProfileId: emp.employeeProfileId || null
    });
    setIsEditEmployeeOpen(true);
  };

  const filteredEmployees = employees.filter((emp: any) => {
    const matchesSearch = emp.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         emp.username?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = filterRole === "all" || emp.role === filterRole;
    const matchesDept = filterDepartment === "all" || emp.profile?.department === filterDepartment;
    return matchesSearch && matchesRole && matchesDept;
  });

  if (loadingEmployees || loadingProfiles) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Gestión de Empleados</h1>
          <p className="text-muted-foreground">Administra usuarios y perfiles</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="employees">
            <Users className="w-4 h-4 mr-2" />
            Empleados ({employees.length})
          </TabsTrigger>
          <TabsTrigger value="profiles">
            <Briefcase className="w-4 h-4 mr-2" />
            Perfiles ({profiles.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="employees" className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
            </div>
            <Select value={filterRole} onValueChange={setFilterRole}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los roles</SelectItem>
                {Object.entries(roleLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterDepartment} onValueChange={setFilterDepartment}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los departamentos</SelectItem>
                {Object.entries(departmentLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Dialog open={isCreateEmployeeOpen} onOpenChange={setIsCreateEmployeeOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="w-4 h-4 mr-2" />Nuevo</Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Crear Empleado</DialogTitle>
                </DialogHeader>
                <Form {...employeeForm}>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField control={employeeForm.control} name="name" render={({ field }) => (
                        <FormItem><FormLabel>Nombre</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={employeeForm.control} name="username" render={({ field }) => (
                        <FormItem><FormLabel>Usuario</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                    </div>
                    <FormField control={employeeForm.control} name="password" render={({ field }) => (
                      <FormItem><FormLabel>Contraseña</FormLabel><FormControl><Input type="password" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <div className="grid grid-cols-2 gap-4">
                      <FormField control={employeeForm.control} name="role" render={({ field }) => (
                        <FormItem><FormLabel>Rol</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>
                              {Object.entries(roleLabels).map(([value, label]) => (
                                <SelectItem key={value} value={value}>{label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={employeeForm.control} name="employeeProfileId" render={({ field }) => (
                        <FormItem><FormLabel>Perfil</FormLabel>
                          <Select onValueChange={(val) => field.onChange(val === "none" ? null : parseInt(val))} value={field.value?.toString() || "none"}>
                            <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>
                              <SelectItem value="none">Sin perfil</SelectItem>
                              {profiles.map((p: any) => (
                                <SelectItem key={p.id} value={p.id.toString()}>{p.position} - {p.department}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField control={employeeForm.control} name="phone" render={({ field }) => (
                        <FormItem><FormLabel>Teléfono</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={employeeForm.control} name="email" render={({ field }) => (
                        <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                    </div>
                    <FormField control={employeeForm.control} name="address" render={({ field }) => (
                      <FormItem><FormLabel>Dirección</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setIsCreateEmployeeOpen(false)}>Cancelar</Button>
                      <Button type="button" disabled={createEmployeeMutation.isPending} onClick={() => employeeForm.handleSubmit((data) => createEmployeeMutation.mutate(data))()}>
                        {createEmployeeMutation.isPending ? "Creando..." : "Crear"}
                      </Button>
                    </div>
                  </div>
                </Form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredEmployees.map((emp: any) => (
              <Card key={emp.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{emp.name}</CardTitle>
                        <p className="text-sm text-muted-foreground">@{emp.username}</p>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-2">
                    <Badge className={roleColors[emp.role as keyof typeof roleColors]}>
                      {roleLabels[emp.role as keyof typeof roleLabels]}
                    </Badge>
                    {emp.profile && (
                      <Badge variant="outline">{emp.profile.department}</Badge>
                    )}
                  </div>
                  {emp.profile && (
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Briefcase className="w-4 h-4" />
                        <span>{emp.profile.position}</span>
                      </div>
                    </div>
                  )}
                  {emp.phone && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Phone className="w-4 h-4" />
                      <span>{emp.phone}</span>
                    </div>
                  )}
                  <div className="flex gap-2 pt-2">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => handleEditEmployee(emp)}>
                      <Edit2 className="w-3 h-3 mr-1" />Editar
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => setEmployeeToDelete(emp)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {filteredEmployees.length === 0 && (
            <div className="text-center py-12">
              <User className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No se encontraron empleados</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="profiles" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">Plantillas reutilizables</p>
            <Dialog open={isCreateProfileOpen} onOpenChange={setIsCreateProfileOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="w-4 h-4 mr-2" />Nuevo Perfil</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Crear Perfil</DialogTitle></DialogHeader>
                <Form {...profileForm}>
                  <div className="space-y-4">
                    <FormField control={profileForm.control} name="position" render={({ field }) => (
                      <FormItem><FormLabel>Posición</FormLabel><FormControl><Input placeholder="Técnico Senior" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={profileForm.control} name="department" render={({ field }) => (
                      <FormItem><FormLabel>Departamento</FormLabel><FormControl><Input placeholder="technical, sales, etc." {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={profileForm.control} name="specializations" render={({ field }) => (
                      <FormItem><FormLabel>Especializaciones</FormLabel><FormControl><Input placeholder="HVAC, Refrigeración" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <div className="grid grid-cols-2 gap-4">
                      <FormField control={profileForm.control} name="maxDailyOrders" render={({ field }) => (
                        <FormItem><FormLabel>Órdenes/día</FormLabel><FormControl><Input type="number" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                      <FormField control={profileForm.control} name="skillLevel" render={({ field }) => (
                        <FormItem><FormLabel>Nivel (1-5)</FormLabel><FormControl><Input type="number" min="1" max="5" {...field} /></FormControl><FormMessage /></FormItem>
                      )} />
                    </div>
                    <FormField control={profileForm.control} name="notes" render={({ field }) => (
                      <FormItem><FormLabel>Notas</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setIsCreateProfileOpen(false)}>Cancelar</Button>
                      <Button type="button" disabled={createProfileMutation.isPending} onClick={() => profileForm.handleSubmit((data) => createProfileMutation.mutate(data))()}>
                        {createProfileMutation.isPending ? "Creando..." : "Crear"}
                      </Button>
                    </div>
                  </div>
                </Form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {profiles.map((profile: any) => (
              <Card key={profile.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{profile.position}</CardTitle>
                      <p className="text-sm text-muted-foreground">{profile.employeeId || `ID: ${profile.id}`}</p>
                    </div>
                    <Badge variant="outline">{profile.department}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {profile.specializations?.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Especializaciones:</p>
                      <div className="flex flex-wrap gap-1">
                        {profile.specializations.map((spec: string, idx: number) => (
                          <Badge key={idx} variant="secondary" className="text-xs">{spec}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex gap-4 text-sm">
                    <div><p className="text-muted-foreground">Órdenes/día</p><p className="font-medium">{profile.maxDailyOrders || 5}</p></div>
                    <div><p className="text-muted-foreground">Nivel</p><p className="font-medium">{profile.skillLevel || 3}/5</p></div>
                  </div>
                  {profile.notes && <p className="text-xs text-muted-foreground italic">{profile.notes}</p>}
                  <div className="flex gap-2 pt-2">
                    <Button size="sm" variant="outline" className="flex-1"><Edit2 className="w-3 h-3 mr-1" />Editar</Button>
                    <Button size="sm" variant="destructive" onClick={() => {
                      if (window.confirm("¿Eliminar perfil?")) deleteProfileMutation.mutate(profile.id);
                    }}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {profiles.length === 0 && (
            <div className="text-center py-12">
              <Briefcase className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No hay perfiles</p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Edit Employee Dialog */}
      <Dialog open={isEditEmployeeOpen} onOpenChange={setIsEditEmployeeOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Editar Empleado</DialogTitle></DialogHeader>
          <Form {...editEmployeeForm}>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={editEmployeeForm.control} name="name" render={({ field }) => (
                  <FormItem><FormLabel>Nombre</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={editEmployeeForm.control} name="username" render={({ field }) => (
                  <FormItem><FormLabel>Usuario</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <FormField control={editEmployeeForm.control} name="password" render={({ field }) => (
                <FormItem><FormLabel>Nueva Contraseña (opcional)</FormLabel><FormControl><Input type="password" placeholder="Dejar vacío para no cambiar" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={editEmployeeForm.control} name="role" render={({ field }) => (
                  <FormItem><FormLabel>Rol</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        {Object.entries(roleLabels).map(([value, label]) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={editEmployeeForm.control} name="employeeProfileId" render={({ field }) => (
                  <FormItem><FormLabel>Perfil</FormLabel>
                    <Select onValueChange={(val) => field.onChange(val === "none" ? null : parseInt(val))} value={field.value?.toString() || "none"}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="none">Sin perfil</SelectItem>
                        {profiles.map((p: any) => (
                          <SelectItem key={p.id} value={p.id.toString()}>{p.position} - {p.department}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField control={editEmployeeForm.control} name="phone" render={({ field }) => (
                  <FormItem><FormLabel>Teléfono</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={editEmployeeForm.control} name="email" render={({ field }) => (
                  <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <FormField control={editEmployeeForm.control} name="address" render={({ field }) => (
                <FormItem><FormLabel>Dirección</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsEditEmployeeOpen(false)}>Cancelar</Button>
                <Button type="button" disabled={updateEmployeeMutation.isPending} onClick={() => editEmployeeForm.handleSubmit((data) => updateEmployeeMutation.mutate({ id: selectedEmployee.id, data }))()}>
                  {updateEmployeeMutation.isPending ? "Actualizando..." : "Actualizar"}
                </Button>
              </div>
            </div>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!employeeToDelete} onOpenChange={() => setEmployeeToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar empleado?</AlertDialogTitle>
            <AlertDialogDescription>Se eliminará <strong>{employeeToDelete?.name}</strong>. El perfil no se eliminará.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => employeeToDelete && deleteEmployeeMutation.mutate(employeeToDelete.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}