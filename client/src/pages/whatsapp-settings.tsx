import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  AlertCircle, 
  CheckCircle, 
  Settings, 
  Smartphone, 
  Key, 
  Shield, 
  Server,
  Phone,
  Globe,
  Eye,
  EyeOff,
  Copy,
  RefreshCw,
  Activity
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";

interface WhatsAppConfig {
  id?: number;
  accessToken: string;
  phoneNumberId: string;
  webhookVerifyToken: string;
  businessAccountId: string | null;
  appId: string | null;
  isActive: boolean | null;
  storeId?: number;
  createdAt?: string;
  updatedAt?: string;
}

interface WhatsAppStatus {
  connected: boolean;
  configured: boolean;
  lastActivity: string | null;
  webhookUrl: string;
  phoneNumber?: string;
  businessName?: string;
  message?: string;
}

interface Props { 
  storeId?: number; // Hacer opcional para compatibilidad
}

export default function WhatsAppSettings({ storeId: propStoreId }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [showTokens, setShowTokens] = useState<Record<string, boolean>>({});
  const [formData, setFormData] = useState<WhatsAppConfig>({
    accessToken: "",
    phoneNumberId: "",
    webhookVerifyToken: "",
    businessAccountId: "",
    appId: "",
    isActive: true
  });

  // Determinar storeId efectivo
  const effectiveStoreId = propStoreId || user?.storeId;

  // ✅ CORREGIDO: Obtener configuración sin .then(res => res.json())
  const { data: config, isLoading: configLoading, refetch: refetchConfig } =
    useQuery<WhatsAppConfig>({
      queryKey: ["whatsapp-config", effectiveStoreId],
      queryFn: () => apiRequest<WhatsAppConfig>("GET", `/api/super-admin/whatsapp-configs/${effectiveStoreId}`),
      staleTime: 5 * 60_000,
      enabled: !!effectiveStoreId,
    });

  // ✅ CORREGIDO: Obtener estado sin .then(res => res.json())
  const { data: status, refetch: refetchStatus } =
    useQuery<WhatsAppStatus>({
      queryKey: ["whatsapp-status", effectiveStoreId],
      queryFn: () => apiRequest<WhatsAppStatus>("GET", `/api/super-admin/whatsapp-configs/${effectiveStoreId}/status`),
      refetchInterval: 30_000,
      enabled: !!effectiveStoreId,
    });

  // ✅ CORREGIDO: Mutation para guardar configuración
  const saveConfigMutation = useMutation({
    mutationFn: (data: WhatsAppConfig) =>
      apiRequest("PUT", `/api/super-admin/whatsapp-configs/${effectiveStoreId}`, data),
    onSuccess: () => {
      toast({
        title: "Configuración guardada",
        description: "La configuración de WhatsApp se guardó exitosamente.",
      });
      refetchConfig();
      refetchStatus();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Error al guardar la configuración",
        variant: "destructive",
      });
    },
  });

  // ✅ CORREGIDO: Mutation para probar conexión
  const testConnectionMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/super-admin/whatsapp-configs/${effectiveStoreId}/test`),
    onSuccess: (data: any) => {
      toast({
        title: "Conexión exitosa",
        description: data.message || "La conexión se estableció correctamente",
      });
      refetchStatus();
    },
    onError: (error: any) => {
      toast({
        title: "Error de conexión",
        description: error.message || "No se pudo establecer la conexión",
        variant: "destructive",
      });
    },
  });

  // ✅ CORREGIDO: useEffect optimizado para evitar loops
  useEffect(() => {
    if (config && typeof config === 'object') {
      setFormData(prevData => {
        const newData = {
          accessToken: config.accessToken || "",
          phoneNumberId: config.phoneNumberId || "",
          webhookVerifyToken: config.webhookVerifyToken || "",
          businessAccountId: config.businessAccountId || "",
          appId: config.appId || "",
          isActive: config.isActive ?? true
        };
        
        // Solo actualizar si los datos han cambiado
        if (JSON.stringify(prevData) !== JSON.stringify(newData)) {
          return newData;
        }
        return prevData;
      });
    }
  }, [config]); // Solo depender de config

  // Función para alternar visibilidad de tokens
  const toggleTokenVisibility = (field: string) => {
    setShowTokens(prev => ({
      ...prev,
      [field]: !prev[field]
    }));
  };

  // Función para copiar al portapapeles
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copiado",
        description: "Texto copiado al portapapeles",
      });
    } catch (err) {
      toast({
        title: "Error",
        description: "No se pudo copiar al portapapeles",
        variant: "destructive",
      });
    }
  };

  const handleSave = () => {
    saveConfigMutation.mutate({
      ...formData,
      storeId: effectiveStoreId
    });
  };

  const handleTestConnection = () => {
    testConnectionMutation.mutate();
  };

  const updateFormData = (field: keyof WhatsAppConfig, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  if (!effectiveStoreId) {
    return (
      <div>
        <div className="text-center">
          <h1 className="text-[20px] font-semibold tracking-tight mb-4">
            ID de tienda requerido
          </h1>
          <p className="text-muted-foreground">
            No se pudo determinar la tienda para configurar WhatsApp
          </p>
        </div>
      </div>
    );
  }

  if (configLoading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-4 bg-secondary rounded w-1/4 mb-4"></div>
          <div className="h-64 bg-secondary rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Estado de conexión */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Estado de Conexión WhatsApp
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="flex items-center space-x-2">
              <Badge variant={status?.connected ? "default" : "destructive"}>
                {status?.connected ? "Conectado" : "Desconectado"}
              </Badge>
              <span className="text-sm text-muted-foreground">Estado API</span>
            </div>
            <div className="flex items-center space-x-2">
              <Badge variant={status?.configured ? "default" : "secondary"}>
                {status?.configured ? "Configurado" : "Pendiente"}
              </Badge>
              <span className="text-sm text-muted-foreground">Configuración</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium">{status?.phoneNumber || 'N/A'}</span>
              <span className="text-sm text-muted-foreground">Número</span>
            </div>
            <div className="flex items-center space-x-2">
              <Button 
                size="sm" 
                onClick={handleTestConnection}
                disabled={testConnectionMutation.isPending}
                className="bg-success hover:bg-success/90"
              >
                {testConnectionMutation.isPending ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Activity className="h-4 w-4 mr-2" />
                )}
                Probar
              </Button>
            </div>
          </div>

          {status?.message && (
            <Alert className="mt-4">
              <AlertDescription>{status.message}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Configuración */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Configuración de WhatsApp Business API
          </CardTitle>
          <CardDescription>
            Configura la conexión con WhatsApp Business API
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Access Token */}
          <div className="space-y-2">
            <Label htmlFor="accessToken">Access Token</Label>
            <div className="flex space-x-2">
              <Input
                id="accessToken"
                type={showTokens.accessToken ? "text" : "password"}
                value={formData.accessToken}
                onChange={(e) => updateFormData('accessToken', e.target.value)}
                placeholder="Ingresa tu Access Token"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => toggleTokenVisibility('accessToken')}
              >
                {showTokens.accessToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              {formData.accessToken && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(formData.accessToken)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Phone Number ID */}
          <div className="space-y-2">
            <Label htmlFor="phoneNumberId">Phone Number ID</Label>
            <Input
              id="phoneNumberId"
              value={formData.phoneNumberId}
              onChange={(e) => updateFormData('phoneNumberId', e.target.value)}
              placeholder="Ingresa el Phone Number ID"
            />
          </div>

          {/* Webhook Verify Token */}
          <div className="space-y-2">
            <Label htmlFor="webhookVerifyToken">Webhook Verify Token</Label>
            <div className="flex space-x-2">
              <Input
                id="webhookVerifyToken"
                type={showTokens.webhookVerifyToken ? "text" : "password"}
                value={formData.webhookVerifyToken}
                onChange={(e) => updateFormData('webhookVerifyToken', e.target.value)}
                placeholder="Token para verificar webhook"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => toggleTokenVisibility('webhookVerifyToken')}
              >
                {showTokens.webhookVerifyToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Business Account ID */}
          <div className="space-y-2">
            <Label htmlFor="businessAccountId">Business Account ID (Opcional)</Label>
            <Input
              id="businessAccountId"
              value={formData.businessAccountId || ""}
              onChange={(e) => updateFormData('businessAccountId', e.target.value)}
              placeholder="ID de la cuenta de negocio"
            />
          </div>

          {/* App ID */}
          <div className="space-y-2">
            <Label htmlFor="appId">App ID (Opcional)</Label>
            <Input
              id="appId"
              value={formData.appId || ""}
              onChange={(e) => updateFormData('appId', e.target.value)}
              placeholder="ID de la aplicación"
            />
          </div>

          <Separator />

          {/* Botones de acción */}
          <div className="flex justify-end space-x-2">
            <Button
              onClick={handleSave}
              disabled={saveConfigMutation.isPending}
            >
              {saveConfigMutation.isPending ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Shield className="h-4 w-4 mr-2" />
              )}
              Guardar Configuración
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Información del Webhook */}
      {status?.webhookUrl && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Información del Webhook
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label>URL del Webhook</Label>
              <div className="flex space-x-2">
                <Input
                  value={status.webhookUrl}
                  readOnly
                  className="bg-subtle"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(status.webhookUrl)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Usa esta URL en la configuración de tu webhook en Meta Developers
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}