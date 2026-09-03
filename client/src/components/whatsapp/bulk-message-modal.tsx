import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Radio, User, MessageCircle, Send } from "lucide-react";
import { Customer } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

const bulkMessageSchema = z.object({
  message: z.string().min(1, "El mensaje es requerido"),
  includeOrderInfo: z.boolean().default(false),
});

interface BulkMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function BulkMessageModal({ isOpen, onClose }: BulkMessageModalProps) {
  const [selectedCustomers, setSelectedCustomers] = useState<number[]>([]);
  const [selectAll, setSelectAll] = useState(false);
  const { toast } = useToast();

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const form = useForm({
    resolver: zodResolver(bulkMessageSchema),
    defaultValues: {
      message: "",
      includeOrderInfo: false,
    },
  });

  const sendBulkMessageMutation = useMutation({
    mutationFn: async (data: { customerIds: number[]; message: string; includeOrderInfo: boolean }) => {
      const promises = data.customerIds.map(customerId => {
        const customer = customers?.find((c: Customer) => c.id === customerId);
        if (!customer) return Promise.resolve();
        
        let finalMessage = data.message;
        
        if (data.includeOrderInfo) {
          finalMessage += `\n\n--\nEste mensaje fue enviado desde OrderManager WhatsApp Business\nPara consultas: +52 55 1111-1111`;
        }

        return apiRequest("POST", "/api/whatsapp/send", {
          phone: customer.phone,
          message: finalMessage,
        });
      });

      return Promise.all(promises);
    },
    onSuccess: () => {
      toast({
        title: "Mensajes enviados",
        description: `Se enviaron mensajes a ${selectedCustomers.length} clientes exitosamente.`,
      });
      handleClose();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "No se pudieron enviar todos los mensajes.",
        variant: "destructive",
      });
    },
  });

  const handleClose = () => {
    form.reset();
    setSelectedCustomers([]);
    setSelectAll(false);
    onClose();
  };

  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked);
    if (checked) {
      setSelectedCustomers(customers?.map((c: Customer) => c.id) || []);
    } else {
      setSelectedCustomers([]);
    }
  };

  const handleCustomerToggle = (customerId: number, checked: boolean) => {
    if (checked) {
      setSelectedCustomers(prev => [...prev, customerId]);
    } else {
      setSelectedCustomers(prev => prev.filter(id => id !== customerId));
      setSelectAll(false);
    }
  };

  const onSubmit = (data: any) => {
    if (selectedCustomers.length === 0) {
      toast({
        title: "Error",
        description: "Por favor selecciona al menos un cliente.",
        variant: "destructive",
      });
      return;
    }

    sendBulkMessageMutation.mutate({
      customerIds: selectedCustomers,
      message: data.message,
      includeOrderInfo: data.includeOrderInfo,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Radio className="h-5 w-5 text-primary" />
            <span>Mensaje Masivo WhatsApp</span>
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Message Content */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="message">Mensaje</Label>
              <Textarea
                {...form.register("message")}
                placeholder="Escribe tu mensaje aquí..."
                rows={6}
                className="resize-none"
              />
              {form.formState.errors.message && (
                <p className="text-sm text-destructive">{form.formState.errors.message.message}</p>
              )}
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="includeOrderInfo"
                checked={form.watch("includeOrderInfo")}
                onCheckedChange={(checked) => form.setValue("includeOrderInfo", !!checked)}
              />
              <Label htmlFor="includeOrderInfo" className="text-sm">
                Incluir información de contacto de la empresa
              </Label>
            </div>
          </div>

          {/* Customer Selection */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Seleccionar Clientes</Label>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="selectAll"
                  checked={selectAll}
                  onCheckedChange={handleSelectAll}
                />
                <Label htmlFor="selectAll" className="text-sm">
                  Seleccionar todos ({customers?.length || 0})
                </Label>
              </div>
            </div>

            <Card className="max-h-80 overflow-y-auto">
              <CardContent className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {customers?.map((customer: Customer) => (
                    <div
                      key={customer.id}
                      className={`flex items-center space-x-3 p-3 rounded-lg border transition-colors ${
                        selectedCustomers.includes(customer.id)
                          ? "bg-primary bg-opacity-10 border-primary"
                          : "hover:bg-subtle"
                      }`}
                    >
                      <Checkbox
                        id={`customer-${customer.id}`}
                        checked={selectedCustomers.includes(customer.id)}
                        onCheckedChange={(checked) => handleCustomerToggle(customer.id, !!checked)}
                      />
                      <div className="w-8 h-8 bg-secondary rounded-full flex items-center justify-center">
                        <User className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-sm">{customer.name}</p>
                        <p className="text-xs text-muted-foreground">{customer.phone}</p>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        <MessageCircle className="h-3 w-3 mr-1" />
                        WhatsApp
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Preview */}
          {selectedCustomers.length > 0 && form.watch("message") && (
            <Card>
              <CardContent className="p-4">
                <h4 className="font-medium mb-3">Vista Previa del Mensaje</h4>
                <div className="bg-subtle p-3 rounded-lg">
                  <p className="text-sm whitespace-pre-wrap">{form.watch("message")}</p>
                  {form.watch("includeOrderInfo") && (
                    <div className="border-t pt-2 mt-2 text-xs text-muted-foreground">
                      --<br />
                      Este mensaje fue enviado desde OrderManager WhatsApp Business<br />
                      Para consultas: +52 55 1111-1111
                    </div>
                  )}
                </div>
                <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
                  <span>Se enviará a {selectedCustomers.length} cliente(s)</span>
                  <span>{form.watch("message").length} caracteres</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button 
              type="submit"
              disabled={sendBulkMessageMutation.isPending || selectedCustomers.length === 0 || !form.watch("message")}
              className="whatsapp-bg hover:bg-success"
            >
              {sendBulkMessageMutation.isPending ? (
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Enviando...</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <Send className="h-4 w-4" />
                  <span>Enviar Mensajes ({selectedCustomers.length})</span>
                </div>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}