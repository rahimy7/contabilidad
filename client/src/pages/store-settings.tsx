import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useRef } from 'react';
import { Upload, X, Save, Image as ImageIcon, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

interface StoreSettingsData {
  id: number;
  storeName: string;
  storeAddress?: string;
  storePhone?: string;
  storeEmail?: string;
  storeWhatsAppNumber: string;
  invoiceFooter?: string;
  invoiceNumber: number;
  currency: string;
  taxPercentage: number;
  businessHours: string;
  logoUrl?: string;
  logoStoragePath?: string;
}

export default function StoreSettingsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ✅ Fetch store settings
  const { data: settings, isLoading } = useQuery<StoreSettingsData>({
    queryKey: ['store-settings'],
    queryFn: async () => {
      const token = localStorage.getItem('auth_token') || localStorage.getItem('token') || '';
      const response = await fetch('/api/store-settings', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to fetch settings');
      return response.json();
    }
  });

  // ✅ Update settings mutation
  const updateMutation = useMutation({
    mutationFn: async (formData: Partial<StoreSettingsData>) => {
      const token = localStorage.getItem('auth_token') || localStorage.getItem('token') || '';
      const response = await fetch('/api/store-settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });
      if (!response.ok) throw new Error('Failed to update settings');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['store-settings'] });
      toast({
        title: 'Guardado',
        description: 'La configuración de la tienda ha sido actualizada correctamente'
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Error al guardar',
        variant: 'destructive'
      });
    }
  });

  // ✅ Upload logo mutation
  const uploadLogoMutation = useMutation({
    mutationFn: async (file: File) => {
      const reader = new FileReader();
      return new Promise((resolve, reject) => {
        reader.onload = async () => {
          const base64 = reader.result as string;
          const token = localStorage.getItem('auth_token') || localStorage.getItem('token') || '';
          const response = await fetch('/api/store-settings/upload-logo', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              file: base64.split(',')[1],
              filename: file.name
            })
          });
          if (!response.ok) {
            reject(new Error('Failed to upload logo'));
          } else {
            resolve(response.json());
          }
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['store-settings'] });
      toast({
        title: 'Logo actualizado',
        description: 'El logo de la tienda ha sido actualizado correctamente'
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Error al subir logo',
        variant: 'destructive'
      });
    }
  });

  // ✅ Delete logo mutation
  const deleteLogoMutation = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem('auth_token') || localStorage.getItem('token') || '';
      const response = await fetch('/api/store-settings/logo', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Failed to delete logo');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['store-settings'] });
      toast({
        title: 'Logo eliminado',
        description: 'El logo ha sido eliminado correctamente'
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Error al eliminar logo',
        variant: 'destructive'
      });
    }
  });

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: 'Archivo muy grande',
          description: 'El logo no debe superar 5MB',
          variant: 'destructive'
        });
        return;
      }
      uploadLogoMutation.mutate(file);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="mb-4 text-gray-500">Cargando configuración...</div>
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center text-red-600">No se encontraron configuraciones</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Configuración de la Tienda</h1>
        <p className="text-gray-600 mb-8">Administra los datos de tu tienda para facturas y operaciones</p>

        <div className="space-y-6">
          {/* 🧾 SECCIÓN DE FACTURA */}
          <Card>
            <CardHeader className="bg-emerald-50 border-b-2 border-emerald-200">
              <CardTitle className="flex items-center gap-2">
                <span>📄</span> Configuración de Facturas
              </CardTitle>
              <CardDescription>
                Información que aparecerá en las facturas generadas
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              {/* Logo */}
              <div className="space-y-4">
                <label className="block text-sm font-semibold text-gray-700">
                  Logo de la Tienda
                </label>
                <div className="flex gap-4 items-start">
                  {settings.logoUrl ? (
                    <div className="relative w-32 h-32 bg-white rounded-lg border-2 border-gray-200 flex items-center justify-center overflow-hidden">
                      <img
                        src={settings.logoUrl}
                        alt="Logo"
                        className="w-full h-full object-contain"
                      />
                      <button
                        onClick={() => deleteLogoMutation.mutate()}
                        disabled={deleteLogoMutation.isPending}
                        className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white rounded-full p-1"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-32 h-32 bg-gray-100 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center">
                      <ImageIcon className="w-8 h-8 text-gray-400" />
                    </div>
                  )}
                  <div className="flex-1">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadLogoMutation.isPending}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg disabled:opacity-50"
                    >
                      <Upload className="w-4 h-4" />
                      {uploadLogoMutation.isPending ? 'Subiendo...' : 'Subir Logo'}
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      className="hidden"
                    />
                    <p className="text-xs text-gray-500 mt-2">
                      Máximo 5MB. Formatos: PNG, JPG, WebP
                    </p>
                  </div>
                </div>
              </div>

              {/* Store Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Nombre de la Tienda
                  </label>
                  <Input
                    defaultValue={settings.storeName}
                    onChange={(e) => updateMutation.mutate({ storeName: e.target.value })}
                    placeholder="Ej: Mi Tienda"
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Teléfono
                  </label>
                  <Input
                    defaultValue={settings.storePhone || ''}
                    onChange={(e) => updateMutation.mutate({ storePhone: e.target.value })}
                    placeholder="+1-234-567-8900"
                    className="w-full"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Dirección
                </label>
                <Input
                  defaultValue={settings.storeAddress || ''}
                  onChange={(e) => updateMutation.mutate({ storeAddress: e.target.value })}
                  placeholder="Ej: Calle Principal 123, Ciudad"
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Correo Electrónico
                </label>
                <Input
                  defaultValue={settings.storeEmail || ''}
                  onChange={(e) => updateMutation.mutate({ storeEmail: e.target.value })}
                  placeholder="info@mitienda.com"
                  type="email"
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Pie de Factura (Texto Personalizado)
                </label>
                <textarea
                  defaultValue={settings.invoiceFooter || ''}
                  onChange={(e) => updateMutation.mutate({ invoiceFooter: e.target.value })}
                  placeholder="Ej: Gracias por su compra. Términos y condiciones aplicables."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Porcentaje de Impuesto (%)
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    defaultValue={settings.taxPercentage}
                    onChange={(e) => updateMutation.mutate({ taxPercentage: parseFloat(e.target.value) })}
                    placeholder="0.00"
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Moneda Predeterminada
                  </label>
                  <select
                    defaultValue={settings.currency}
                    onChange={(e) => updateMutation.mutate({ currency: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="DOP">Peso Dominicano (RD$)</option>
                    <option value="USD">Dólar Estadounidense ($)</option>
                    <option value="EUR">Euro (€)</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 🏪 SECCIÓN GENERAL */}
          <Card>
            <CardHeader className="bg-blue-50 border-b-2 border-blue-200">
              <CardTitle className="flex items-center gap-2">
                <span>🏪</span> Información General
              </CardTitle>
              <CardDescription>
                Datos generales de la tienda
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Número de WhatsApp
                </label>
                <Input
                  defaultValue={settings.storeWhatsAppNumber}
                  onChange={(e) => updateMutation.mutate({ storeWhatsAppNumber: e.target.value })}
                  placeholder="+1-234-567-8900"
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Horario de Negocio
                </label>
                <Input
                  defaultValue={settings.businessHours}
                  onChange={(e) => updateMutation.mutate({ businessHours: e.target.value })}
                  placeholder="09:00-18:00"
                  className="w-full"
                />
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
                <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0" />
                <div className="text-sm text-blue-800">
                  <p className="font-semibold mb-1">Número Secuencial de Facturas</p>
                  <p>Próxima factura: <Badge className="bg-blue-600">{settings.invoiceNumber}</Badge></p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3">
            <Button variant="outline">Cancelar</Button>
            <Button
              onClick={() => {
                toast({
                  title: 'Guardado',
                  description: 'Todos los cambios han sido guardados'
                });
              }}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Save className="w-4 h-4 mr-2" />
              Guardar Cambios
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
