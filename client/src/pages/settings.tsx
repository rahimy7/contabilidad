import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Settings as SettingsIcon, 
  Key, 
  Phone, 
  Shield, 
  CheckCircle, 
  XCircle, 
  RefreshCw,
  Eye,
  EyeOff,
  Globe,
  Activity
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Interfaces para tipado
interface WhatsAppLog {
  id: number;
  type: 'incoming' | 'outgoing' | 'error' | 'webhook';
  phoneNumber?: string;
  messageContent?: string;
  messageId?: string;
  status?: string;
  errorMessage?: string;
  timestamp: string;
  rawData?: string;
}

interface WhatsAppLogStats {
  total: number;
  success: number;
  errors: number;
  today: number;
  thisWeek: number;
  thisMonth: number;
}

// Schema completo para validación inicial
const whatsappConfigSchema = z.object({
  metaAppId: z.string().optional(),
  metaAppSecret: z.string().optional(),
  whatsappBusinessAccountId: z.string().optional(),
  whatsappPhoneNumberId: z.string().optional(),
  whatsappToken: z.string().optional(),
  whatsappVerifyToken: z.string().optional(),
  webhookUrl: z.string().optional(),
  storeWhatsAppNumber: z.string().optional(),
});

// Schema para validar solo campos específicos al enviar
const whatsappPartialSchema = z.object({
  metaAppId: z.string().min(1, "Meta App ID es requerido").optional(),
  metaAppSecret: z.string().min(1, "Meta App Secret es requerido").optional(),
  whatsappBusinessAccountId: z.string().min(1, "WhatsApp Business Account ID es requerido").optional(),
  whatsappPhoneNumberId: z.string().min(1, "WhatsApp Phone Number ID es requerido").optional(),
  whatsappToken: z.string().min(1, "WhatsApp Token es requerido").optional(),
  whatsappVerifyToken: z.string().min(1, "WhatsApp Verify Token es requerido").optional(),
  webhookUrl: z.string().url("URL del webhook debe ser válida").optional(),
  storeWhatsAppNumber: z.string().min(10, "Número de WhatsApp debe tener al menos 10 dígitos").optional(),
});

type WhatsAppConfig = z.infer<typeof whatsappConfigSchema>;

// Schema para configuración de tienda (sin WhatsApp)
const storeConfigSchema = z.object({
  storeName: z.string().min(1, "Nombre de la tienda es requerido"),
  storeAddress: z.string().optional(),
  storeEmail: z.string().email("Email inválido").optional().or(z.literal("")),
});

type StoreConfig = z.infer<typeof storeConfigSchema>;

// Componente para configuración de tienda
function StoreSettings() {
  const { toast } = useToast();
  
  const { data: storeConfig = {}, isLoading } = useQuery<any>({
    queryKey: ["/api/store-settings"],
  });

  const form = useForm<StoreConfig>({
    resolver: zodResolver(storeConfigSchema),
    defaultValues: {
      storeName: "",
      storeAddress: "",
      storeEmail: "",
    },
  });

  // Actualizar formulario cuando cambian los datos
  useEffect(() => {
    if (storeConfig && !isLoading) {
      const newValues = {
        storeName: storeConfig.storeName || "",
        storeAddress: storeConfig.storeAddress || "",
        storeEmail: storeConfig.storeEmail || "",
      };
      
      // Solo actualizar si los valores son diferentes
      const currentValues = form.getValues();
      if (JSON.stringify(currentValues) !== JSON.stringify(newValues)) {
        form.reset(newValues);
      }
    }
  }, [storeConfig, isLoading, form]);

  const saveStoreConfigMutation = useMutation({
    mutationFn: async (data: StoreConfig) => {
      return apiRequest("PUT", "/api/store-settings", data);
    },
    onSuccess: () => {
      toast({
        title: "Configuración guardada",
        description: "La configuración de la tienda se ha guardado correctamente",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/store-settings"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Error al guardar la configuración",
        variant: "destructive",
      });
    },
  });

  const onSubmitStore = (data: StoreConfig) => {
    saveStoreConfigMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <SettingsIcon className="h-5 w-5 text-blue-600" />
          <span>Configuración de la Tienda</span>
        </CardTitle>
        <p className="text-sm text-gray-600">
          Configura la información básica de tu tienda y el número de WhatsApp para pedidos del catálogo público
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmitStore)} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Nombre de la tienda */}
            <div className="space-y-2">
              <Label htmlFor="storeName" className="flex items-center space-x-2">
                <SettingsIcon className="h-4 w-4" />
                <span>Nombre de la Tienda</span>
              </Label>
              <Input
                id="storeName"
                {...form.register("storeName")}
                placeholder="Ej: ServicePro Climatización"
              />
              {form.formState.errors.storeName && (
                <p className="text-sm text-red-600">{form.formState.errors.storeName.message}</p>
              )}
            </div>

            {/* Dirección de la tienda */}
            <div className="space-y-2">
              <Label htmlFor="storeAddress" className="flex items-center space-x-2">
                <Globe className="h-4 w-4" />
                <span>Dirección</span>
              </Label>
              <Input
                id="storeAddress"
                {...form.register("storeAddress")}
                placeholder="Ej: Av. Principal 123, Ciudad"
              />
              {form.formState.errors.storeAddress && (
                <p className="text-sm text-red-600">{form.formState.errors.storeAddress.message}</p>
              )}
            </div>

            {/* Email de la tienda */}
            <div className="space-y-2">
              <Label htmlFor="storeEmail" className="flex items-center space-x-2">
                <Globe className="h-4 w-4" />
                <span>Email de Contacto</span>
              </Label>
              <Input
                id="storeEmail"
                {...form.register("storeEmail")}
                placeholder="Ej: contacto@servicepro.com"
                type="email"
              />
              {form.formState.errors.storeEmail && (
                <p className="text-sm text-red-600">{form.formState.errors.storeEmail.message}</p>
              )}
            </div>
          </div>

          <div className="flex justify-end space-x-4">
            <Button
              type="submit"
              disabled={saveStoreConfigMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {saveStoreConfigMutation.isPending && (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              )}
              Guardar Configuración
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export default function Settings() {
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [autoRefreshLogs, setAutoRefreshLogs] = useState(true);
  const { toast } = useToast();
  const { user } = useAuth();
 console.log("🔍 Settings Debug:");
  console.log("user:", user);
  console.log("user?.storeId:", user?.storeId);
  console.log("!!user?.storeId:", !!user?.storeId);
  if (!user) return <div>Loading...</div>;

  // ✅ Queries principales
  const { data: config = {}, isLoading } = useQuery<any>({
    queryKey: ["/api/whatsapp-settings"],
  });

  const { data: connectionStatus = {} } = useQuery<any>({
    queryKey: ["/api/whatsapp/status"],
  });

  // ✅ CORREGIDO: Query única para logs con condicional auto-refresh
 const { data: whatsappLogs = [], isLoading: logsLoading, refetch: refetchLogs } = useQuery<WhatsAppLog[]>({
  queryKey: ["/api/whatsapp/logs"],
  queryFn: async () => {
    const token = localStorage.getItem("token"); // O ajusta según dónde almacenes el token

    const res = await fetch("/api/whatsapp/logs", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      console.error("Error en fetch:", res.status);
      return [];
    }

    const json = await res.json();

    if (!Array.isArray(json)) {
      console.error("La respuesta no es un arreglo:", json);
      return [];
    }

    return json;
  },
  refetchInterval: autoRefreshLogs ? 30000 : false,
});


  // ✅ Query para estadísticas de logs
  const { data: logsStats } = useQuery<WhatsAppLogStats>({
    queryKey: ["/api/whatsapp/logs/stats"],
    refetchInterval: autoRefreshLogs ? 60000 : false, // Respeta la configuración del usuario
    // enabled: !!user?.storeId
  });

  const form = useForm<WhatsAppConfig>({
    resolver: zodResolver(whatsappConfigSchema),
    defaultValues: {
      metaAppId: config.metaAppId || "",
      metaAppSecret: config.metaAppSecret || "",
      whatsappBusinessAccountId: config.whatsappBusinessAccountId || "",
      whatsappPhoneNumberId: config.whatsappPhoneNumberId || "",
      whatsappToken: config.whatsappToken || "",
      whatsappVerifyToken: config.whatsappVerifyToken || "",
      webhookUrl: config.webhookUrl || "https://delivery-web-production.up.railway.app/webhook",
      storeWhatsAppNumber: config.storeWhatsAppNumber || "",
    },
  });

  // ✅ CORREGIDO: Mapear campos del backend al frontend
  useEffect(() => {
    if (config && !isLoading) {
      const newValues = {
        metaAppId: config.appId || "",
        metaAppSecret: config.metaAppSecret || "",
        whatsappBusinessAccountId: config.businessAccountId || "",
        whatsappPhoneNumberId: config.phoneNumberId || "",
        whatsappToken: config.accessToken && !config.accessToken.startsWith("****") ? config.accessToken : "",
        whatsappVerifyToken: config.webhookVerifyToken && !config.webhookVerifyToken.startsWith("****") ? config.webhookVerifyToken : "",
        webhookUrl: config.webhookUrl || "https://delivery-web-production.up.railway.app/webhook",
        storeWhatsAppNumber: config.storeWhatsAppNumber || "",
      };
      
      // Solo actualizar si hay valores nuevos válidos
      const currentValues = form.getValues();
      const hasValidValues = Object.values(newValues).some(value => value && value.length > 0);
      
      if (hasValidValues && JSON.stringify(currentValues) !== JSON.stringify(newValues)) {
        form.reset(newValues, { keepDefaultValues: true });
      }
    }
  }, [config, isLoading, form]);

  const saveConfigMutation = useMutation({
    mutationFn: async (data: WhatsAppConfig) => {
      // Detectar solo los campos que han cambiado y no están vacíos
      const changedFields: Partial<WhatsAppConfig> = {};
      const originalData = {
        metaAppId: config.appId || "",
        metaAppSecret: config.metaAppSecret || "",
        whatsappBusinessAccountId: config.businessAccountId || "",
        whatsappPhoneNumberId: config.phoneNumberId || "",
        whatsappToken: config.accessToken || "",
        whatsappVerifyToken: config.webhookVerifyToken || "",
        webhookUrl: config.webhookUrl || "https://delivery-web-production.up.railway.app/webhook",
        storeWhatsAppNumber: config.storeWhatsAppNumber || "",
      };

      // Comparar cada campo y solo incluir los que han cambiado y tienen valor
      Object.keys(data).forEach((key) => {
        const typedKey = key as keyof WhatsAppConfig;
        const newValue = data[typedKey];
        const oldValue = originalData[typedKey];
        
        // Solo incluir si el campo tiene valor y es diferente al original
        if (newValue && newValue.trim() !== "" && newValue !== oldValue) {
          changedFields[typedKey] = newValue;
        }
      });

      // Si no hay cambios, no enviar nada
      if (Object.keys(changedFields).length === 0) {
        throw new Error("No se detectaron cambios para guardar");
      }

      // Validar solo los campos que se están enviando
      const fieldsToValidate = Object.fromEntries(
        Object.entries(changedFields).filter(([_, value]) => value !== undefined)
      );
      
      const validatedFields = whatsappPartialSchema.parse(fieldsToValidate);

      // ✅ CORREGIDO: Mapear campos del frontend al formato del backend
      const backendFields: any = {};

      if (validatedFields.whatsappToken) {
        backendFields.accessToken = validatedFields.whatsappToken;
      }
      if (validatedFields.whatsappPhoneNumberId) {
        backendFields.phoneNumberId = validatedFields.whatsappPhoneNumberId;
      }
      if (validatedFields.whatsappBusinessAccountId) {
        backendFields.businessAccountId = validatedFields.whatsappBusinessAccountId;
      }
      if (validatedFields.metaAppId) {
        backendFields.appId = validatedFields.metaAppId;
      }
      if (validatedFields.whatsappVerifyToken) {
        backendFields.webhookVerifyToken = validatedFields.whatsappVerifyToken;
      }
      if (validatedFields.webhookUrl) {
        backendFields.webhookUrl = validatedFields.webhookUrl;
      }
      if (validatedFields.storeWhatsAppNumber) {
        backendFields.storeWhatsAppNumber = validatedFields.storeWhatsAppNumber;
      }
      if (validatedFields.metaAppSecret) {
        backendFields.metaAppSecret = validatedFields.metaAppSecret;
      }

      return apiRequest("PUT", "/api/whatsapp-settings", backendFields);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp-settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/status"] });
      toast({
        title: "Configuración guardada",
        description: "Las credenciales de WhatsApp se han guardado exitosamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo guardar la configuración.",
        variant: "destructive",
      });
    },
  });

  const testConnectionMutation = useMutation({
    mutationFn: async () => {
      setIsTestingConnection(true);
      const storeId = user?.storeId || user?.companyId;
      return apiRequest("POST", "/api/super-admin/whatsapp-test", { 
        storeId,
        phoneNumberId: config.phoneNumberId || form.getValues().whatsappPhoneNumberId
      });
    },
    onSuccess: (result: any) => {
      setIsTestingConnection(false);
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/status"] });
      toast({
        title: result.success ? "Conexión exitosa" : "Error de conexión",
        description: result.message || (result.success ? "La conexión con WhatsApp API es correcta" : "No se pudo establecer conexión"),
        variant: result.success ? "default" : "destructive",
      });
    },
    onError: (error: any) => {
      setIsTestingConnection(false);
      let errorMessage = "No se pudo conectar con WhatsApp Business API.";
      
      if (error.message) {
        if (error.message.includes("403")) {
          errorMessage = "Token de acceso inválido o sin permisos suficientes.";
        } else if (error.message.includes("401")) {
          errorMessage = "Token de acceso expirado o no autorizado.";
        } else if (error.message.includes("404")) {
          errorMessage = "Phone Number ID no encontrado o inválido.";
        } else if (error.message.includes("network")) {
          errorMessage = "Error de red. Verifica tu conexión a internet.";
        } else {
          errorMessage = error.message;
        }
      }
      
      toast({
        title: "Error de conexión",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const toggleShowSecret = (field: string) => {
    setShowSecrets(prev => ({
      ...prev,
      [field]: !prev[field]
    }));
  };

  const onSubmit = (data: WhatsAppConfig) => {
    saveConfigMutation.mutate(data);
  };

  const handleTestConnection = () => {
    testConnectionMutation.mutate();
  };

  const getConnectionStatusBadge = () => {
    if (!connectionStatus) {
      return <Badge variant="secondary">No configurado</Badge>;
    }
    
    return connectionStatus.connected ? (
      <Badge variant="default" className="bg-green-100 text-green-800 border-green-200">
        <CheckCircle className="h-3 w-3 mr-1" />
        Conectado
      </Badge>
    ) : (
      <Badge variant="destructive">
        <XCircle className="h-3 w-3 mr-1" />
        Desconectado
      </Badge>
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Configuración</h1>
            <p className="text-gray-600">Gestiona las configuraciones del sistema y API de WhatsApp</p>
          </div>
          {getConnectionStatusBadge()}
        </div>

        <Tabs defaultValue="whatsapp" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="whatsapp" className="flex items-center space-x-2">
              <Phone className="h-4 w-4" />
              <span>WhatsApp API</span>
            </TabsTrigger>
            <TabsTrigger value="store" className="flex items-center space-x-2">
              <SettingsIcon className="h-4 w-4" />
              <span>Configuración</span>
            </TabsTrigger>
            <TabsTrigger value="logs" className="flex items-center space-x-2">
              <Activity className="h-4 w-4" />
              <span>Logs</span>
            </TabsTrigger>
          </TabsList>

          {/* Configuración de la Tienda */}
          <TabsContent value="store" className="space-y-6">
            <StoreSettings />
          </TabsContent>

          <TabsContent value="whatsapp" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Phone className="h-5 w-5 text-green-600" />
                  <span>Configuración WhatsApp Business API</span>
                </CardTitle>
                <p className="text-sm text-gray-600">
                  Configura las credenciales para conectar con WhatsApp Business API
                </p>
              </CardHeader>
              <CardContent>

                {connectionStatus && !connectionStatus.connected && (
                  <Alert className="mb-6">
                    <XCircle className="h-4 w-4" />
                    <AlertDescription>
                      WhatsApp Business API no está conectado. Verifica las credenciales y prueba la conexión.
                    </AlertDescription>
                  </Alert>
                )}

                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Meta App ID */}
                    <div className="space-y-2">
                      <Label htmlFor="metaAppId" className="flex items-center space-x-2">
                        <Key className="h-4 w-4" />
                        <span>Meta App ID</span>
                      </Label>
                      <Input
                        id="metaAppId"
                        {...form.register("metaAppId")}
                        placeholder="Tu Meta App ID"
                        className="font-mono"
                      />
                      {form.formState.errors.metaAppId && (
                        <p className="text-sm text-red-600">{form.formState.errors.metaAppId.message}</p>
                      )}
                    </div>

                    {/* Meta App Secret */}
                    <div className="space-y-2">
                      <Label htmlFor="metaAppSecret" className="flex items-center space-x-2">
                        <Key className="h-4 w-4" />
                        <span>Meta App Secret</span>
                      </Label>
                      <div className="relative">
                        <Input
                          id="metaAppSecret"
                          {...form.register("metaAppSecret")}
                          type={showSecrets.metaAppSecret ? "text" : "password"}
                          placeholder="Tu Meta App Secret"
                          className="font-mono pr-10"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 top-0 h-full px-3"
                          onClick={() => toggleShowSecret("metaAppSecret")}
                        >
                          {showSecrets.metaAppSecret ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      {form.formState.errors.metaAppSecret && (
                        <p className="text-sm text-red-600">{form.formState.errors.metaAppSecret.message}</p>
                      )}
                    </div>

                    {/* WhatsApp Business Account ID */}
                    <div className="space-y-2">
                      <Label htmlFor="whatsappBusinessAccountId" className="flex items-center space-x-2">
                        <Phone className="h-4 w-4" />
                        <span>WhatsApp Business Account ID</span>
                      </Label>
                      <Input
                        id="whatsappBusinessAccountId"
                        {...form.register("whatsappBusinessAccountId")}
                        placeholder="Tu WhatsApp Business Account ID"
                        className="font-mono"
                      />
                      {form.formState.errors.whatsappBusinessAccountId && (
                        <p className="text-sm text-red-600">{form.formState.errors.whatsappBusinessAccountId.message}</p>
                      )}
                    </div>

                    {/* WhatsApp Phone Number ID */}
                    <div className="space-y-2">
                      <Label htmlFor="whatsappPhoneNumberId" className="flex items-center space-x-2">
                        <Phone className="h-4 w-4" />
                        <span>WhatsApp Phone Number ID</span>
                      </Label>
                      <Input
                        id="whatsappPhoneNumberId"
                        {...form.register("whatsappPhoneNumberId")}
                        placeholder="Tu WhatsApp Phone Number ID"
                        className="font-mono"
                      />
                      {form.formState.errors.whatsappPhoneNumberId && (
                        <p className="text-sm text-red-600">{form.formState.errors.whatsappPhoneNumberId.message}</p>
                      )}
                    </div>

                    {/* WhatsApp Token */}
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="whatsappToken" className="flex items-center space-x-2">
                        <Key className="h-4 w-4" />
                        <span>WhatsApp Token</span>
                      </Label>
                      <div className="relative">
                        <Input
                          id="whatsappToken"
                          {...form.register("whatsappToken")}
                          type={showSecrets.whatsappToken ? "text" : "password"}
                          placeholder="Tu WhatsApp Access Token"
                          className="font-mono pr-10"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 top-0 h-full px-3"
                          onClick={() => toggleShowSecret("whatsappToken")}
                        >
                          {showSecrets.whatsappToken ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      {form.formState.errors.whatsappToken && (
                        <p className="text-sm text-red-600">{form.formState.errors.whatsappToken.message}</p>
                      )}
                    </div>

                    {/* WhatsApp Verify Token */}
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="whatsappVerifyToken" className="flex items-center space-x-2">
                        <Shield className="h-4 w-4" />
                        <span>WhatsApp Verify Token</span>
                      </Label>
                      <div className="relative">
                        <Input
                          id="whatsappVerifyToken"
                          {...form.register("whatsappVerifyToken")}
                          type={showSecrets.whatsappVerifyToken ? "text" : "password"}
                          placeholder="Tu WhatsApp Verify Token"
                          className="font-mono pr-10"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 top-0 h-full px-3"
                          onClick={() => toggleShowSecret("whatsappVerifyToken")}
                        >
                          {showSecrets.whatsappVerifyToken ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      {form.formState.errors.whatsappVerifyToken && (
                        <p className="text-sm text-red-600">{form.formState.errors.whatsappVerifyToken.message}</p>
                      )}
                    </div>

                    {/* Webhook URL */}
                    <div className="space-y-2 col-span-2">
                      <Label htmlFor="webhookUrl" className="flex items-center space-x-2">
                        <Globe className="h-4 w-4" />
                        <span>URL del Webhook</span>
                      </Label>
                      <Input
                        id="webhookUrl"
                        {...form.register("webhookUrl")}
                        placeholder="https://delivery-web-production.up.railway.app/webhook"
                        className="font-mono"
                      />
                      {form.formState.errors.webhookUrl && (
                        <p className="text-sm text-red-600">{form.formState.errors.webhookUrl.message}</p>
                      )}
                      <p className="text-xs text-gray-500">
                        Esta URL recibirá las notificaciones de mensajes de WhatsApp
                      </p>
                    </div>

                    {/* Número de WhatsApp para pedidos */}
                    <div className="space-y-2 col-span-2">
                      <Label htmlFor="storeWhatsAppNumber" className="flex items-center space-x-2">
                        <Phone className="h-4 w-4 text-green-600" />
                        <span>WhatsApp para Pedidos</span>
                      </Label>
                      <Input
                        id="storeWhatsAppNumber"
                        {...form.register("storeWhatsAppNumber")}
                        placeholder="Ej: 5215512345678"
                        className="font-mono"
                      />
                      {form.formState.errors.storeWhatsAppNumber && (
                        <p className="text-sm text-red-600">{form.formState.errors.storeWhatsAppNumber.message}</p>
                      )}
                      <p className="text-xs text-gray-500">
                        Número de WhatsApp donde se enviarán los pedidos del catálogo público (incluir código país: 52)
                      </p>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex justify-between pt-6 border-t">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleTestConnection}
                      disabled={isTestingConnection || testConnectionMutation.isPending}
                    >
                      {isTestingConnection || testConnectionMutation.isPending ? (
                        <div className="flex items-center space-x-2">
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          <span>Probando...</span>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-2">
                          <RefreshCw className="h-4 w-4" />
                          <span>Probar Conexión</span>
                        </div>
                      )}
                    </Button>

                    <Button
                      type="submit"
                      disabled={saveConfigMutation.isPending}
                      className="whatsapp-bg hover:bg-green-600"
                    >
                      {saveConfigMutation.isPending ? (
                        <div className="flex items-center space-x-2">
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          <span>Guardando...</span>
                        </div>
                      ) : (
                        "Guardar Configuración"
                      )}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            {/* Connection Status Card */}
            {connectionStatus && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <span>Estado de Conexión</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Estado</Label>
                      <div>{getConnectionStatusBadge()}</div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Última verificación</Label>
                      <p className="text-sm text-gray-600">
                        {connectionStatus.lastCheck ? 
                          new Date(connectionStatus.lastCheck).toLocaleString() : 
                          "Nunca"
                        }
                      </p>
                    </div>
                    {connectionStatus.phoneNumber && (
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Número de teléfono</Label>
                        <p className="text-sm font-mono">{connectionStatus.phoneNumber}</p>
                      </div>
                    )}
                    {connectionStatus.businessName && (
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Nombre del negocio</Label>
                        <p className="text-sm">{connectionStatus.businessName}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="logs" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Activity className="h-5 w-5 text-blue-600" />
                    <span>Logs de Comunicación WhatsApp</span>
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="autoRefresh"
                        checked={autoRefreshLogs}
                        onChange={(e) => setAutoRefreshLogs(e.target.checked)}
                        className="rounded"
                      />
                      <Label htmlFor="autoRefresh" className="text-sm">
                        Auto-actualizar (30s)
                      </Label>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => refetchLogs()}
                      disabled={logsLoading}
                    >
                      <RefreshCw className={`h-4 w-4 ${logsLoading ? 'animate-spin' : ''}`} />
                    </Button>
                  </div>
                </CardTitle>
                <p className="text-sm text-gray-600">
                  Monitorea en tiempo real las comunicaciones con la API de WhatsApp Business
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Webhook URL Info */}
                  <Alert>
                    <Globe className="h-4 w-4" />
                    <AlertDescription>
                      <strong>Webhook URL configurada:</strong><br />
                      <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                        https://delivery-web-production.up.railway.app/webhook
                      </code>
                    </AlertDescription>
                  </Alert>

                  {/* Logs Container */}
                  <div className="bg-gray-900 text-gray-100 rounded-lg p-4 h-96 overflow-y-auto font-mono text-sm">
                    {logsLoading ? (
                      <div className="flex items-center justify-center h-full">
                        <RefreshCw className="h-6 w-6 animate-spin text-blue-400" />
                        <span className="ml-2 text-blue-400">Cargando logs...</span>
                      </div>
                    ) : whatsappLogs.length === 0 ? (
                      <div className="text-center text-gray-400 mt-8">
                        <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>No hay logs disponibles aún</p>
                        <p className="text-xs mt-1">Los logs aparecerán aquí cuando se reciban mensajes de WhatsApp</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {Array.isArray(whatsappLogs) && whatsappLogs.map((log: WhatsAppLog) => (

                          <div key={log.id} className="border-b border-gray-700 pb-2">
                            <div className="flex justify-between items-start">
                              <span className="text-blue-300">
                                [{new Date(log.timestamp).toLocaleTimeString()}]
                              </span>
                              <span className={`px-2 py-1 rounded text-xs ${
                                log.type === 'incoming' ? 'bg-green-600' :
                                log.type === 'outgoing' ? 'bg-blue-600' :
                                log.type === 'error' ? 'bg-red-600' : 'bg-gray-600'
                              }`}>
                                {log.type || 'info'}
                              </span>
                            </div>
                            <div className="mt-1">
                              <p className="text-white">{log.messageContent || log.errorMessage}</p>
                              {log.rawData && (
                                <pre className="text-gray-300 text-xs mt-1 overflow-x-auto">
                                  {typeof log.rawData === 'string' ? log.rawData : JSON.stringify(log.rawData, null, 2)}
                                </pre>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Connection Stats */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                    <div className="bg-blue-50 p-3 rounded-lg">
                      <p className="text-sm font-medium text-blue-800">Total Logs</p>
                      <p className="text-lg font-bold text-blue-900">
                        {logsStats?.total || whatsappLogs.length}
                      </p>
                    </div>
                    <div className="bg-green-50 p-3 rounded-lg">
                      <p className="text-sm font-medium text-green-800">Mensajes Entrantes</p>
                      <p className="text-lg font-bold text-green-900">
                        {whatsappLogs.filter((log: WhatsAppLog) => log.type === 'incoming').length}
                      </p>
                    </div>
                    <div className="bg-orange-50 p-3 rounded-lg">
                      <p className="text-sm font-medium text-orange-800">Mensajes Salientes</p>
                      <p className="text-lg font-bold text-orange-900">
                        {whatsappLogs.filter((log: WhatsAppLog) => log.type === 'outgoing').length}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

        </Tabs>
      </div>
  );
}