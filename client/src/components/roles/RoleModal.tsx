import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';

const roleSchema = z.object({
  name: z
    .string()
    .min(2, 'Mínimo 2 caracteres')
    .max(50, 'Máximo 50 caracteres')
    .regex(/^[a-z_]+$/, 'Solo minúsculas y guiones bajos (ej: supervisor, gerente_ventas)'),
  displayName: z.string().min(2, 'Mínimo 2 caracteres').max(100, 'Máximo 100 caracteres'),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
});

type RoleFormData = z.infer<typeof roleSchema>;

interface RoleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role?: any; // Si se pasa, es edición, si no, es creación
  onSuccess: (data: any) => void;
}

async function apiCall(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('auth_token');
  const response = await fetch(endpoint, {
    ...options,
    headers: { ...options.headers, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Error en la petición');
  }
  return response.json();
}

export function RoleModal({ open, onOpenChange, role, onSuccess }: RoleModalProps) {
  const { toast } = useToast();
  const isEditing = !!role;

  const form = useForm<RoleFormData>({
    resolver: zodResolver(roleSchema),
    defaultValues: {
      name: role?.name || '',
      displayName: role?.display_name || '',
      description: role?.description || '',
      isActive: role?.is_active ?? true,
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: RoleFormData) =>
      apiCall('/api/roles', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: (data) => {
      toast({ title: '✅ Rol creado exitosamente' });
      form.reset();
      onSuccess(data);
    },
    onError: (error: any) => {
      toast({
        title: 'Error al crear rol',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: RoleFormData) =>
      apiCall(`/api/roles/${role.id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    onSuccess: (data) => {
      toast({ title: '✅ Rol actualizado exitosamente' });
      form.reset();
      onSuccess(data);
    },
    onError: (error: any) => {
      toast({
        title: 'Error al actualizar rol',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (data: RoleFormData) => {
    if (isEditing) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar Rol' : 'Crear Nuevo Rol'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Modifica la información del rol. Los cambios se aplicarán a todos los usuarios con este rol.'
              : 'Define un nuevo rol personalizado y luego asigna los permisos de acceso a las vistas.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Identificador del Rol</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="ej: gerente_ventas, supervisor"
                      disabled={isEditing}
                    />
                  </FormControl>
                  <FormDescription>
                    Solo minúsculas y guiones bajos. No se puede cambiar después de crear.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre para Mostrar</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="ej: Gerente de Ventas, Supervisor" />
                  </FormControl>
                  <FormDescription>
                    Este nombre se mostrará en la interfaz de usuario.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descripción (Opcional)</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Describe las funciones y responsabilidades de este rol..."
                      rows={3}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Rol Activo</FormLabel>
                    <FormDescription>
                      Los roles inactivos no pueden ser asignados a nuevos usuarios.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {isEditing ? 'Actualizar Rol' : 'Crear Rol'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
