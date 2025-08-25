import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

const configSchema = z.object({
  eventId: z.number(),
  channelId: z.number(),
  isEnabled: z.boolean().default(true),
  recipientType: z.enum(['customer', 'technician', 'admin', 'custom']),
  customRecipients: z.array(z.number()).optional(),
  template: z.string().min(10, 'La plantilla debe tener al menos 10 caracteres'),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  delayMinutes: z.number().min(0).default(0),
});

export default function NotificationConfigForm({ 
  config, 
  events, 
  channels, 
  users,
  onSubmit, 
  onCancel 
}) {
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [templateVariables, setTemplateVariables] = useState([]);

  const form = useForm({
    resolver: zodResolver(configSchema),
    defaultValues: {
      eventId: config?.eventId || '',
      channelId: config?.channelId || '',
      isEnabled: config?.isEnabled ?? true,
      recipientType: config?.recipientType || 'customer',
      customRecipients: config?.customRecipients || [],
      template: config?.template || '',
      priority: config?.priority || 'normal',
      delayMinutes: config?.delayMinutes || 0,
    }
  });

  const watchRecipientType = form.watch('recipientType');
  const watchEventId = form.watch('eventId');

  useEffect(() => {
    // Actualizar variables disponibles según el evento
    const selectedEvent = events.find(e => e.id === watchEventId);
    if (selectedEvent) {
      setTemplateVariables([
        '{recipient.name}', '{recipient.email}', '{recipient.phone}',
        '{order.id}', '{order.status}', '{order.total}', '{order.address}',
        '{technician.name}', '{store.name}', '{store.address}'
      ]);
    }
  }, [watchEventId, events]);

  const handleSubmit = (data) => {
    onSubmit({
      ...data,
      customRecipients: watchRecipientType === 'custom' ? selectedUsers : null
    });
  };

  const insertVariable = (variable) => {
    const currentTemplate = form.getValues('template');
    form.setValue('template', currentTemplate + ' ' + variable);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="eventId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Evento</FormLabel>
                <Select onValueChange={(value) => field.onChange(parseInt(value))} value={field.value?.toString()}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar evento" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {events.map((event) => (
                      <SelectItem key={event.id} value={event.id.toString()}>
                        <div>
                          <div className="font-medium">{event.eventName}</div>
                          <div className="text-xs text-gray-500">{event.description}</div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="channelId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Canal de Notificación</FormLabel>
                <Select onValueChange={(value) => field.onChange(parseInt(value))} value={field.value?.toString()}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar canal" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {channels.filter(c => c.isEnabled).map((channel) => (
                      <SelectItem key={channel.id} value={channel.id.toString()}>
                        <div className="flex items-center gap-2">
                          {channel.name === 'whatsapp' && '💬'}
                          {channel.name === 'email' && '📧'}
                          {channel.name === 'app' && '📱'}
                          <span className="capitalize">{channel.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="recipientType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tipo de Destinatario</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="customer">Cliente de la orden</SelectItem>
                  <SelectItem value="technician">Técnico asignado</SelectItem>
                  <SelectItem value="admin">Todos los administradores</SelectItem>
                  <SelectItem value="custom">Usuarios específicos</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {watchRecipientType === 'custom' && (
          <div className="space-y-2">
            <FormLabel>Usuarios Específicos</FormLabel>
            <div className="border rounded p-3 max-h-40 overflow-y-auto">
              {users.map((user) => (
                <label key={user.id} className="flex items-center gap-2 p-1">
                  <input
                    type="checkbox"
                    checked={selectedUsers.includes(user.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedUsers([...selectedUsers, user.id]);
                      } else {
                        setSelectedUsers(selectedUsers.filter(id => id !== user.id));
                      }
                    }}
                  />
                  <span className="text-sm">{user.name} ({user.role})</span>
                </label>
              ))}
            </div>
            <div className="flex flex-wrap gap-1">
              {selectedUsers.map(userId => {
                const user = users.find(u => u.id === userId);
                return (
                  <Badge key={userId} variant="secondary" className="text-xs">
                    {user?.name}
                  </Badge>
                );
              })}
            </div>
          </div>
        )}

        <FormField
          control={form.control}
          name="template"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Plantilla del Mensaje</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  placeholder="Ej: Hola {recipient.name}, tu orden #{order.id} ha cambiado a estado {order.status}"
                  rows={4}
                />
              </FormControl>
              <FormMessage />
              
              <div className="mt-2">
                <p className="text-sm text-gray-600 mb-2">Variables disponibles:</p>
                <div className="flex flex-wrap gap-1">
                  {templateVariables.map((variable) => (
                    <Button
                      key={variable}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs h-6"
                      onClick={() => insertVariable(variable)}
                    >
                      {variable}
                    </Button>
                  ))}
                </div>
              </div>
            </FormItem>
          )}
        />

        <div className="grid grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name="priority"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Prioridad</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="low">🔵 Baja</SelectItem>
                    <SelectItem value="normal">🟡 Normal</SelectItem>
                    <SelectItem value="high">🟠 Alta</SelectItem>
                    <SelectItem value="urgent">🔴 Urgente</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="delayMinutes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Retraso (minutos)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min="0"
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="isEnabled"
            render={({ field }) => (
              <FormItem className="flex items-center space-x-2 space-y-0 pt-6">
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <FormLabel className="text-sm">Activo</FormLabel>
              </FormItem>
            )}
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit">
            {config ? 'Actualizar' : 'Crear'} Configuración
          </Button>
        </div>
      </form>
    </Form>
  );
}
