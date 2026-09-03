import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MessageCircle, Send, RefreshCw, CheckCircle, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const sendMessageSchema = z.object({
  to: z.string().min(1, "Número de teléfono es requerido"),
  message: z.string().min(1, "Mensaje es requerido").max(4096, "Mensaje muy largo"),
});

type SendMessageData = z.infer<typeof sendMessageSchema>;

interface SendMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultPhone?: string;
}

export default function SendMessageModal({ isOpen, onClose, defaultPhone = "" }: SendMessageModalProps) {
  const [sendStatus, setSendStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<SendMessageData>({
    resolver: zodResolver(sendMessageSchema),
    defaultValues: {
      to: defaultPhone,
      message: "",
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (data: SendMessageData) => {
      setSendStatus('sending');
      return apiRequest("POST", "/api/whatsapp/send-message", data);
    },
    onSuccess: (result) => {
      setSendStatus('success');
      toast({
        title: "Mensaje enviado",
        description: `Mensaje enviado exitosamente a ${form.getValues('to')}`,
      });
      
      // Invalidate WhatsApp logs to refresh them
      queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      
      // Reset form
      form.reset({ to: defaultPhone, message: "" });
      
      // Close modal after short delay
      setTimeout(() => {
        onClose();
        setSendStatus('idle');
      }, 2000);
    },
    onError: (error: any) => {
      setSendStatus('error');
      toast({
        title: "Error enviando mensaje",
        description: error.details?.error || "No se pudo enviar el mensaje de WhatsApp",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: SendMessageData) => {
    sendMessageMutation.mutate(data);
  };

  const handleClose = () => {
    if (sendStatus !== 'sending') {
      form.reset({ to: defaultPhone, message: "" });
      setSendStatus('idle');
      onClose();
    }
  };

  const formatPhoneNumber = (phone: string) => {
    // Remove non-digits and format for display
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length >= 10) {
      return `+${cleaned}`;
    }
    return phone;
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <MessageCircle className="h-5 w-5 text-success" />
            <span>Enviar Mensaje WhatsApp</span>
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {/* Phone Number */}
          <div className="space-y-2">
            <Label htmlFor="to">Número de teléfono</Label>
            <Input
              id="to"
              {...form.register("to")}
              placeholder="+52 55 1234-5678"
              disabled={sendStatus === 'sending'}
            />
            {form.formState.errors.to && (
              <p className="text-sm text-destructive">{form.formState.errors.to.message}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Incluye código de país (ej: +52 para México)
            </p>
          </div>

          {/* Message */}
          <div className="space-y-2">
            <Label htmlFor="message">Mensaje</Label>
            <Textarea
              id="message"
              {...form.register("message")}
              placeholder="Escribe tu mensaje aquí..."
              rows={4}
              disabled={sendStatus === 'sending'}
              className="resize-none"
            />
            {form.formState.errors.message && (
              <p className="text-sm text-destructive">{form.formState.errors.message.message}</p>
            )}
            <p className="text-xs text-muted-foreground">
              {form.watch("message")?.length || 0}/4096 caracteres
            </p>
          </div>

          {/* Status Messages */}
          {sendStatus === 'success' && (
            <Alert className="bg-success/10 border-success/40">
              <CheckCircle className="h-4 w-4 text-success" />
              <AlertDescription className="text-success">
                Mensaje enviado exitosamente a {formatPhoneNumber(form.getValues('to'))}
              </AlertDescription>
            </Alert>
          )}

          {sendStatus === 'error' && (
            <Alert className="bg-destructive/10 border-destructive/40">
              <XCircle className="h-4 w-4 text-destructive" />
              <AlertDescription className="text-destructive">
                Error enviando mensaje. Verifica la configuración de WhatsApp.
              </AlertDescription>
            </Alert>
          )}

          {/* Actions */}
          <div className="flex justify-between items-center pt-4">
            <Badge variant="outline" className="text-xs">
              WhatsApp Business API
            </Badge>
            
            <div className="flex space-x-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={sendStatus === 'sending'}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={sendStatus === 'sending' || sendStatus === 'success'}
                className="whatsapp-bg hover:bg-success"
              >
                {sendStatus === 'sending' ? (
                  <div className="flex items-center space-x-2">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Enviando...</span>
                  </div>
                ) : sendStatus === 'success' ? (
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="h-4 w-4" />
                    <span>Enviado</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <Send className="h-4 w-4" />
                    <span>Enviar</span>
                  </div>
                )}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}