// client/src/pages/measurement-units.tsx
// Página de gestión de unidades de medida

import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Trash2, Search, Scale, Droplet, Box, Ruler, Eye, EyeOff } from 'lucide-react';

// Schema de validación
const measurementUnitSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  symbol: z.string().min(1, 'El símbolo es requerido').max(10, 'El símbolo no debe exceder 10 caracteres'),
  type: z.enum(['weight', 'volume', 'unit', 'length'], {
    required_error: 'Debes seleccionar un tipo de unidad',
  }),
  abbreviation: z.string().optional(),
  sortOrder: z.number().min(0).default(0),
  isActive: z.boolean().default(true),
});

type MeasurementUnitFormData = z.infer<typeof measurementUnitSchema>;

interface MeasurementUnit {
  id: number;
  name: string;
  symbol: string;
  type: 'weight' | 'volume' | 'unit' | 'length';
  abbreviation?: string;
  isActive: boolean;
  sortOrder: number;
  storeId: number;
  createdAt: string;
  updatedAt: string;
}

const MeasurementUnitsManagement = () => {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [editingUnit, setEditingUnit] = useState<MeasurementUnit | null>(null);
  const [deletingUnit, setDeletingUnit] = useState<MeasurementUnit | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'weight' | 'volume' | 'unit' | 'length'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch measurement units
  const { data: units = [], isLoading } = useQuery<MeasurementUnit[]>({
    queryKey: ['/api/measurement-units'],
    queryFn: async () => {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/measurement-units', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!response.ok) throw new Error('Error al cargar unidades de medida');
      return response.json();
    },
  });

  // Create unit mutation
  const createUnitMutation = useMutation({
    mutationFn: async (data: MeasurementUnitFormData) => {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/measurement-units', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error al crear unidad de medida');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/measurement-units'] });
      setShowCreateDialog(false);
      createForm.reset();
      toast({
        title: 'Unidad creada',
        description: 'La unidad de medida se creó correctamente',
      });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    },
  });

  // Update unit mutation
  const updateUnitMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<MeasurementUnitFormData> }) => {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/measurement-units/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error al actualizar unidad de medida');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/measurement-units'] });
      setShowEditDialog(false);
      setEditingUnit(null);
      editForm.reset();
      toast({
        title: 'Unidad actualizada',
        description: 'La unidad de medida se actualizó correctamente',
      });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    },
  });

  // Delete unit mutation
  const deleteUnitMutation = useMutation({
    mutationFn: async (id: number) => {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/measurement-units/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error al eliminar unidad de medida');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/measurement-units'] });
      setShowDeleteDialog(false);
      setDeletingUnit(null);
      toast({
        title: 'Unidad desactivada',
        description: 'La unidad de medida se desactivó correctamente',
      });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    },
  });

  // Forms
  const createForm = useForm<MeasurementUnitFormData>({
    resolver: zodResolver(measurementUnitSchema),
    defaultValues: {
      name: '',
      symbol: '',
      type: 'weight',
      abbreviation: '',
      sortOrder: 0,
      isActive: true,
    },
  });

  const editForm = useForm<MeasurementUnitFormData>({
    resolver: zodResolver(measurementUnitSchema),
  });

  // Handle edit
  const handleEdit = (unit: MeasurementUnit) => {
    setEditingUnit(unit);
    editForm.reset({
      name: unit.name,
      symbol: unit.symbol,
      type: unit.type,
      abbreviation: unit.abbreviation || '',
      sortOrder: unit.sortOrder,
      isActive: unit.isActive,
    });
    setShowEditDialog(true);
  };

  // Handle delete
  const handleDelete = (unit: MeasurementUnit) => {
    setDeletingUnit(unit);
    setShowDeleteDialog(true);
  };

  // Filter units
  const filteredUnits = useMemo(() => {
    return units.filter((unit) => {
      const matchesSearch =
        unit.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        unit.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
        unit.abbreviation?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesType = filterType === 'all' || unit.type === filterType;
      const matchesStatus =
        filterStatus === 'all' ||
        (filterStatus === 'active' && unit.isActive) ||
        (filterStatus === 'inactive' && !unit.isActive);

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [units, searchTerm, filterType, filterStatus]);

  // Get type icon
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'weight':
        return <Scale className="h-4 w-4" />;
      case 'volume':
        return <Droplet className="h-4 w-4" />;
      case 'unit':
        return <Box className="h-4 w-4" />;
      case 'length':
        return <Ruler className="h-4 w-4" />;
      default:
        return null;
    }
  };

  // Get type label
  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'weight':
        return 'Peso';
      case 'volume':
        return 'Volumen';
      case 'unit':
        return 'Unidad';
      case 'length':
        return 'Longitud';
      default:
        return type;
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-2xl">Unidades de Medida</CardTitle>
              <CardDescription>
                Gestiona las unidades de medida disponibles para tus productos
              </CardDescription>
            </div>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Nueva Unidad
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filtros y búsqueda */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre, símbolo o abreviación..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filterType} onValueChange={(value: any) => setFilterType(value)}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                <SelectItem value="weight">Peso</SelectItem>
                <SelectItem value="volume">Volumen</SelectItem>
                <SelectItem value="unit">Unidad</SelectItem>
                <SelectItem value="length">Longitud</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={(value: any) => setFilterStatus(value)}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Activas</SelectItem>
                <SelectItem value="inactive">Inactivas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Tabla de unidades */}
          {isLoading ? (
            <div className="text-center py-8">Cargando unidades...</div>
          ) : filteredUnits.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No se encontraron unidades de medida
            </div>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Símbolo</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Abreviación</TableHead>
                    <TableHead className="text-center">Orden</TableHead>
                    <TableHead className="text-center">Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUnits.map((unit) => (
                    <TableRow key={unit.id}>
                      <TableCell className="font-medium">{unit.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{unit.symbol}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getTypeIcon(unit.type)}
                          <span>{getTypeLabel(unit.type)}</span>
                        </div>
                      </TableCell>
                      <TableCell>{unit.abbreviation || '-'}</TableCell>
                      <TableCell className="text-center">{unit.sortOrder}</TableCell>
                      <TableCell className="text-center">
                        {unit.isActive ? (
                          <Badge variant="default" className="gap-1">
                            <Eye className="h-3 w-3" />
                            Activa
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="gap-1">
                            <EyeOff className="h-3 w-3" />
                            Inactiva
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(unit)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(unit)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog: Crear Unidad */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva Unidad de Medida</DialogTitle>
            <DialogDescription>
              Crea una nueva unidad de medida para tus productos
            </DialogDescription>
          </DialogHeader>
          <Form {...createForm}>
            <form
              onSubmit={createForm.handleSubmit((data) => createUnitMutation.mutate(data))}
              className="space-y-4"
            >
              <FormField
                control={createForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej: Kilogramo" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={createForm.control}
                name="symbol"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Símbolo</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej: kg" {...field} />
                    </FormControl>
                    <FormDescription>
                      Símbolo corto que representa la unidad
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={createForm.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona un tipo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="weight">Peso</SelectItem>
                        <SelectItem value="volume">Volumen</SelectItem>
                        <SelectItem value="unit">Unidad (contable)</SelectItem>
                        <SelectItem value="length">Longitud</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Solo se pueden convertir unidades del mismo tipo
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={createForm.control}
                name="abbreviation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Abreviación (Opcional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej: kilo" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={createForm.control}
                name="sortOrder"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Orden de visualización</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormDescription>
                      Número para ordenar las unidades en listas
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={createForm.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Activa</FormLabel>
                      <FormDescription>
                        Las unidades inactivas no se mostrarán en los selectores
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createUnitMutation.isPending}>
                  {createUnitMutation.isPending ? 'Creando...' : 'Crear Unidad'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Editar Unidad */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Unidad de Medida</DialogTitle>
            <DialogDescription>
              Modifica los datos de la unidad de medida
            </DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form
              onSubmit={editForm.handleSubmit((data) =>
                updateUnitMutation.mutate({ id: editingUnit!.id, data })
              )}
              className="space-y-4"
            >
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej: Kilogramo" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="symbol"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Símbolo</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej: kg" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="weight">Peso</SelectItem>
                        <SelectItem value="volume">Volumen</SelectItem>
                        <SelectItem value="unit">Unidad (contable)</SelectItem>
                        <SelectItem value="length">Longitud</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="abbreviation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Abreviación (Opcional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej: kilo" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="sortOrder"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Orden de visualización</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Activa</FormLabel>
                      <FormDescription>
                        Las unidades inactivas no se mostrarán en los selectores
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowEditDialog(false);
                    setEditingUnit(null);
                  }}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={updateUnitMutation.isPending}>
                  {updateUnitMutation.isPending ? 'Actualizando...' : 'Actualizar'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Confirmar Eliminación */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Desactivar unidad de medida?</DialogTitle>
            <DialogDescription>
              La unidad "{deletingUnit?.name}" será desactivada y no estará disponible para nuevas conversiones.
              Las conversiones existentes no se verán afectadas.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowDeleteDialog(false);
                setDeletingUnit(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteUnitMutation.mutate(deletingUnit!.id)}
              disabled={deleteUnitMutation.isPending}
            >
              {deleteUnitMutation.isPending ? 'Desactivando...' : 'Desactivar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MeasurementUnitsManagement;
