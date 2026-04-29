// client/src/components/product-unit-conversions.tsx
// Componente para gestionar conversiones de unidades en productos

import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import {
  Plus,
  Edit,
  Trash2,
  Scale,
  ArrowRight,
  Zap,
  AlertCircle,
  CheckCircle,
  DollarSign,
} from 'lucide-react';

// Tipos
interface MeasurementUnit {
  id: number;
  storeId: number;
  name: string;
  symbol: string;
  type: 'weight' | 'volume' | 'unit' | 'length';
  abbreviation?: string;
  isActive: boolean;
  sortOrder: number;
}

interface ProductUnitConversion {
  id: number;
  productId: number;
  sourceUnitId: number;
  targetUnitId: number;
  conversionFactor: string;
  isActive: boolean;
  notes?: string;
  sourceUnit?: MeasurementUnit;
  targetUnit?: MeasurementUnit;
}

interface Product {
  id: number;
  name: string;
  unitConversionEnabled?: boolean;
  baseUnitId?: number;
  stockQuantity?: number;
  price?: string;
  currency?: string;
  loyaltyPointsValue?: string;
  loyaltyPointsPropertyName?: string;
}

// Esquema de validación
const conversionSchema = z.object({
  sourceUnitId: z.number().min(1, 'Selecciona la unidad origen'),
  targetUnitId: z.number().min(1, 'Selecciona la unidad destino'),
  conversionFactor: z.string().min(1, 'El factor de conversión es requerido'),
  notes: z.string().optional(),
  bidirectional: z.boolean().default(true),
});

type ConversionFormData = z.infer<typeof conversionSchema>;

const setupConversionsSchema = z.object({
  baseUnitSymbol: z.string().min(1, 'Selecciona la unidad base'),
  unitsToConvert: z.array(z.string()).min(1, 'Selecciona al menos una unidad'),
});

type SetupConversionsFormData = z.infer<typeof setupConversionsSchema>;

const createUnitSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  symbol: z.string().min(1, 'El símbolo es requerido'),
  type: z.enum(['weight', 'volume', 'unit', 'length'], {
    errorMap: () => ({ message: 'Selecciona un tipo válido' })
  }),
  abbreviation: z.string().optional(),
});

type CreateUnitFormData = z.infer<typeof createUnitSchema>;

interface ProductUnitConversionsProps {
  productId: number;
  product?: Product;
  onUpdateProduct?: () => void;
}

export default function ProductUnitConversions({
  productId,
  product,
  onUpdateProduct
}: ProductUnitConversionsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showSetupDialog, setShowSetupDialog] = useState(false);
  const [showCreateUnitDialog, setShowCreateUnitDialog] = useState(false);
  const [unitCreationContext, setUnitCreationContext] = useState<'source' | 'target' | null>(null);
  const [selectedConversion, setSelectedConversion] = useState<ProductUnitConversion | null>(null);
  const [selectedUnitsForSetup, setSelectedUnitsForSetup] = useState<string[]>([]);

  // Queries
  const { data: conversions = [], isLoading: loadingConversions } = useQuery<ProductUnitConversion[]>({
    queryKey: [`/api/products/${productId}/unit-conversions`],
    enabled: !!productId,
  });

  const { data: availableUnits = [], isLoading: loadingUnits } = useQuery<MeasurementUnit[]>({
    queryKey: [`/api/products/${productId}/available-units`],
    enabled: !!productId,
  });

  const { data: allUnits = [] } = useQuery<MeasurementUnit[]>({
    queryKey: ['/api/measurement-units/active'],
  });

  // Mutations
  const createConversionMutation = useMutation({
    mutationFn: async (data: ConversionFormData) => {
      const response = await fetch(`/api/products/${productId}/unit-conversions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error al crear conversión');
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Conversión creada',
        description: 'La conversión se ha creado correctamente',
      });
      queryClient.invalidateQueries({ queryKey: [`/api/products/${productId}/unit-conversions`] });
      queryClient.invalidateQueries({ queryKey: [`/api/products/${productId}/available-units`] });
      setShowCreateDialog(false);
      createForm.reset();
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updateConversionMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<ConversionFormData> }) => {
      const response = await fetch(`/api/products/${productId}/unit-conversions/${id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error al actualizar conversión');
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Conversión actualizada',
        description: 'La conversión se ha actualizado correctamente',
      });
      queryClient.invalidateQueries({ queryKey: [`/api/products/${productId}/unit-conversions`] });
      setShowEditDialog(false);
      setSelectedConversion(null);
      editForm.reset();
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deleteConversionMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/products/${productId}/unit-conversions/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error al eliminar conversión');
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Conversión eliminada',
        description: 'La conversión se ha eliminado correctamente',
      });
      queryClient.invalidateQueries({ queryKey: [`/api/products/${productId}/unit-conversions`] });
      queryClient.invalidateQueries({ queryKey: [`/api/products/${productId}/available-units`] });
      setShowDeleteDialog(false);
      setSelectedConversion(null);
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const setupCommonConversionsMutation = useMutation({
    mutationFn: async (data: SetupConversionsFormData) => {
      const response = await fetch(`/api/products/${productId}/setup-common-conversions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error al configurar conversiones');
      }

      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Conversiones configuradas',
        description: `Se crearon ${data.conversions?.length || 0} conversiones correctamente`,
      });
      queryClient.invalidateQueries({ queryKey: [`/api/products/${productId}/unit-conversions`] });
      queryClient.invalidateQueries({ queryKey: [`/api/products/${productId}/available-units`] });
      setShowSetupDialog(false);
      setSelectedUnitsForSetup([]);
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const toggleConversionEnabledMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const response = await fetch(`/api/products/${productId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          unitConversionEnabled: enabled,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error al actualizar producto');
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Producto actualizado',
        description: 'La configuración de conversión se ha actualizado',
      });
      if (onUpdateProduct) {
        onUpdateProduct();
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const setBaseUnitMutation = useMutation({
    mutationFn: async (baseUnitId: number) => {
      const response = await fetch(`/api/products/${productId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          baseUnitId,
          unitConversionEnabled: true,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error al actualizar producto');
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Unidad base configurada',
        description: 'La unidad base se ha configurado correctamente',
      });
      if (onUpdateProduct) {
        onUpdateProduct();
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const createUnitMutation = useMutation({
    mutationFn: async (data: CreateUnitFormData) => {
      const response = await fetch('/api/measurement-units', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error al crear unidad de medida');
      }

      return response.json();
    },
    onSuccess: (newUnit) => {
      toast({
        title: 'Unidad creada',
        description: `La unidad "${newUnit.name}" se ha creado correctamente`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/measurement-units/active'] });

      // Seleccionar automáticamente la nueva unidad en el campo correspondiente
      if (unitCreationContext === 'source') {
        createForm.setValue('sourceUnitId', newUnit.id);
      } else if (unitCreationContext === 'target') {
        createForm.setValue('targetUnitId', newUnit.id);
      }

      setShowCreateUnitDialog(false);
      setUnitCreationContext(null);
      createUnitForm.reset();
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Forms
  const createForm = useForm<ConversionFormData>({
    resolver: zodResolver(conversionSchema),
    defaultValues: {
      bidirectional: true,
    },
  });

  const editForm = useForm<ConversionFormData>({
    resolver: zodResolver(conversionSchema),
  });

  const createUnitForm = useForm<CreateUnitFormData>({
    resolver: zodResolver(createUnitSchema),
    defaultValues: {
      type: 'unit',
    },
  });

  // Handlers
  const handleCreate = (data: ConversionFormData) => {
    createConversionMutation.mutate(data);
  };

  const handleEdit = (data: ConversionFormData) => {
    if (!selectedConversion) return;
    updateConversionMutation.mutate({
      id: selectedConversion.id,
      data: {
        conversionFactor: data.conversionFactor,
        notes: data.notes,
      },
    });
  };

  const handleDelete = () => {
    if (!selectedConversion) return;
    deleteConversionMutation.mutate(selectedConversion.id);
  };

  const handleSetupCommonConversions = () => {
    if (!product?.baseUnitId || selectedUnitsForSetup.length === 0) {
      toast({
        title: 'Error',
        description: 'Debes seleccionar al menos una unidad',
        variant: 'destructive',
      });
      return;
    }

    const baseUnit = allUnits.find(u => u.id === product.baseUnitId);
    if (!baseUnit) {
      toast({
        title: 'Error',
        description: 'No se encontró la unidad base',
        variant: 'destructive',
      });
      return;
    }

    setupCommonConversionsMutation.mutate({
      baseUnitSymbol: baseUnit.symbol,
      unitsToConvert: selectedUnitsForSetup,
    });
  };

  const openEditDialog = (conversion: ProductUnitConversion) => {
    setSelectedConversion(conversion);
    editForm.reset({
      sourceUnitId: conversion.sourceUnitId,
      targetUnitId: conversion.targetUnitId,
      conversionFactor: conversion.conversionFactor,
      notes: conversion.notes,
      bidirectional: false,
    });
    setShowEditDialog(true);
  };

  const openDeleteDialog = (conversion: ProductUnitConversion) => {
    setSelectedConversion(conversion);
    setShowDeleteDialog(true);
  };

  const openCreateUnitDialog = (context: 'source' | 'target') => {
    setUnitCreationContext(context);
    setShowCreateUnitDialog(true);
  };

  const handleCreateUnit = (data: CreateUnitFormData) => {
    createUnitMutation.mutate(data);
  };

  // Get base unit info
  const baseUnit = useMemo(() => {
    if (!product?.baseUnitId) return null;
    return allUnits.find(u => u.id === product.baseUnitId);
  }, [product?.baseUnitId, allUnits]);

  // Filter units for setup (same type as base unit, excluding already configured)
  const unitsForSetup = useMemo(() => {
    if (!baseUnit) return [];

    const configuredUnitIds = new Set(
      conversions.flatMap(c => [c.sourceUnitId, c.targetUnitId])
    );

    return allUnits.filter(u =>
      u.type === baseUnit.type &&
      u.id !== baseUnit.id &&
      !configuredUnitIds.has(u.id)
    );
  }, [baseUnit, allUnits, conversions]);

  // Calculate price and loyalty points per base unit from conversions
  const pricePerBaseUnitData = useMemo(() => {
    if (!product?.baseUnitId || !product?.price) return [];
    const productPrice = parseFloat(product.price || '0');
    if (isNaN(productPrice) || productPrice <= 0) return [];
    const loyaltyPoints = parseFloat(product?.loyaltyPointsValue || '0');

    // Find conversions where targetUnit = baseUnit (e.g., frasco → cápsula)
    const toBaseConversions = conversions.filter(
      c => c.targetUnitId === product.baseUnitId && c.isActive,
    );

    return toBaseConversions
      .map(conv => {
        const factor = parseFloat(conv.conversionFactor);
        if (isNaN(factor) || factor <= 0) return null;
        return {
          conv,
          factor,
          pricePerUnit: productPrice / factor,
          pointsPerUnit: loyaltyPoints > 0 ? loyaltyPoints / factor : null,
        };
      })
      .filter(Boolean) as Array<{
        conv: ProductUnitConversion;
        factor: number;
        pricePerUnit: number;
        pointsPerUnit: number | null;
      }>;
  }, [product?.baseUnitId, product?.price, product?.loyaltyPointsValue, conversions]);

  if (loadingConversions || loadingUnits) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Configuration Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Scale className="w-5 h-5" />
                Conversión de Unidades
              </CardTitle>
              <CardDescription>
                Configura las conversiones entre diferentes unidades para este producto
              </CardDescription>
            </div>
            <Switch
              checked={product?.unitConversionEnabled || false}
              onCheckedChange={(checked) => toggleConversionEnabledMutation.mutate(checked)}
            />
          </div>
        </CardHeader>

        {product?.unitConversionEnabled && (
          <CardContent className="space-y-4">
            {/* Base Unit Selection */}
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <Label className="text-sm font-medium text-blue-900 mb-2 block">
                Unidad Base del Producto
              </Label>
              <Select
                value={product?.baseUnitId?.toString() || ''}
                onValueChange={(value) => setBaseUnitMutation.mutate(parseInt(value))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecciona la unidad base" />
                </SelectTrigger>
                <SelectContent>
                  {allUnits.map((unit) => (
                    <SelectItem key={unit.id} value={unit.id.toString()}>
                      {unit.name} ({unit.symbol}) - {unit.type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {baseUnit && (
                <p className="text-xs text-blue-700 mt-2">
                  El inventario se manejará en <strong>{baseUnit.symbol}</strong>.
                  Stock actual: <strong>{product?.stockQuantity || 0} {baseUnit.symbol}</strong>
                </p>
              )}
            </div>

            {/* Precio y Puntos por Unidad Base */}
            {baseUnit && pricePerBaseUnitData.length > 0 && (
              <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                <Label className="text-sm font-medium text-green-900 mb-3 flex items-center gap-2">
                  <DollarSign className="w-4 h-4" />
                  Precio y Puntos por Unidad Base ({baseUnit.symbol})
                </Label>
                <div className="space-y-2">
                  {pricePerBaseUnitData.map(({ conv, factor, pricePerUnit, pointsPerUnit }) => (
                    <div key={conv.id} className="rounded-md bg-white p-3 border border-green-100 text-sm">
                      <div className="text-xs text-green-600 mb-2">
                        1 <strong>{conv.sourceUnit?.symbol}</strong> = {factor} {baseUnit.symbol}
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-green-700 font-medium">Precio por 1 {baseUnit.symbol}</span>
                        <Badge className="bg-green-100 text-green-800 border border-green-300 font-mono">
                          {product?.currency === 'USD' ? '$' : 'RD$'} {pricePerUnit.toFixed(4)}
                        </Badge>
                      </div>
                      {pointsPerUnit !== null && pointsPerUnit > 0 && (
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-green-600 text-xs">
                            {product?.loyaltyPointsPropertyName || 'Puntos'} por 1 {baseUnit.symbol}
                          </span>
                          <Badge variant="outline" className="text-xs border-green-300 text-green-700">
                            {pointsPerUnit.toFixed(2)} {product?.loyaltyPointsPropertyName || 'pts'}
                          </Badge>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-green-600 mt-2 italic">
                  * Calculado automáticamente: precio del producto (
                  {product?.currency === 'USD' ? '$' : 'RD$'}{parseFloat(product?.price || '0').toFixed(2)}) ÷ factor de conversión.
                </p>
              </div>
            )}

            {/* Quick Setup */}
            {baseUnit && unitsForSetup.length > 0 && (
              <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                <div className="flex items-start gap-3">
                  <Zap className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="text-sm font-medium text-amber-900 mb-1">
                      Configuración Rápida
                    </h4>
                    <p className="text-xs text-amber-700 mb-3">
                      Configura conversiones comunes automáticamente desde la unidad base
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setShowSetupDialog(true)}
                      className="bg-white"
                    >
                      <Zap className="w-4 h-4 mr-2" />
                      Configurar Automáticamente
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-600">Conversiones configuradas</p>
                <p className="text-2xl font-bold text-gray-900">{conversions.length}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-600">Unidades disponibles</p>
                <p className="text-2xl font-bold text-gray-900">{availableUnits.length}</p>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Conversions List */}
      {product?.unitConversionEnabled && product?.baseUnitId && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Conversiones Configuradas</CardTitle>
              <Button
                type="button"
                size="sm"
                onClick={() => setShowCreateDialog(true)}
              >
                <Plus className="w-4 h-4 mr-2" />
                Nueva Conversión
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {conversions.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Scale className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>No hay conversiones configuradas</p>
                <p className="text-sm">Comienza agregando una conversión manual o usa la configuración rápida</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Desde</TableHead>
                    <TableHead className="text-center">Factor</TableHead>
                    <TableHead>Hasta</TableHead>
                    <TableHead>Notas</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {conversions.map((conversion) => (
                    <TableRow key={conversion.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">
                            {conversion.sourceUnit?.symbol || 'N/A'}
                          </Badge>
                          <span className="text-sm text-gray-600">
                            {conversion.sourceUnit?.name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <ArrowRight className="w-4 h-4 text-gray-400" />
                          <span className="font-mono text-sm font-medium">
                            ×{parseFloat(conversion.conversionFactor).toFixed(6)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">
                            {conversion.targetUnit?.symbol || 'N/A'}
                          </Badge>
                          <span className="text-sm text-gray-600">
                            {conversion.targetUnit?.name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-gray-500">
                          {conversion.notes || '-'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => openEditDialog(conversion)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => openDeleteDialog(conversion)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* No Conversion Enabled State */}
      {!product?.unitConversionEnabled && (
        <Card>
          <CardContent className="text-center py-12">
            <AlertCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Conversión de unidades desactivada
            </h3>
            <p className="text-gray-600 mb-4">
              Activa la conversión de unidades para este producto para comenzar a configurar las conversiones
            </p>
          </CardContent>
        </Card>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear Nueva Conversión</DialogTitle>
            <DialogDescription>
              Define el factor de conversión entre dos unidades
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={createForm.handleSubmit(handleCreate)} className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label htmlFor="sourceUnit">Unidad Origen</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => openCreateUnitDialog('source')}
                  className="h-7 text-xs"
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Nueva Unidad
                </Button>
              </div>
              <Select
                value={createForm.watch('sourceUnitId')?.toString() || ''}
                onValueChange={(value) => createForm.setValue('sourceUnitId', parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona unidad origen" />
                </SelectTrigger>
                <SelectContent>
                  {allUnits.map((unit) => (
                    <SelectItem key={unit.id} value={unit.id.toString()}>
                      {unit.name} ({unit.symbol})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {createForm.formState.errors.sourceUnitId && (
                <p className="text-sm text-red-600 mt-1">
                  {createForm.formState.errors.sourceUnitId.message}
                </p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label htmlFor="targetUnit">Unidad Destino</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => openCreateUnitDialog('target')}
                  className="h-7 text-xs"
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Nueva Unidad
                </Button>
              </div>
              <Select
                value={createForm.watch('targetUnitId')?.toString() || ''}
                onValueChange={(value) => createForm.setValue('targetUnitId', parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona unidad destino" />
                </SelectTrigger>
                <SelectContent>
                  {allUnits.map((unit) => (
                    <SelectItem key={unit.id} value={unit.id.toString()}>
                      {unit.name} ({unit.symbol})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {createForm.formState.errors.targetUnitId && (
                <p className="text-sm text-red-600 mt-1">
                  {createForm.formState.errors.targetUnitId.message}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="conversionFactor">Factor de Conversión</Label>
              <Input
                id="conversionFactor"
                type="number"
                step="0.000001"
                placeholder="Ej: 1000 (si 1 unidad origen = 1000 unidad destino)"
                {...createForm.register('conversionFactor')}
              />
              {createForm.formState.errors.conversionFactor && (
                <p className="text-sm text-red-600 mt-1">
                  {createForm.formState.errors.conversionFactor.message}
                </p>
              )}
              <p className="text-xs text-gray-500 mt-1">
                Ejemplo: Para kg → g, el factor es 1000 (1 kg = 1000 g)
              </p>
            </div>

            <div>
              <Label htmlFor="notes">Notas (opcional)</Label>
              <Textarea
                id="notes"
                placeholder="Ej: 1 kg = 1000 g"
                {...createForm.register('notes')}
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="bidirectional"
                checked={createForm.watch('bidirectional')}
                onCheckedChange={(checked) => createForm.setValue('bidirectional', checked)}
              />
              <Label htmlFor="bidirectional" className="cursor-pointer">
                Crear conversión bidireccional (automática inversa)
              </Label>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowCreateDialog(false);
                  createForm.reset();
                }}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={createConversionMutation.isPending}>
                {createConversionMutation.isPending ? 'Creando...' : 'Crear Conversión'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Conversión</DialogTitle>
            <DialogDescription>
              Modifica el factor de conversión o las notas
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={editForm.handleSubmit(handleEdit)} className="space-y-4">
            <div>
              <Label>Conversión</Label>
              <div className="p-3 bg-gray-50 rounded-lg flex items-center justify-center gap-2">
                <Badge variant="outline">
                  {selectedConversion?.sourceUnit?.symbol}
                </Badge>
                <ArrowRight className="w-4 h-4" />
                <Badge variant="outline">
                  {selectedConversion?.targetUnit?.symbol}
                </Badge>
              </div>
            </div>

            <div>
              <Label htmlFor="edit-conversionFactor">Factor de Conversión</Label>
              <Input
                id="edit-conversionFactor"
                type="number"
                step="0.000001"
                {...editForm.register('conversionFactor')}
              />
              {editForm.formState.errors.conversionFactor && (
                <p className="text-sm text-red-600 mt-1">
                  {editForm.formState.errors.conversionFactor.message}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="edit-notes">Notas</Label>
              <Textarea
                id="edit-notes"
                {...editForm.register('notes')}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowEditDialog(false);
                  setSelectedConversion(null);
                  editForm.reset();
                }}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={updateConversionMutation.isPending}>
                {updateConversionMutation.isPending ? 'Guardando...' : 'Guardar Cambios'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar Conversión</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de que deseas eliminar esta conversión?
            </DialogDescription>
          </DialogHeader>

          {selectedConversion && (
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-center gap-2">
                <Badge variant="outline">
                  {selectedConversion.sourceUnit?.name} ({selectedConversion.sourceUnit?.symbol})
                </Badge>
                <ArrowRight className="w-4 h-4" />
                <Badge variant="outline">
                  {selectedConversion.targetUnit?.name} ({selectedConversion.targetUnit?.symbol})
                </Badge>
              </div>
              <p className="text-center text-sm text-gray-600 mt-2">
                Factor: {parseFloat(selectedConversion.conversionFactor).toFixed(6)}
              </p>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowDeleteDialog(false);
                setSelectedConversion(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteConversionMutation.isPending}
            >
              {deleteConversionMutation.isPending ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Setup Common Conversions Dialog */}
      <Dialog open={showSetupDialog} onOpenChange={setShowSetupDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configuración Rápida de Conversiones</DialogTitle>
            <DialogDescription>
              Selecciona las unidades que deseas convertir desde {baseUnit?.symbol}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-sm text-blue-900">
                <strong>Unidad base:</strong> {baseUnit?.name} ({baseUnit?.symbol})
              </p>
              <p className="text-xs text-blue-700 mt-1">
                Se crearán conversiones bidireccionales automáticamente con factores comunes
              </p>
            </div>

            <div className="space-y-2">
              <Label>Unidades para convertir:</Label>
              <div className="grid grid-cols-2 gap-2">
                {unitsForSetup.map((unit) => (
                  <div
                    key={unit.id}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                      selectedUnitsForSetup.includes(unit.symbol)
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => {
                      setSelectedUnitsForSetup(prev =>
                        prev.includes(unit.symbol)
                          ? prev.filter(s => s !== unit.symbol)
                          : [...prev, unit.symbol]
                      );
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{unit.symbol}</p>
                        <p className="text-xs text-gray-600">{unit.name}</p>
                      </div>
                      {selectedUnitsForSetup.includes(unit.symbol) && (
                        <CheckCircle className="w-5 h-5 text-blue-600" />
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {unitsForSetup.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-4">
                  No hay unidades disponibles para configurar. Ya se han configurado todas las conversiones posibles.
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowSetupDialog(false);
                setSelectedUnitsForSetup([]);
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSetupCommonConversions}
              disabled={selectedUnitsForSetup.length === 0 || setupCommonConversionsMutation.isPending}
            >
              {setupCommonConversionsMutation.isPending ? 'Configurando...' : 'Configurar Conversiones'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Unit Dialog */}
      <Dialog open={showCreateUnitDialog} onOpenChange={setShowCreateUnitDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear Nueva Unidad de Medida</DialogTitle>
            <DialogDescription>
              Define una unidad personalizada como "pastilla", "cucharada", etc.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={createUnitForm.handleSubmit(handleCreateUnit)} className="space-y-4">
            <div>
              <Label htmlFor="unit-name">Nombre de la Unidad</Label>
              <Input
                id="unit-name"
                placeholder="Ej: Pastilla, Cucharada, Sobre, etc."
                {...createUnitForm.register('name')}
              />
              {createUnitForm.formState.errors.name && (
                <p className="text-sm text-red-600 mt-1">
                  {createUnitForm.formState.errors.name.message}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="unit-symbol">Símbolo/Abreviación</Label>
              <Input
                id="unit-symbol"
                placeholder="Ej: past, cuch, sob"
                {...createUnitForm.register('symbol')}
              />
              {createUnitForm.formState.errors.symbol && (
                <p className="text-sm text-red-600 mt-1">
                  {createUnitForm.formState.errors.symbol.message}
                </p>
              )}
              <p className="text-xs text-gray-500 mt-1">
                Abreviación corta para mostrar en la interfaz
              </p>
            </div>

            <div>
              <Label htmlFor="unit-type">Tipo de Unidad</Label>
              <Select
                value={createUnitForm.watch('type') || 'unit'}
                onValueChange={(value: 'weight' | 'volume' | 'unit' | 'length') =>
                  createUnitForm.setValue('type', value)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona el tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weight">Peso (kg, g, lb, oz)</SelectItem>
                  <SelectItem value="volume">Volumen (L, ml, gal)</SelectItem>
                  <SelectItem value="unit">Unidad (unid, caja, paquete)</SelectItem>
                  <SelectItem value="length">Longitud (m, cm, in)</SelectItem>
                </SelectContent>
              </Select>
              {createUnitForm.formState.errors.type && (
                <p className="text-sm text-red-600 mt-1">
                  {createUnitForm.formState.errors.type.message}
                </p>
              )}
              <p className="text-xs text-gray-500 mt-1">
                Solo podrás crear conversiones entre unidades del mismo tipo
              </p>
            </div>

            <div>
              <Label htmlFor="unit-abbreviation">Abreviación Alternativa (opcional)</Label>
              <Input
                id="unit-abbreviation"
                placeholder="Ej: pastilla, cucharadita"
                {...createUnitForm.register('abbreviation')}
              />
            </div>

            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-xs text-blue-900">
                <strong>Ejemplos comunes:</strong>
              </p>
              <ul className="text-xs text-blue-700 mt-1 space-y-1 list-disc list-inside">
                <li>Pastilla (past) - Tipo: Unidad</li>
                <li>Cucharada (cuch) - Tipo: Volumen</li>
                <li>Sobre (sob) - Tipo: Unidad</li>
                <li>Ampolla (amp) - Tipo: Volumen</li>
                <li>Dosis (dos) - Tipo: Unidad</li>
              </ul>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowCreateUnitDialog(false);
                  setUnitCreationContext(null);
                  createUnitForm.reset();
                }}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={createUnitMutation.isPending}>
                {createUnitMutation.isPending ? 'Creando...' : 'Crear Unidad'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
