import React, { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { DayPicker } from 'react-day-picker';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import {
  CalendarDays, Plus, Search, Filter, Clock, User, Phone,
  Mail, Pencil, Trash2, ChevronLeft, ChevronRight, X, Check, XCircle, AlertCircle, ChevronsUpDown, UserPlus
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from '@/components/ui/command';
import { useToast } from '@/hooks/use-toast';

// ================================
// API Helper
// ================================
async function apiCall(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem("auth_token");
  const response = await fetch(endpoint, {
    ...options,
    headers: {
      ...options.headers,
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Error desconocido' }));
    throw new Error(errorData.error || `Error ${response.status}`);
  }
  return response.json();
}

// ================================
// Zod Schemas
// ================================
// Quick customer creation schema
const newCustomerSchema = z.object({
  name: z.string().min(2, "El nombre es requerido (mínimo 2 caracteres)"),
  phone: z.string().min(7, "El teléfono es requerido"),
  email: z.string().email("Email inválido"),
});
type NewCustomerFormData = z.infer<typeof newCustomerSchema>;

// ================================
// CustomerCombobox Component
// ================================
function CustomerCombobox({
  value,
  onChange,
  customers,
  onAddNew,
}: {
  value: string;
  onChange: (val: string) => void;
  customers: { id: number; name: string; phone: string }[];
  onAddNew: () => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = customers.find((c) => String(c.id) === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {selected ? (
            <span className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              {selected.name} {selected.phone ? `(${selected.phone})` : ''}
            </span>
          ) : (
            <span className="text-muted-foreground">Buscar cliente...</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar por nombre o teléfono..." />
          <CommandList>
            <CommandEmpty>No se encontró ningún cliente.</CommandEmpty>
            <CommandGroup heading="Clientes">
              {customers.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`${c.name} ${c.phone}`}
                  onSelect={() => {
                    onChange(String(c.id));
                    setOpen(false);
                  }}
                >
                  <Check className={cn('mr-2 h-4 w-4', String(c.id) === value ? 'opacity-100' : 'opacity-0')} />
                  <div>
                    <span className="font-medium">{c.name}</span>
                    {c.phone && <span className="ml-2 text-xs text-muted-foreground">{c.phone}</span>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup>
              <CommandItem
                onSelect={() => {
                  setOpen(false);
                  onAddNew();
                }}
                className="text-blue-600 font-medium"
              >
                <UserPlus className="mr-2 h-4 w-4" />
                Agregar nuevo cliente
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const appointmentFormSchema = z.object({
  customerId: z.string().min(1, "Seleccione un cliente"),
  title: z.string().min(1, "El título es requerido"),
  description: z.string().optional(),
  appointmentDate: z.string().min(1, "La fecha es requerida"),
  appointmentTime: z.string().min(1, "La hora es requerida"),
  appointmentEndTime: z.string().optional(),
  status: z.string().default("scheduled"),
  notes: z.string().optional(),
});

type AppointmentFormData = z.infer<typeof appointmentFormSchema>;

// ================================
// Status Helpers
// ================================
const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  scheduled: { label: 'Programada', color: 'bg-blue-100 text-blue-800 border-blue-200', icon: <Clock className="h-3 w-3" /> },
  completed: { label: 'Completada', color: 'bg-green-100 text-green-800 border-green-200', icon: <Check className="h-3 w-3" /> },
  cancelled: { label: 'Cancelada', color: 'bg-red-100 text-red-800 border-red-200', icon: <XCircle className="h-3 w-3" /> },
  no_show: { label: 'No asistió', color: 'bg-yellow-100 text-yellow-800 border-yellow-200', icon: <AlertCircle className="h-3 w-3" /> },
};

function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || statusConfig.scheduled;
  return (
    <Badge variant="outline" className={cn("gap-1", config.color)}>
      {config.icon}
      {config.label}
    </Badge>
  );
}

// ================================
// Main Component
// ================================
export default function AppointmentsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('calendar');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isNewCustomerOpen, setIsNewCustomerOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<any>(null);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  // Which form to set customerId after new customer is created
  const newCustomerTargetRef = useRef<((val: string) => void) | null>(null);

  // ================================
  // Queries
  // ================================
  const { data: appointments = [], refetch: refetchAppointments } = useQuery({
    queryKey: ['/api/appointments'],
    queryFn: () => apiCall('/api/appointments'),
  });

  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth() + 1;

  const { data: calendarAppointments = [] } = useQuery({
    queryKey: ['/api/appointments/calendar', year, month],
    queryFn: () => apiCall(`/api/appointments/calendar/${year}/${month}`),
  });

  const { data: customers = [], refetch: refetchCustomers } = useQuery({
    queryKey: ['/api/customers'],
    queryFn: () => apiCall('/api/customers'),
  });

  // ================================
  // Mutations
  // ================================
  const createMutation = useMutation({
    mutationFn: (data: any) => apiCall('/api/appointments', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      toast({ title: 'Cita creada exitosamente' });
      refetchAppointments();
      setIsCreateOpen(false);
      createForm.reset();
    },
    onError: (error: Error) => {
      toast({ title: 'Error al crear cita', description: error.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiCall(`/api/appointments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: () => {
      toast({ title: 'Cita actualizada exitosamente' });
      refetchAppointments();
      setIsEditOpen(false);
      setSelectedAppointment(null);
    },
    onError: (error: Error) => {
      toast({ title: 'Error al actualizar cita', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiCall(`/api/appointments/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast({ title: 'Cita eliminada exitosamente' });
      refetchAppointments();
      setIsDeleteOpen(false);
      setSelectedAppointment(null);
    },
    onError: (error: Error) => {
      toast({ title: 'Error al eliminar cita', description: error.message, variant: 'destructive' });
    },
  });

  const createCustomerMutation = useMutation({
    mutationFn: (data: NewCustomerFormData) =>
      apiCall('/api/customers', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: (newCustomer: any) => {
      toast({ title: `Cliente "${newCustomer.name}" creado exitosamente` });
      refetchCustomers();
      setIsNewCustomerOpen(false);
      newCustomerForm.reset();
      // Auto-select the new customer in the target form
      if (newCustomerTargetRef.current) {
        newCustomerTargetRef.current(String(newCustomer.id));
        newCustomerTargetRef.current = null;
      }
    },
    onError: (error: Error) => {
      toast({ title: 'Error al crear cliente', description: error.message, variant: 'destructive' });
    },
  });

  // ================================
  // Forms
  // ================================
  const createForm = useForm<AppointmentFormData>({
    resolver: zodResolver(appointmentFormSchema),
    defaultValues: {
      customerId: '',
      title: '',
      description: '',
      appointmentDate: '',
      appointmentTime: '',
      appointmentEndTime: '',
      status: 'scheduled',
      notes: '',
    },
  });

  const editForm = useForm<AppointmentFormData>({
    resolver: zodResolver(appointmentFormSchema),
  });

  const newCustomerForm = useForm<NewCustomerFormData>({
    resolver: zodResolver(newCustomerSchema),
    defaultValues: { name: '', phone: '', email: '' },
  });

  // ================================
  // Handlers
  // ================================
  function handleCreate(data: AppointmentFormData) {
    const appointmentDate = `${data.appointmentDate}T${data.appointmentTime}:00`;
    const appointmentEndDate = data.appointmentEndTime
      ? `${data.appointmentDate}T${data.appointmentEndTime}:00`
      : undefined;

    createMutation.mutate({
      customerId: parseInt(data.customerId),
      title: data.title,
      description: data.description || undefined,
      appointmentDate,
      appointmentEndDate,
      status: data.status,
      notes: data.notes || undefined,
    });
  }

  function handleEdit(data: AppointmentFormData) {
    if (!selectedAppointment) return;

    const appointmentDate = `${data.appointmentDate}T${data.appointmentTime}:00`;
    const appointmentEndDate = data.appointmentEndTime
      ? `${data.appointmentDate}T${data.appointmentEndTime}:00`
      : undefined;

    updateMutation.mutate({
      id: selectedAppointment.id,
      data: {
        customerId: parseInt(data.customerId),
        title: data.title,
        description: data.description || undefined,
        appointmentDate,
        appointmentEndDate,
        status: data.status,
        notes: data.notes || undefined,
      },
    });
  }

  function openEdit(appointment: any) {
    setSelectedAppointment(appointment);
    const date = new Date(appointment.appointmentDate);
    const endDate = appointment.appointmentEndDate ? new Date(appointment.appointmentEndDate) : null;

    editForm.reset({
      customerId: String(appointment.customerId),
      title: appointment.title,
      description: appointment.description || '',
      appointmentDate: format(date, 'yyyy-MM-dd'),
      appointmentTime: format(date, 'HH:mm'),
      appointmentEndTime: endDate ? format(endDate, 'HH:mm') : '',
      status: appointment.status,
      notes: appointment.notes || '',
    });
    setIsEditOpen(true);
  }

  function openDelete(appointment: any) {
    setSelectedAppointment(appointment);
    setIsDeleteOpen(true);
  }

  function openCreateForDay(day: Date) {
    createForm.reset({
      customerId: '',
      title: '',
      description: '',
      appointmentDate: format(day, 'yyyy-MM-dd'),
      appointmentTime: '09:00',
      appointmentEndTime: '',
      status: 'scheduled',
      notes: '',
    });
    setIsCreateOpen(true);
  }

  // ================================
  // Derived Data
  // ================================

  // Days that have appointments (for calendar highlighting)
  const daysWithAppointments = useMemo(() => {
    return calendarAppointments.map((a: any) => new Date(a.appointmentDate));
  }, [calendarAppointments]);

  // Appointments for the selected day
  const selectedDayAppointments = useMemo(() => {
    if (!selectedDay) return [];
    return calendarAppointments.filter((a: any) =>
      isSameDay(new Date(a.appointmentDate), selectedDay)
    );
  }, [selectedDay, calendarAppointments]);

  // Filtered appointments for list view
  const filteredAppointments = useMemo(() => {
    return appointments.filter((a: any) => {
      const matchesSearch = !searchTerm ||
        a.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        a.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        a.customerPhone?.includes(searchTerm);
      const matchesStatus = statusFilter === 'all' || a.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [appointments, searchTerm, statusFilter]);

  // Customer list for select (handle nested structure from join)
  const customerList = useMemo(() => {
    return customers.map((c: any) => ({
      id: c.id || c.customers?.id,
      name: c.name || c.customers?.name,
      phone: c.phone || c.customers?.phone,
    })).filter((c: any) => c.id);
  }, [customers]);

  // ================================
  // Render
  // ================================
  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarDays className="h-7 w-7 text-blue-600" />
            Agenda de Citas
          </h1>
          <p className="text-muted-foreground mt-1">
            Gestiona las citas con tus clientes
          </p>
        </div>
        <Button onClick={() => {
          createForm.reset({
            customerId: '', title: '', description: '',
            appointmentDate: format(new Date(), 'yyyy-MM-dd'),
            appointmentTime: '09:00', appointmentEndTime: '', status: 'scheduled', notes: '',
          });
          setIsCreateOpen(true);
        }}>
          <Plus className="h-4 w-4 mr-2" />
          Nueva Cita
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold text-blue-600">
              {appointments.filter((a: any) => a.status === 'scheduled').length}
            </div>
            <p className="text-xs text-muted-foreground">Programadas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold text-green-600">
              {appointments.filter((a: any) => a.status === 'completed').length}
            </div>
            <p className="text-xs text-muted-foreground">Completadas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold text-red-600">
              {appointments.filter((a: any) => a.status === 'cancelled').length}
            </div>
            <p className="text-xs text-muted-foreground">Canceladas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold text-yellow-600">
              {appointments.filter((a: any) => a.status === 'no_show').length}
            </div>
            <p className="text-xs text-muted-foreground">No asistió</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="calendar">
            <CalendarDays className="h-4 w-4 mr-2" />
            Calendario
          </TabsTrigger>
          <TabsTrigger value="list">
            <Filter className="h-4 w-4 mr-2" />
            Lista
          </TabsTrigger>
        </TabsList>

        {/* ============== CALENDAR TAB ============== */}
        <TabsContent value="calendar">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Calendar */}
            <Card className="lg:col-span-2">
              <CardContent className="pt-6">
                <DayPicker
                  mode="single"
                  selected={selectedDay || undefined}
                  onSelect={(day) => setSelectedDay(day || null)}
                  month={calendarMonth}
                  onMonthChange={setCalendarMonth}
                  locale={es}
                  showOutsideDays
                  modifiers={{
                    hasAppointment: daysWithAppointments,
                  }}
                  modifiersStyles={{
                    hasAppointment: {
                      fontWeight: 'bold',
                      backgroundColor: 'rgb(219 234 254)',
                      borderRadius: '50%',
                    },
                  }}
                  className="mx-auto"
                  classNames={{
                    months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
                    month: "space-y-4 w-full",
                    caption: "flex justify-center pt-1 relative items-center",
                    caption_label: "text-base font-semibold",
                    nav: "space-x-1 flex items-center",
                    nav_button: cn(buttonVariants({ variant: "outline" }), "h-8 w-8 bg-transparent p-0 opacity-50 hover:opacity-100"),
                    nav_button_previous: "absolute left-1",
                    nav_button_next: "absolute right-1",
                    table: "w-full border-collapse",
                    head_row: "flex justify-around",
                    head_cell: "text-muted-foreground rounded-md w-12 font-normal text-sm",
                    row: "flex w-full mt-2 justify-around",
                    cell: "h-12 w-12 text-center text-sm p-0 relative cursor-pointer hover:bg-accent rounded-md",
                    day: cn(buttonVariants({ variant: "ghost" }), "h-12 w-12 p-0 font-normal aria-selected:opacity-100"),
                    day_range_end: "day-range-end",
                    day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
                    day_today: "bg-accent text-accent-foreground font-bold",
                    day_outside: "day-outside text-muted-foreground opacity-50",
                    day_disabled: "text-muted-foreground opacity-50",
                    day_hidden: "invisible",
                  }}
                />
              </CardContent>
            </Card>

            {/* Day Detail Panel */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  {selectedDay
                    ? format(selectedDay, "d 'de' MMMM, yyyy", { locale: es })
                    : 'Selecciona un día'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {selectedDay ? (
                  <div className="space-y-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => openCreateForDay(selectedDay)}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Agregar cita este día
                    </Button>

                    {selectedDayAppointments.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No hay citas para este día
                      </p>
                    ) : (
                      selectedDayAppointments.map((apt: any) => (
                        <Card key={apt.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => openEdit(apt)}>
                          <CardContent className="p-3 space-y-2">
                            <div className="flex justify-between items-start">
                              <h4 className="font-medium text-sm">{apt.title}</h4>
                              <StatusBadge status={apt.status} />
                            </div>
                            <div className="text-xs text-muted-foreground space-y-1">
                              <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {format(new Date(apt.appointmentDate), 'HH:mm')}
                                {apt.appointmentEndDate && ` - ${format(new Date(apt.appointmentEndDate), 'HH:mm')}`}
                              </div>
                              <div className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {apt.customerName}
                              </div>
                              {apt.customerPhone && (
                                <div className="flex items-center gap-1">
                                  <Phone className="h-3 w-3" />
                                  {apt.customerPhone}
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Haz clic en un día del calendario para ver sus citas
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ============== LIST TAB ============== */}
        <TabsContent value="list">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por título, cliente o teléfono..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los estados</SelectItem>
                    <SelectItem value="scheduled">Programadas</SelectItem>
                    <SelectItem value="completed">Completadas</SelectItem>
                    <SelectItem value="cancelled">Canceladas</SelectItem>
                    <SelectItem value="no_show">No asistió</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {filteredAppointments.length === 0 ? (
                <div className="text-center py-12">
                  <CalendarDays className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium">No hay citas</h3>
                  <p className="text-muted-foreground">
                    {searchTerm || statusFilter !== 'all'
                      ? 'No se encontraron citas con los filtros aplicados'
                      : 'Crea tu primera cita haciendo clic en "Nueva Cita"'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredAppointments.map((apt: any) => (
                    <Card key={apt.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex flex-col sm:flex-row justify-between gap-3">
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-semibold">{apt.title}</h4>
                              <StatusBadge status={apt.status} />
                            </div>
                            {apt.description && (
                              <p className="text-sm text-muted-foreground">{apt.description}</p>
                            )}
                            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <CalendarDays className="h-3.5 w-3.5" />
                                {format(new Date(apt.appointmentDate), "d MMM yyyy", { locale: es })}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5" />
                                {format(new Date(apt.appointmentDate), 'HH:mm')}
                                {apt.appointmentEndDate && ` - ${format(new Date(apt.appointmentEndDate), 'HH:mm')}`}
                              </span>
                              <span className="flex items-center gap-1">
                                <User className="h-3.5 w-3.5" />
                                {apt.customerName || 'Cliente sin nombre'}
                              </span>
                              {apt.customerPhone && (
                                <span className="flex items-center gap-1">
                                  <Phone className="h-3.5 w-3.5" />
                                  {apt.customerPhone}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Button size="sm" variant="outline" onClick={() => openEdit(apt)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700" onClick={() => openDelete(apt)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ============== CREATE DIALOG ============== */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva Cita</DialogTitle>
            <DialogDescription>Registra una nueva cita con un cliente</DialogDescription>
          </DialogHeader>
          <Form {...createForm}>
            <form onSubmit={createForm.handleSubmit(handleCreate)} className="space-y-4">
              <FormField control={createForm.control} name="customerId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Cliente *</FormLabel>
                  <FormControl>
                    <CustomerCombobox
                      value={field.value}
                      onChange={field.onChange}
                      customers={customerList}
                      onAddNew={() => {
                        newCustomerTargetRef.current = field.onChange;
                        newCustomerForm.reset();
                        setIsNewCustomerOpen(true);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={createForm.control} name="title" render={({ field }) => (
                <FormItem>
                  <FormLabel>Título *</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: Consulta inicial, Seguimiento..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={createForm.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel>Descripción</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Descripción opcional de la cita..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="grid grid-cols-2 gap-4">
                <FormField control={createForm.control} name="appointmentDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={createForm.control} name="appointmentTime" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hora inicio *</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <FormField control={createForm.control} name="appointmentEndTime" render={({ field }) => (
                <FormItem>
                  <FormLabel>Hora fin (opcional)</FormLabel>
                  <FormControl>
                    <Input type="time" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={createForm.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Notas adicionales..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Creando...' : 'Crear Cita'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ============== EDIT DIALOG ============== */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Cita</DialogTitle>
            <DialogDescription>Modifica los datos de la cita</DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(handleEdit)} className="space-y-4">
              <FormField control={editForm.control} name="customerId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Cliente *</FormLabel>
                  <FormControl>
                    <CustomerCombobox
                      value={field.value}
                      onChange={field.onChange}
                      customers={customerList}
                      onAddNew={() => {
                        newCustomerTargetRef.current = field.onChange;
                        newCustomerForm.reset();
                        setIsNewCustomerOpen(true);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={editForm.control} name="title" render={({ field }) => (
                <FormItem>
                  <FormLabel>Título *</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: Consulta inicial, Seguimiento..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={editForm.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel>Descripción</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Descripción opcional de la cita..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="grid grid-cols-2 gap-4">
                <FormField control={editForm.control} name="appointmentDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={editForm.control} name="appointmentTime" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hora inicio *</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <FormField control={editForm.control} name="appointmentEndTime" render={({ field }) => (
                <FormItem>
                  <FormLabel>Hora fin (opcional)</FormLabel>
                  <FormControl>
                    <Input type="time" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={editForm.control} name="status" render={({ field }) => (
                <FormItem>
                  <FormLabel>Estado</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="scheduled">Programada</SelectItem>
                      <SelectItem value="completed">Completada</SelectItem>
                      <SelectItem value="cancelled">Cancelada</SelectItem>
                      <SelectItem value="no_show">No asistió</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={editForm.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Notas adicionales..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? 'Guardando...' : 'Guardar Cambios'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* ============== DELETE DIALOG ============== */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar Cita</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que deseas eliminar la cita "{selectedAppointment?.title}"?
              Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => selectedAppointment && deleteMutation.mutate(selectedAppointment.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============== NEW CUSTOMER DIALOG ============== */}
      <Dialog open={isNewCustomerOpen} onOpenChange={setIsNewCustomerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-blue-600" />
              Agregar Nuevo Cliente
            </DialogTitle>
            <DialogDescription>
              Registra los datos del cliente para poder agendar su cita.
            </DialogDescription>
          </DialogHeader>
          <Form {...newCustomerForm}>
            <form
              onSubmit={newCustomerForm.handleSubmit((data) => createCustomerMutation.mutate(data))}
              className="space-y-4"
            >
              <FormField control={newCustomerForm.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre completo *</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: María García" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={newCustomerForm.control} name="phone" render={({ field }) => (
                <FormItem>
                  <FormLabel>Teléfono / WhatsApp *</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: 18095551234" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={newCustomerForm.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>Email *</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="Ej: maria@ejemplo.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsNewCustomerOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createCustomerMutation.isPending}>
                  {createCustomerMutation.isPending ? 'Guardando...' : 'Crear Cliente'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
