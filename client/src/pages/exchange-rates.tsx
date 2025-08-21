// client/src/pages/exchange-rates.tsx

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, TrendingUp, History, DollarSign, RefreshCw } from 'lucide-react';
import { CurrencySelector } from '@/components/CurrencySelector';

interface ExchangeRate {
  id: number;
  baseCurrency: string;
  targetCurrency: string;
  rate: string;
  updatedAt: string;
  updatedBy?: number;
}

export default function ExchangeRateManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newRate, setNewRate] = useState('');
  const [fromCurrency, setFromCurrency] = useState('USD');
  const [toCurrency, setToCurrency] = useState('DOP');

  // Obtener tasas actuales
  const { data: rates = [], isLoading } = useQuery<ExchangeRate[]>({
    queryKey: ['/api/exchange-rates']
  });

  // Obtener historial
  const { data: history = [] } = useQuery<ExchangeRate[]>({
    queryKey: ['/api/exchange-rates/history', fromCurrency, toCurrency],
    enabled: !!fromCurrency && !!toCurrency
  });

  // Mutation para actualizar tasa
  const updateRateMutation = useMutation({
    mutationFn: async (data: { baseCurrency: string; targetCurrency: string; rate: number }) => {
      const response = await fetch('/api/exchange-rates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify(data)
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error updating rate');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/exchange-rates'] });
      setNewRate('');
      toast({
        title: 'Tasa actualizada',
        description: 'La tasa de cambio se actualizó correctamente'
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const handleUpdateRate = () => {
    const rateValue = parseFloat(newRate);
    
    if (!rateValue || rateValue <= 0) {
      toast({
        title: 'Error',
        description: 'Ingresa una tasa válida mayor a 0',
        variant: 'destructive'
      });
      return;
    }

    updateRateMutation.mutate({
      baseCurrency: fromCurrency,
      targetCurrency: toCurrency,
      rate: rateValue
    });
  };

  const getCurrentRate = (from: string, to: string) => {
    return rates.find(r => r.baseCurrency === from && r.targetCurrency === to);
  };

  const usdToDopRate = getCurrentRate('USD', 'DOP');
  const dopToUsdRate = getCurrentRate('DOP', 'USD');

  return (
    <div className="container mx-auto p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Tasas de Cambio</h1>
          <p className="text-gray-600 mt-1">Gestiona las tasas USD ↔ DOP</p>
        </div>
        <CurrencySelector variant="badge" />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Tasas Actuales */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Tasas Actuales
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* USD a DOP */}
            <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
              <div>
                <span className="font-medium">1 USD</span>
                <span className="text-gray-500 ml-2">→</span>
              </div>
              <div className="text-right">
                <span className="text-lg font-bold text-blue-600">
                  {usdToDopRate ? parseFloat(usdToDopRate.rate).toFixed(2) : 'N/A'} DOP
                </span>
                {usdToDopRate && (
                  <p className="text-xs text-gray-500">
                    Actualizado: {new Date(usdToDopRate.updatedAt).toLocaleString()}
                  </p>
                )}
              </div>
            </div>

            {/* DOP a USD */}
            <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
              <div>
                <span className="font-medium">1 DOP</span>
                <span className="text-gray-500 ml-2">→</span>
              </div>
              <div className="text-right">
                <span className="text-lg font-bold text-green-600">
                  {dopToUsdRate ? parseFloat(dopToUsdRate.rate).toFixed(4) : 'N/A'} USD
                </span>
                {dopToUsdRate && (
                  <p className="text-xs text-gray-500">
                    Actualizado: {new Date(dopToUsdRate.updatedAt).toLocaleString()}
                  </p>
                )}
              </div>
            </div>

            {(!usdToDopRate || !dopToUsdRate) && (
              <div className="flex items-center gap-2 p-3 bg-yellow-50 rounded-lg text-yellow-800">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm">Algunas tasas no están configuradas</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Actualizar Tasa */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5" />
              Actualizar Tasa
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>De</Label>
                <select 
                  value={fromCurrency} 
                  onChange={(e) => setFromCurrency(e.target.value)}
                  className="w-full p-2 border rounded-md"
                >
                  <option value="USD">USD</option>
                  <option value="DOP">DOP</option>
                </select>
              </div>
              <div>
                <Label>A</Label>
                <select 
                  value={toCurrency} 
                  onChange={(e) => setToCurrency(e.target.value)}
                  className="w-full p-2 border rounded-md"
                >
                  <option value="DOP">DOP</option>
                  <option value="USD">USD</option>
                </select>
              </div>
            </div>

            <div>
              <Label>Nueva Tasa</Label>
              <Input
                type="number"
                step="0.0001"
                placeholder="Ejemplo: 56.00"
                value={newRate}
                onChange={(e) => setNewRate(e.target.value)}
              />
              <p className="text-xs text-gray-500 mt-1">
                1 {fromCurrency} = {newRate || '0'} {toCurrency}
              </p>
            </div>

            <Button 
              onClick={handleUpdateRate}
              disabled={updateRateMutation.isPending || !newRate}
              className="w-full"
            >
              {updateRateMutation.isPending ? 'Actualizando...' : 'Actualizar Tasa'}
            </Button>

            {/* Validación de rango */}
            {newRate && (
              <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded">
                {fromCurrency === 'USD' && toCurrency === 'DOP' && (
                  parseFloat(newRate) < 40 || parseFloat(newRate) > 70 ? (
                    <span className="text-red-600">⚠️ Tasa fuera del rango típico (40-70)</span>
                  ) : (
                    <span className="text-green-600">✓ Tasa en rango aceptable</span>
                  )
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Historial */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              Historial Reciente ({fromCurrency} → {toCurrency})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {history.length > 0 ? (
              <div className="space-y-2">
                {history.slice(0, 10).map((rate) => (
                  <div key={rate.id} className="flex justify-between items-center p-2 border rounded">
                    <span className="font-medium">{parseFloat(rate.rate).toFixed(4)}</span>
                    <span className="text-sm text-gray-500">
                      {new Date(rate.updatedAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-4">No hay historial disponible</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}