import React, { useEffect, useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, ChevronsUpDown, UserPlus, Star, Stethoscope, User, CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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

// ─── API helper ───────────────────────────────────────────────────────────────
async function apiCall(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('auth_token');
  const response = await fetch(endpoint, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Error desconocido' }));
    throw new Error(err.error || `Error ${response.status}`);
  }
  return response.json();
}

// ─── Schemas ──────────────────────────────────────────────────────────────────
const newCustomerSchema = z.object({
  name: z.string().min(2, 'El nombre es requerido (mínimo 2 caracteres)'),
  phone: z.string().min(7, 'El teléfono es requerido'),
  email: z.union([z.string().email('Email inválido'), z.literal('')]).optional(),
  birthdayDate: z.string().optional(),
});
type NewCustomerFormData = z.infer<typeof newCustomerSchema>;

const appointmentFormSchema = z.object({
  customerId: z.string().min(1, 'Seleccione un cliente'),
  titularId: z.string().optional(),
  serviceTypeId: z.string().optional(),
  title: z.string().min(1, 'El título es requerido'),
  description: z.string().optional(),
  appointmentDate: z.string().min(1, 'La fecha es requerida'),
  appointmentTime: z.string().min(1, 'La hora es requerida'),
  appointmentEndTime: z.string().optional(),
  price: z.string().optional(),
  notes: z.string().optional(),
});
type AppointmentFormData = z.infer<typeof appointmentFormSchema>;

// ─── CustomerCombobox ─────────────────────────────────────────────────────────
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
  const [search, setSearch] = useState('');
  const selected = customers.find((c) => String(c.id) === value);
  const trimmedSearch = search.trim().toLowerCase();
  const suggestions = trimmedSearch.length === 0
    ? []
    : customers
      .filter((c) =>
        c.name.toLowerCase().includes(trimmedSearch) ||
        c.phone.toLowerCase().includes(trimmedSearch),
      )
      .slice(0, 10);

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setSearch('');
      }}
    >
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
          <CommandInput
            placeholder="Escribe nombre o teléfono para sugerencias..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {trimmedSearch.length === 0 ? (
              <div className="px-3 py-4 text-sm text-muted-foreground">
                Escribe para ver clientes sugeridos.
              </div>
            ) : suggestions.length === 0 ? (
              <CommandEmpty>No se encontró ningún cliente.</CommandEmpty>
            ) : (
              <CommandGroup heading="Sugeridos">
                {suggestions.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`${c.name} ${c.phone}`}
                    onSelect={() => {
                      onChange(String(c.id));
                      setOpen(false);
                      setSearch('');
                    }}
                  >
                    <Check
                      className={cn('mr-2 h-4 w-4', String(c.id) === value ? 'opacity-100' : 'opacity-0')}
                    />
                    <div>
                      <span className="font-medium">{c.name}</span>
                      {c.phone && (
                        <span className="ml-2 text-xs text-muted-foreground">{c.phone}</span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            <CommandSeparator />
            <CommandGroup>
              <CommandItem
                onSelect={() => {
                  setOpen(false);
                  setSearch('');
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

// ─── Main Component ───────────────────────────────────────────────────────────
interface AppointmentQuickCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode?: 'schedule' | 'walkin';
}

export function AppointmentQuickCreateDialog({
  open,
  onOpenChange,
  mode = 'schedule',
}: AppointmentQuickCreateDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isNewCustomerOpen, setIsNewCustomerOpen] = useState(false);
  const newCustomerTargetRef = useRef<((val: string) => void) | null>(null);

  const getLocalNow = () => {
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    return { date, time };
  };

  const nowDefaults = getLocalNow();

  // Queries
  const { data: customers = [] } = useQuery({
    queryKey: ['/api/customers'],
    queryFn: () => apiCall('/api/customers'),
    enabled: open,
  });

  const { data: titulares = [] } = useQuery({
    queryKey: ['/api/appointment-titulares'],
    queryFn: () => apiCall('/api/appointment-titulares'),
    enabled: open,
  });

  const { data: serviceTypes = [] } = useQuery({
    queryKey: ['/api/appointment-service-types'],
    queryFn: () => apiCall('/api/appointment-service-types'),
    enabled: open,
  });

  const customerList = (customers as any[]).map((c: any) => ({
    id: c.id,
    name: c.name,
    phone: c.phone || '',
  }));

  // Create appointment mutation
  const createMutation = useMutation({
    mutationFn: (data: any) => apiCall('/api/appointments', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/appointments'] });
      queryClient.invalidateQueries({ queryKey: ['appointments-today'] });
      toast({ title: 'Cita creada', description: 'La cita fue agendada exitosamente.' });
      onOpenChange(false);
      const current = getLocalNow();
      createForm.reset({
        customerId: '',
        titularId: 'none',
        serviceTypeId: 'none',
        title: mode === 'walkin' ? 'Atencion sin cita' : '',
        description: '',
        appointmentDate: current.date,
        appointmentTime: mode === 'walkin' ? current.time : '',
        appointmentEndTime: '',
        price: '0',
        notes: '',
      });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  // Create customer mutation
  const createCustomerMutation = useMutation({
    mutationFn: (data: any) => apiCall('/api/customers', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: (newCustomer: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      if (newCustomerTargetRef.current) {
        newCustomerTargetRef.current(String(newCustomer.id));
        newCustomerTargetRef.current = null;
      }
      setIsNewCustomerOpen(false);
      newCustomerForm.reset();
      toast({ title: 'Cliente creado', description: `${newCustomer.name} fue registrado.` });
    },
    onError: (err: Error) => {
      toast({ title: 'Error al crear cliente', description: err.message, variant: 'destructive' });
    },
  });

  // Forms
  const createForm = useForm<AppointmentFormData>({
    resolver: zodResolver(appointmentFormSchema),
    defaultValues: {
      customerId: '',
      titularId: 'none',
      serviceTypeId: 'none',
      title: mode === 'walkin' ? 'Atencion sin cita' : '',
      description: '',
      appointmentDate: nowDefaults.date,
      appointmentTime: mode === 'walkin' ? nowDefaults.time : '',
      appointmentEndTime: '',
      price: '0',
      notes: '',
    },
  });

  useEffect(() => {
    if (!open) return;
    const current = getLocalNow();
    createForm.reset({
      customerId: '',
      titularId: 'none',
      serviceTypeId: 'none',
      title: mode === 'walkin' ? 'Atencion sin cita' : '',
      description: '',
      appointmentDate: current.date,
      appointmentTime: mode === 'walkin' ? current.time : '',
      appointmentEndTime: '',
      price: '0',
      notes: '',
    });
  }, [open, mode, createForm]);

  const newCustomerForm = useForm<NewCustomerFormData>({
    resolver: zodResolver(newCustomerSchema),
    defaultValues: { name: '', phone: '', email: '' },
  });

  function handleCreate(data: AppointmentFormData) {
    const appointmentDate = `${data.appointmentDate}T${data.appointmentTime}:00`;
    const appointmentEndDate = data.appointmentEndTime
      ? `${data.appointmentDate}T${data.appointmentEndTime}:00`
      : null;

    createMutation.mutate({
      customerId: parseInt(data.customerId),
      titularId: data.titularId && data.titularId !== 'none' ? parseInt(data.titularId) : null,
      serviceTypeId: data.serviceTypeId && data.serviceTypeId !== 'none' ? parseInt(data.serviceTypeId) : null,
      title: data.title,
      description: data.description || null,
      appointmentDate,
      appointmentEndDate,
      status: mode === 'walkin' ? 'completed' : 'scheduled',
      price: data.price || '0',
      paymentStatus: 'pending',
      notes: data.notes || null,
    });
  }

  function handleCreateCustomer(data: NewCustomerFormData) {
    createCustomerMutation.mutate({
      name: data.name,
      phone: data.phone,
      email: data.email,
      birthdayDate: data.birthdayDate || null,
    });
  }

  return (
    <>
      {/* Main appointment dialog */}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              {mode === 'walkin' ? 'Atender sin cita' : 'Nueva Cita'}
            </DialogTitle>
            <DialogDescription>
              {mode === 'walkin'
                ? 'Registra la atencion inmediata y guarda la cita en el historico para cobrarla en POS.'
                : 'Agenda una nueva cita desde el POS'}
            </DialogDescription>
          </DialogHeader>
          <Form {...createForm}>
            <form onSubmit={createForm.handleSubmit(handleCreate)} className="space-y-4">
              {/* Cliente */}
              <FormField
                control={createForm.control}
                name="customerId"
                render={({ field }) => (
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
                )}
              />

              {/* Titular */}
              <FormField
                control={createForm.control}
                name="titularId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Titular (Consultor/a)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || 'none'}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar titular..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">Sin titular</SelectItem>
                        {(titulares as any[])
                          .filter((t: any) => t.isActive)
                          .map((t: any) => (
                            <SelectItem key={t.id} value={String(t.id)}>
                              {t.name}
                              {t.specialty ? ` — ${t.specialty}` : ''}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Servicio / Programa */}
              <FormField
                control={createForm.control}
                name="serviceTypeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Servicio / Programa Especial</FormLabel>
                    <Select
                      onValueChange={(val) => {
                        field.onChange(val);
                        if (val && val !== 'none') {
                          const svc = (serviceTypes as any[]).find((s: any) => String(s.id) === val);
                          if (svc && (svc.basePrice || svc.base_price)) {
                            createForm.setValue('price', String(svc.basePrice || svc.base_price || '0'));
                          }
                        }
                      }}
                      value={field.value || 'none'}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar servicio..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">Sin servicio</SelectItem>
                        {(serviceTypes as any[]).filter(
                          (s: any) => s.category === 'programa_especial' && s.isActive,
                        ).length > 0 && (
                          <>
                            <div className="px-2 py-1 text-xs font-semibold text-purple-700 flex items-center gap-1">
                              <Star className="h-3 w-3" /> Programas Especiales
                            </div>
                            {(serviceTypes as any[])
                              .filter((s: any) => s.category === 'programa_especial' && s.isActive)
                              .map((s: any) => (
                                <SelectItem key={s.id} value={String(s.id)}>
                                  ⭐ {s.name}
                                </SelectItem>
                              ))}
                          </>
                        )}
                        {(serviceTypes as any[]).filter(
                          (s: any) => s.category === 'general' && s.isActive,
                        ).length > 0 && (
                          <>
                            <div className="px-2 py-1 text-xs font-semibold text-blue-700 flex items-center gap-1 mt-1">
                              <Stethoscope className="h-3 w-3" /> Servicios Generales
                            </div>
                            {(serviceTypes as any[])
                              .filter((s: any) => s.category === 'general' && s.isActive)
                              .map((s: any) => (
                                <SelectItem key={s.id} value={String(s.id)}>
                                  {s.name}
                                </SelectItem>
                              ))}
                          </>
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Título */}
              <FormField
                control={createForm.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Título *</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej: Consulta inicial, Seguimiento..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Fecha y hora */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={createForm.control}
                  name="appointmentDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fecha *</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={createForm.control}
                  name="appointmentTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hora inicio *</FormLabel>
                      <FormControl>
                        <Input type="time" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={createForm.control}
                name="appointmentEndTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hora fin (opcional)</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={createForm.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Precio de la cita (DOP)</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" step="0.01" placeholder="0.00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={createForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notas</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Notas adicionales..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Guardando...' : mode === 'walkin' ? 'Registrar atencion' : 'Crear Cita'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* New customer sub-dialog */}
      <Dialog open={isNewCustomerOpen} onOpenChange={setIsNewCustomerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo Cliente</DialogTitle>
            <DialogDescription>Registra un nuevo cliente rápidamente</DialogDescription>
          </DialogHeader>
          <Form {...newCustomerForm}>
            <form onSubmit={newCustomerForm.handleSubmit(handleCreateCustomer)} className="space-y-4">
              <FormField
                control={newCustomerForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre *</FormLabel>
                    <FormControl>
                      <Input placeholder="Nombre completo" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={newCustomerForm.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Teléfono *</FormLabel>
                    <FormControl>
                      <Input placeholder="+58 412 000 0000" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={newCustomerForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email (opcional)</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="cliente@email.com (opcional)" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={newCustomerForm.control}
                name="birthdayDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha de cumpleaños</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsNewCustomerOpen(false)}
                >
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
    </>
  );
}
