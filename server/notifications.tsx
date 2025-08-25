import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  Clock
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

export default function NotificationsPage() {
  const [activeTab, setActiveTab] = useState("notifications");
  const [configDialog, setConfigDialog] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Queries
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

  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Sistema de Notificaciones</h1>
          <p className="text-gray-600">
            Configure notificaciones automáticas para eventos de órdenes
          </p>
        </div>
        <Button onClick={() => setConfigDialog(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Nueva Configuración
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="notifications">Notificaciones</TabsTrigger>
          <TabsTrigger value="channels">Canales</TabsTrigger>
          <TabsTrigger value="configs">Configuración</TabsTrigger>
          <TabsTrigger value="history">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="notifications">
          <NotificationsTab />
        </TabsContent>

        <TabsContent value="channels">
          <ChannelsTab channels={channels} />
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

// Componentes específicos para cada tab...
const NotificationsTab = () => (
  <div className="space-y-6">
    <Card>
      <CardHeader>
        <CardTitle>Notificaciones Recientes</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-gray-500">Lista de notificaciones del usuario actual</p>
      </CardContent>
    </Card>
  </div>
);

const ChannelsTab = ({ channels }) => (
  <div className="space-y-6">
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {channels.map((channel) => (
        <Card key={channel.id}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {channel.name === 'whatsapp' && <MessageSquare className="w-5 h-5" />}
              {channel.name === 'email' && <Mail className="w-5 h-5" />}
              {channel.name === 'app' && <Smartphone className="w-5 h-5" />}
              {channel.name}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">
                {channel.isEnabled ? 'Activo' : 'Inactivo'}
              </span>
              <Switch checked={channel.isEnabled} />
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
              <span>{config.eventName}</span>
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
              <p><strong>Canal:</strong> {config.channelName}</p>
              <p><strong>Destinatario:</strong> {config.recipientType}</p>
              <p><strong>Plantilla:</strong> {config.template}</p>
            </div>
          </CardContent>
        </Card>
      ))}
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
                <p className="text-sm text-gray-600">{item.channel} - {item.recipientType}</p>
              </div>
              <Badge variant={item.status === 'sent' ? 'default' : 'destructive'}>
                {item.status}
              </Badge>
            </div>
          ))}
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
                  {channels.map((channel) => (
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Prioridad</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Normal" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Baja</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                  <SelectItem value="urgent">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Retraso (minutos)</Label>
              <Input type="number" placeholder="0" />
            </div>
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