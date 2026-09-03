// =====================================
// ARCHIVO: client/src/pages/notifications.tsx - REEMPLAZAR CONTENIDO COMPLETO
// =====================================

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { 
  Bell, 
  Settings, 
  Plus, 
  Edit, 
  Trash2, 
  MessageSquare, 
  Mail, 
  Smartphone,
  History,
  Users,
  Clock,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  BellOff
} from "lucide-react";

export default function NotificationsPage() {
  const [activeTab, setActiveTab] = useState("notifications");
  const [configDialog, setConfigDialog] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Queries existentes (mantener)
  const { data: notifications = [], isLoading } = useQuery({
  queryKey: ["/api/notifications"],
  queryFn: () => apiRequest("GET", "/api/notifications").catch(() => [])
});

  const { data: counts = { total: 0, unread: 0 } } = useQuery({
    queryKey: ["/api/notifications/count"],
    queryFn: () => apiRequest("GET", "/api/notifications/count")
  });

  // Nuevas queries para el sistema de configuración
  const { data: channels = [] } = useQuery({
    queryKey: ["/api/notification-channels"],
    queryFn: () => apiRequest("GET", "/api/notification-channels")
  });

  const { data: events = [] } = useQuery({
    queryKey: ["/api/notification-events"],
    queryFn: () => apiRequest("GET", "/api/notification-events")
  });

  const { data: configs = [] } = useQuery({
    queryKey: ["/api/notification-configs"],
    queryFn: () => apiRequest("GET", "/api/notification-configs")
  });

  const { data: history = [] } = useQuery({
    queryKey: ["/api/notification-history"],
    queryFn: () => apiRequest("GET", "/api/notification-history")
  });

  // Mutation para actualizar canales
  const updateChannelMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiRequest("PUT", `/api/notification-channels/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notification-channels"] });
      toast({ title: "Canal actualizado" });
    }
  });

  

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight">Sistema de Notificaciones</h1>
          <p className="text-muted-foreground">
            Configure notificaciones automáticas para eventos de órdenes
          </p>
        </div>
        <Button onClick={() => setConfigDialog(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Nueva Configuración
        </Button>
      </div>

      {/* Stats actuales */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-2xl font-bold">{Array.isArray(notifications) ? notifications.length : 0}</p>
              </div>
              <Bell className="w-8 h-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Sin leer</p>
              
                <p className="text-2xl font-bold text-primary">
  {Array.isArray(notifications) ? notifications.filter(n => !n?.isRead).length : 0}
</p>
              </div>
              <BellOff className="w-8 h-8 text-primary/70" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Urgentes</p>
                <p className="text-2xl font-bold text-destructive">0</p>
              </div>
              <AlertCircle className="w-8 h-8 text-destructive" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Mensajes</p>
                <p className="text-2xl font-bold text-success">0</p>
              </div>
              <MessageSquare className="w-8 h-8 text-success" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="notifications">Notificaciones</TabsTrigger>
          <TabsTrigger value="channels">Canales</TabsTrigger>
          <TabsTrigger value="configs">Configuración</TabsTrigger>
          <TabsTrigger value="history">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="notifications">
          <NotificationsTab notifications={notifications} />
        </TabsContent>

        <TabsContent value="channels">
          <ChannelsTab channels={channels} onUpdate={updateChannelMutation.mutate} />
        </TabsContent>

        <TabsContent value="configs">
          <ConfigsTab configs={configs} events={events} channels={channels} />
        </TabsContent>

        <TabsContent value="history">
          <HistoryTab history={history} />
        </TabsContent>
      </Tabs>

      <NotificationConfigDialog
        open={configDialog}
        onOpenChange={setConfigDialog}
        config={selectedConfig}
        events={events}
        channels={channels}
      />
    </div>
  );
}

// Componente de notificaciones (mantener existente)
const NotificationsTab = ({ notifications }) => (
  <div className="space-y-6">
    <Card>
      <CardHeader>
        <CardTitle>Notificaciones Recientes</CardTitle>
      </CardHeader>
      <CardContent>
        {notifications.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">No hay notificaciones</p>
        ) : (
          <div className="space-y-3">
            {notifications.map((notification) => (
              <div key={notification.id} className="flex items-start gap-3 p-3 border rounded">
                <Bell className="w-5 h-5 text-primary mt-1" />
                <div className="flex-1">
                  <h4 className="font-medium">{notification.title}</h4>
                  <p className="text-sm text-muted-foreground">{notification.message}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(notification.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  </div>
);

const ChannelsTab = ({ channels, onUpdate }) => (
  <div className="space-y-6">
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {channels.map((channel) => (
        <Card key={channel.id}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {channel.name === 'whatsapp' && <MessageSquare className="w-5 h-5 text-success" />}
              {channel.name === 'email' && <Mail className="w-5 h-5 text-primary" />}
              {channel.name === 'app' && <Smartphone className="w-5 h-5 text-primary" />}
              <span className="capitalize">{channel.name}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {channel.isEnabled ? 'Activo' : 'Inactivo'}
              </span>
              <Switch 
                checked={channel.isEnabled} 
                onCheckedChange={(enabled) =>
                  onUpdate({ id: channel.id, data: { ...channel, isEnabled: enabled } })
                }
              />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  </div>
);

const ConfigsTab = ({ configs, events, channels }) => (
  <div className="space-y-6">
    <div className="grid gap-4">
      {configs.map((config) => (
        <Card key={config.id}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{config.eventName || 'Evento'}</span>
              <div className="flex gap-2">
                <Badge variant={config.isEnabled ? "default" : "secondary"}>
                  {config.isEnabled ? "Activo" : "Inactivo"}
                </Badge>
                <Button variant="ghost" size="sm">
                  <Edit className="w-4 h-4" />
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p><strong>Canal:</strong> {config.channelName || 'N/A'}</p>
              <p><strong>Destinatario:</strong> {config.recipientType}</p>
              <p><strong>Plantilla:</strong> {config.template}</p>
            </div>
          </CardContent>
        </Card>
      ))}
      
      {configs.length === 0 && (
        <div className="text-center py-8">
          <Settings className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No hay configuraciones de notificación</p>
        </div>
      )}
    </div>
  </div>
);

const HistoryTab = ({ history }) => (
  <div className="space-y-6">
    <Card>
      <CardHeader>
        <CardTitle>Historial de Envíos</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {history.map((item) => (
            <div key={item.id} className="flex items-center justify-between p-3 border rounded">
              <div>
                <p className="font-medium">{item.title}</p>
                <p className="text-sm text-muted-foreground">{item.channel} - {item.recipientType}</p>
              </div>
              <Badge variant={item.status === 'sent' ? 'default' : 'destructive'}>
                {item.status}
              </Badge>
            </div>
          ))}
          
          {history.length === 0 && (
            <div className="text-center py-8">
              <History className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No hay historial de notificaciones</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  </div>
);

const NotificationConfigDialog = ({ open, onOpenChange, config, events, channels }) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {config ? 'Editar' : 'Nueva'} Configuración de Notificación
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Evento</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar evento" />
                </SelectTrigger>
                <SelectContent>
                  {events.map((event) => (
                    <SelectItem key={event.id} value={event.id.toString()}>
                      {event.eventName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Canal</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar canal" />
                </SelectTrigger>
                <SelectContent>
                  {channels.filter(c => c.isEnabled).map((channel) => (
                    <SelectItem key={channel.id} value={channel.id.toString()}>
                      {channel.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div>
            <Label>Tipo de Destinatario</Label>
            <Select>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar destinatario" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="customer">Cliente</SelectItem>
                <SelectItem value="technician">Técnico Asignado</SelectItem>
                <SelectItem value="admin">Administradores</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Plantilla del Mensaje</Label>
            <Textarea
              placeholder="Ej: Hola {recipient.name}, tu orden #{order.id} ha cambiado a estado {order.status}"
              rows={4}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button>
              Guardar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};