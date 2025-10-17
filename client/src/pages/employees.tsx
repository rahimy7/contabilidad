import React, { useState, useMemo } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Pencil, Trash2, Plus, Users, Briefcase, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const createEmployeeSchema = z.object({
  username: z.string().min(3, "Mínimo 3 caracteres"),
  password: z.string().min(6, "Mínimo 6 caracteres"),
  name: z.string().min(2, "Nombre requerido"),
  role: z.string().min(1, "Rol requerido"),
  phone: z.string().optional(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  address: z.string().optional(),
  employeeProfileId: z.number().optional().nullable(),
});

const editEmployeeSchema = createEmployeeSchema.extend({
  password: z.string().min(6, "Mínimo 6 caracteres").optional().or(z.literal(""))
});

const profileSchema = z.object({
  department: z.string().min(2, "Departamento requerido"),
  position: z.string().min(2, "Posición requerida"),
  specializations: z.string().optional(),
  notes: z.string().optional(),
});

type CreateEmployeeForm = z.infer<typeof createEmployeeSchema>;
type EditEmployeeForm = z.infer<typeof editEmployeeSchema>;
type ProfileForm = z.infer<typeof profileSchema>;

async function apiCall(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem("auth_token");
  const response = await fetch(endpoint, {
    ...options,
    headers: { ...options.headers, "Authorization": `Bearer ${token}`, "Content-Type": "application/json" }
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
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [employeeToDelete, setEmployeeToDelete] = useState<any>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);
  const [selectedProfile, setSelectedProfile] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("employees");

  const { data: employees = [], refetch: refetchEmployees } = useQuery({
    queryKey: ["/api/employees"],
    queryFn: () => apiCall("/api/employees")
  });

  const { data: profiles = [], refetch: refetchProfiles } = useQuery({
    queryKey: ["/api/employee-profiles"],
    queryFn: () => apiCall("/api/employee-profiles")
  });

 const roles = [
  { id: 'admin', name: 'admin', displayName: 'Administrador' },
  { id: 'technician', name: 'technician', displayName: 'Técnico' },
  { id: 'seller', name: 'seller', displayName: 'Vendedor' },
  { id: 'delivery', name: 'delivery', displayName: 'Repartidor' },
  { id: 'support', name: 'support', displayName: 'Soporte' },
  { id: 'customer_service', name: 'customer_service', displayName: 'Atención al Cliente' },
  { id: 'store_admin', name: 'store_admin', displayName: 'Administrador de Tienda' },
];


  const roleLabels: Record<string, string> = {
  admin: "Administrador",
  technician: "Técnico",
  seller: "Vendedor",
  delivery: "Repartidor",
  support: "Soporte",
  customer_service: "Atención al Cliente",
  store_admin: "Administrador de Tienda"
};

  const departmentLabels = useMemo(() => {
    const depts: Record<string, string> = {};
    profiles.forEach((p: any) => {
      if (p.department) depts[p.department] = p.department.charAt(0).toUpperCase() + p.department.slice(1);
    });
    return depts;
  }, [profiles]);

  const employeeForm = useForm<CreateEmployeeForm>({
    resolver: zodResolver(createEmployeeSchema),
    defaultValues: { role: "", employeeProfileId: null }
  });

  const editEmployeeForm = useForm<EditEmployeeForm>({
    resolver: zodResolver(editEmployeeSchema),
    defaultValues: { role: "", employeeProfileId: null }
  });

  const profileForm = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {  }
  });

  const editProfileForm = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {  }
  });

  const createEmployeeMutation = useMutation({
    mutationFn: async (data: CreateEmployeeForm) => {
      return apiCall("/api/employees", {
        method: "POST",
        body: JSON.stringify({
          ...data,
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
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" })
  });

  const updateEmployeeMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: EditEmployeeForm }) => {
      const updateData: any = {
        username: data.username, name: data.name, role: data.role,
        email: data.email || null, phone: data.phone || null,
        address: data.address || null, employeeProfileId: data.employeeProfileId || null
      };
      if (data.password) updateData.password = data.password;
      return apiCall(`/api/employees/${id}`, { method: "PUT", body: JSON.stringify(updateData) });
    },
    onSuccess: () => {
      toast({ title: "Empleado actualizado" });
      setIsEditEmployeeOpen(false);
      setSelectedEmployee(null);
      refetchEmployees();
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" })
  });

  const deleteEmployeeMutation = useMutation({
    mutationFn: async (id: number) => apiCall(`/api/employees/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Empleado eliminado" });
      setEmployeeToDelete(null);
      refetchEmployees();
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" })
  });

  const createProfileMutation = useMutation({
    mutationFn: async (data: ProfileForm) => {
      return apiCall("/api/employee-profiles", {
        method: "POST",
       body: JSON.stringify({
        department: data.department,
        position: data.position,
        notes: data.notes || null,
      })
      });
    },
    onSuccess: () => {
      toast({ title: "Perfil creado exitosamente" });
      setIsCreateProfileOpen(false);
      profileForm.reset();
      refetchProfiles();
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" })
  });

  const updateProfileMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: ProfileForm }) => {
      return apiCall(`/api/employee-profiles/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          department: data.department, position: data.position,
          specializations: data.specializations ? data.specializations.split(',').map(s => s.trim()) : [],
     
          notes: data.notes || null,
        })
      });
    },
    onSuccess: () => {
      toast({ title: "Perfil actualizado exitosamente" });
      setIsEditProfileOpen(false);
      setSelectedProfile(null);
      refetchProfiles();
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" })
  });

  const deleteProfileMutation = useMutation({
    mutationFn: async (id: number) => apiCall(`/api/employee-profiles/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Perfil eliminado" });
      refetchProfiles();
    },
    onError: (error: Error) => toast({ title: "Error", description: error.message, variant: "destructive" })
  });

  const handleEditEmployee = (emp: any) => {
    setSelectedEmployee(emp);
    editEmployeeForm.reset({
      username: emp.username, name: emp.name, role: emp.role,
      phone: emp.phone || "", email: emp.email || "", address: emp.address || "",
      password: "", employeeProfileId: emp.employeeProfileId || null
    });
    setIsEditEmployeeOpen(true);
  };

const handleEditProfile = (profile: any) => {
  setSelectedProfile(profile);
  editProfileForm.reset({
    department: profile.department || "",
    position: profile.position || "",
    specializations: Array.isArray(profile.specializations) ? profile.specializations.join(', ') : "",
    notes: profile.notes || "",
  });
  setIsEditProfileOpen(true);
};

  const filteredEmployees = employees.filter((emp: any) => {
    const matchesSearch = emp.name?.toLowerCase().includes(searchTerm.toLowerCase()) || emp.username?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = filterRole === "all" || emp.role === filterRole;
    const matchesDept = filterDepartment === "all" || emp.profile?.department === filterDepartment;
    return matchesSearch && matchesRole && matchesDept;
  });

  const filteredProfiles = profiles.filter((profile: any) => {
    const matchesSearch = profile.position?.toLowerCase().includes(searchTerm.toLowerCase()) || profile.department?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDept = filterDepartment === "all" || profile.department === filterDepartment;
    return matchesSearch && matchesDept;
  });

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-3xl font-bold">Gestión de Personal</h1>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="employees"><Users className="w-4 h-4 mr-2" />Empleados</TabsTrigger>
          <TabsTrigger value="profiles"><Briefcase className="w-4 h-4 mr-2" />Perfiles</TabsTrigger>
        </TabsList>
        <TabsContent value="employees" className="space-y-4">
          <div className="flex gap-4 items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar empleado..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
            </div>
            <Select value={filterRole} onValueChange={setFilterRole}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Filtrar por rol" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los roles</SelectItem>
{roles.map((role) => (
  <SelectItem key={role.id} value={role.name}>
    {role.displayName}
  </SelectItem>
))}
              </SelectContent>
            </Select>
            <Button onClick={() => setIsCreateEmployeeOpen(true)}><Plus className="w-4 h-4 mr-2" />Nuevo Empleado</Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredEmployees.map((emp: any) => (
              <Card key={emp.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg">{emp.name}</CardTitle>
                      <p className="text-sm text-muted-foreground">@{emp.username}</p>
                    </div>
                    <Badge variant="outline">{roleLabels[emp.role] || emp.role}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {emp.profile && (
                    <div className="p-2 bg-muted rounded-md text-sm">
                      <p className="font-medium">{emp.profile.position}</p>
                      <p className="text-muted-foreground">{emp.profile.department}</p>
                    </div>
                  )}
                  {emp.email && <p className="text-sm">📧 {emp.email}</p>}
                  {emp.phone && <p className="text-sm">📱 {emp.phone}</p>}
                  <div className="flex gap-2 pt-2">
                    <Button size="sm" variant="outline" onClick={() => handleEditEmployee(emp)}><Pencil className="w-3 h-3 mr-1" />Editar</Button>
                    <Button size="sm" variant="destructive" onClick={() => setEmployeeToDelete(emp)}><Trash2 className="w-3 h-3 mr-1" />Eliminar</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="profiles" className="space-y-4">
          <div className="flex gap-4 items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Buscar perfil..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
            </div>
            <Select value={filterDepartment} onValueChange={setFilterDepartment}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Filtrar por departamento" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {Object.entries(departmentLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => setIsCreateProfileOpen(true)}><Plus className="w-4 h-4 mr-2" />Nuevo Perfil</Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProfiles.map((profile: any) => (
              <Card key={profile.id}>
                <CardHeader>
                  <CardTitle className="text-lg">{profile.position}</CardTitle>
                  <Badge variant="secondary">{profile.department}</Badge>
                </CardHeader>
                <CardContent className="space-y-2">
                  {profile.specializations && profile.specializations.length > 0 && (
                    <div>
                      <p className="text-sm font-medium">Especializaciones:</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {profile.specializations.map((spec: string, idx: number) => (
                          <Badge key={idx} variant="outline" className="text-xs">{spec}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="text-sm">Max órdenes: {profile.maxDailyOrders || 5}</p>
                  <p className="text-sm">Nivel: {profile.skillLevel || 3}/5</p>
                  {profile.province && <p className="text-sm">📍 {profile.province}</p>}
                  <div className="flex gap-2 pt-2">
                    <Button size="sm" variant="outline" onClick={() => handleEditProfile(profile)}><Pencil className="w-3 h-3 mr-1" />Editar</Button>
                    <Button size="sm" variant="destructive" onClick={() => deleteProfileMutation.mutate(profile.id)}><Trash2 className="w-3 h-3 mr-1" />Eliminar</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={isCreateEmployeeOpen} onOpenChange={setIsCreateEmployeeOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Crear Empleado</DialogTitle></DialogHeader>
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
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Seleccionar rol" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {roles.map((role: any) => (
                          <SelectItem key={role.id} value={role.name}>{role.displayName || role.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={employeeForm.control} name="employeeProfileId" render={({ field }) => (
                  <FormItem><FormLabel>Perfil</FormLabel>
                    <Select onValueChange={(val) => field.onChange(val === "none" ? null : parseInt(val))} value={field.value?.toString() || "none"}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Sin perfil" /></SelectTrigger></FormControl>
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
                <FormField control={employeeForm.control} name="email" render={({ field }) => (
                  <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={employeeForm.control} name="phone" render={({ field }) => (
                  <FormItem><FormLabel>Teléfono</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <FormField control={employeeForm.control} name="address" render={({ field }) => (
                <FormItem><FormLabel>Dirección</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setIsCreateEmployeeOpen(false)}>Cancelar</Button>
                <Button onClick={employeeForm.handleSubmit((data) => createEmployeeMutation.mutate(data))}>Crear Empleado</Button>
              </div>
            </div>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditEmployeeOpen} onOpenChange={setIsEditEmployeeOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
                        {roles.map((role: any) => (
                          <SelectItem key={role.id} value={role.name}>{role.displayName || role.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={editEmployeeForm.control} name="employeeProfileId" render={({ field }) => (
                  <FormItem><FormLabel>Perfil</FormLabel>
                    <Select onValueChange={(val) => field.onChange(val === "none" ? null : parseInt(val))} value={field.value?.toString() || "none"}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Sin perfil" /></SelectTrigger></FormControl>
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
                <FormField control={editEmployeeForm.control} name="email" render={({ field }) => (
                  <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={editEmployeeForm.control} name="phone" render={({ field }) => (
                  <FormItem><FormLabel>Teléfono</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <FormField control={editEmployeeForm.control} name="address" render={({ field }) => (
                <FormItem><FormLabel>Dirección</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setIsEditEmployeeOpen(false)}>Cancelar</Button>
                <Button onClick={editEmployeeForm.handleSubmit((data) => updateEmployeeMutation.mutate({ id: selectedEmployee?.id, data }))}>Actualizar</Button>
              </div>
            </div>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateProfileOpen} onOpenChange={setIsCreateProfileOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Crear Perfil</DialogTitle></DialogHeader>
          <Form {...profileForm}>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={profileForm.control} name="department" render={({ field }) => (
                  <FormItem><FormLabel>Departamento</FormLabel><FormControl><Input {...field} placeholder="ej: Technical" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={profileForm.control} name="position" render={({ field }) => (
                  <FormItem><FormLabel>Posición</FormLabel><FormControl><Input {...field} placeholder="ej: Técnico Senior" /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <FormField control={profileForm.control} name="specializations" render={({ field }) => (
                <FormItem><FormLabel>Especializaciones (separadas por coma)</FormLabel><FormControl><Input {...field} placeholder="ej: Instalación, Reparación, Mantenimiento" /></FormControl><FormMessage /></FormItem>
              )} />
             
              <div className="grid grid-cols-3 gap-4">
               
              <FormField control={profileForm.control} name="notes" render={({ field }) => (
                <FormItem><FormLabel>Notas</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setIsCreateProfileOpen(false)}>Cancelar</Button>
                <Button onClick={profileForm.handleSubmit((data) => createProfileMutation.mutate(data))}>Crear Perfil</Button>
              </div>
            </div>
            </div>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditProfileOpen} onOpenChange={setIsEditProfileOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar Perfil</DialogTitle></DialogHeader>
          <Form {...editProfileForm}>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={editProfileForm.control} name="department" render={({ field }) => (
                  <FormItem><FormLabel>Departamento</FormLabel><FormControl><Input {...field} placeholder="ej: Technical" /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={editProfileForm.control} name="position" render={({ field }) => (
                  <FormItem><FormLabel>Posición</FormLabel><FormControl><Input {...field} placeholder="ej: Técnico Senior" /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <FormField control={editProfileForm.control} name="specializations" render={({ field }) => (
                <FormItem><FormLabel>Especializaciones (separadas por coma)</FormLabel><FormControl><Input {...field} placeholder="ej: Instalación, Reparación, Mantenimiento" /></FormControl><FormMessage /></FormItem>
              )} />
          
              <div className="grid grid-cols-3 gap-4">
                
              <FormField control={editProfileForm.control} name="notes" render={({ field }) => (
                <FormItem><FormLabel>Notas</FormLabel><FormControl><Textarea {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setIsEditProfileOpen(false)}>Cancelar</Button>
                <Button onClick={editProfileForm.handleSubmit((data) => updateProfileMutation.mutate({ id: selectedProfile?.id, data }))}>Actualizar Perfil</Button>
              </div>
            </div>
            </div>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!employeeToDelete} onOpenChange={() => setEmployeeToDelete(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirmar Eliminación</DialogTitle></DialogHeader>
          <p>¿Estás seguro de que deseas eliminar a {employeeToDelete?.name}?</p>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setEmployeeToDelete(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteEmployeeMutation.mutate(employeeToDelete.id)}>Eliminar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}