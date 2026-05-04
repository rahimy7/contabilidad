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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Minus, Package, User } from "lucide-react";
import { Product, Customer } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { ServiceRibbon, isServiceProduct } from "@/components/service-ribbon";

const createOrderSchema = z.object({
  customerId: z.number(),
  description: z.string().min(1, "La descripción es requerida"),
  priority: z.string().default("normal"),
  notes: z.string().optional(),
});

interface CreateOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface OrderItem {
  productId: number;
  quantity: number;
  product?: Product;
  installationComplexity?: number;
  installationCost?: number;
  partsCost?: number;
  laborHours?: number;
  laborRate?: number;
  notes?: string;
}

interface ServicePricing {
  basePrice: number;
  installationCost: number;
  partsCost: number;
  laborHours: number;
  laborRate: number;
  totalPrice: number;
}

export default function CreateOrderModal({ isOpen, onClose }: CreateOrderModalProps) {
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [searchCustomer, setSearchCustomer] = useState("");
  const [newCustomerMode, setNewCustomerMode] = useState(false);
  const [servicePricing, setServicePricing] = useState<Map<number, ServicePricing>>(new Map());
  const { toast } = useToast();

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const form = useForm({
    resolver: zodResolver(createOrderSchema),
    defaultValues: {
      customerId: 0,
      description: "",
      priority: "normal",
      notes: "",
    },
  });

  const createCustomerMutation = useMutation({
    mutationFn: async (customerData: { name: string; phone: string }): Promise<Customer> => {
      const response = await apiRequest("POST", "/api/customers", {
        ...customerData,
        whatsappId: customerData.phone.replace(/\D/g, ''),
      });
      return response as Customer;
    },
    onSuccess: (newCustomer: Customer) => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      setSelectedCustomer(newCustomer);
      setNewCustomerMode(false);
      form.setValue("customerId", newCustomer.id);
    },
  });

  const createOrderMutation = useMutation({
    mutationFn: async (data: any) => {
      const totalAmount = orderItems.reduce((sum, item) => {
        const product = products?.find((p: Product) => p.id === item.productId);
        return sum + (product ? parseFloat(product.price) * item.quantity : 0);
      }, 0);

      const orderData = {
        ...data,
        totalAmount: totalAmount.toString(),
      };

      const orderItemsData = orderItems.map(item => {
        const product = products?.find((p: Product) => p.id === item.productId);
        const unitPrice = product ? parseFloat(product.price) : 0;
        return {
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: unitPrice.toString(),
          totalPrice: (unitPrice * item.quantity).toString(),
        };
      });

      return apiRequest("POST", "/api/orders", {
        order: orderData,
        items: orderItemsData,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/metrics"] });
      toast({
        title: "Pedido creado",
        description: "El pedido ha sido creado exitosamente.",
      });
      handleClose();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo crear el pedido.",
        variant: "destructive",
      });
    },
  });

  const handleClose = () => {
    form.reset();
    setSelectedCustomer(null);
    setOrderItems([]);
    setSearchCustomer("");
    setNewCustomerMode(false);
    onClose();
  };

  const addOrderItem = (productId: number) => {
    const existingItem = orderItems.find(item => item.productId === productId);
    if (existingItem) {
      setOrderItems(items => 
        items.map(item => 
          item.productId === productId 
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      );
    } else {
      setOrderItems(items => [...items, { productId, quantity: 1 }]);
    }
  };

  const updateItemQuantity = (productId: number, quantity: number) => {
    if (quantity <= 0) {
      setOrderItems(items => items.filter(item => item.productId !== productId));
    } else {
      setOrderItems(items => 
        items.map(item => 
          item.productId === productId 
            ? { ...item, quantity }
            : item
        )
      );
    }
  };

  const calculateTotal = () => {
    return orderItems.reduce((sum, item) => {
      const product = Array.isArray(products) ? products.find((p: Product) => p.id === item.productId) : null;
      return sum + (product ? parseFloat(product.price) * item.quantity : 0);
    }, 0);
  };

  const filteredCustomers = customers?.filter((customer: Customer) =>
    customer.name.toLowerCase().includes(searchCustomer.toLowerCase()) ||
    customer.phone.includes(searchCustomer)
  ) || [];

  const onSubmit = (data: any) => {
    if (!selectedCustomer) {
      toast({
        title: "Error",
        description: "Por favor selecciona o crea un cliente.",
        variant: "destructive",
      });
      return;
    }

    if (orderItems.length === 0) {
      toast({
        title: "Error",
        description: "Por favor agrega al menos un producto o servicio.",
        variant: "destructive",
      });
      return;
    }

    createOrderMutation.mutate({
      ...data,
      customerId: selectedCustomer.id,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Crear Nuevo Pedido</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Customer Selection */}
          <div className="space-y-4">
            <Label>Cliente</Label>
            
            {!selectedCustomer ? (
              <div className="space-y-3">
                {!newCustomerMode ? (
                  <>
                    <Input
                      placeholder="Buscar cliente por nombre o teléfono..."
                      value={searchCustomer}
                      onChange={(e) => setSearchCustomer(e.target.value)}
                    />
                    
                    {searchCustomer && (
                      <div className="border rounded-lg max-h-40 overflow-y-auto">
                        {filteredCustomers.length > 0 ? (
                          filteredCustomers.map((customer: Customer) => (
                            <div
                              key={customer.id}
                              onClick={() => {
                                setSelectedCustomer(customer);
                                form.setValue("customerId", customer.id);
                              }}
                              className="p-3 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                            >
                              <div className="flex items-center space-x-3">
                                <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                                  <User className="h-4 w-4 text-gray-600" />
                                </div>
                                <div>
                                  <p className="font-medium">{customer.name}</p>
                                  <p className="text-sm text-gray-500">{customer.phone}</p>
                                </div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="p-3 text-center text-gray-500">
                            No se encontraron clientes
                          </div>
                        )}
                      </div>
                    )}
                    
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setNewCustomerMode(true)}
                      className="w-full"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Crear nuevo cliente
                    </Button>
                  </>
                ) : (
                  <Card>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium">Nuevo Cliente</h4>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setNewCustomerMode(false)}
                        >
                          Cancelar
                        </Button>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>Nombre completo</Label>
                          <Input
                            placeholder="Nombre del cliente"
                            id="newCustomerName"
                          />
                        </div>
                        <div>
                          <Label>Teléfono</Label>
                          <Input
                            placeholder="+52 55 1234-5678"
                            id="newCustomerPhone"
                          />
                        </div>
                      </div>
                      
                      <Button
                        type="button"
                        onClick={() => {
                          const nameEl = document.getElementById("newCustomerName") as HTMLInputElement;
                          const phoneEl = document.getElementById("newCustomerPhone") as HTMLInputElement;
                          
                          if (nameEl.value && phoneEl.value) {
                            createCustomerMutation.mutate({
                              name: nameEl.value,
                              phone: phoneEl.value,
                            });
                          }
                        }}
                        disabled={createCustomerMutation.isPending}
                        className="w-full"
                      >
                        {createCustomerMutation.isPending ? "Creando..." : "Crear Cliente"}
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-primary bg-opacity-10 rounded-full flex items-center justify-center">
                        <User className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{selectedCustomer.name}</p>
                        <p className="text-sm text-gray-500">{selectedCustomer.phone}</p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedCustomer(null)}
                    >
                      Cambiar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Products Selection */}
          <div className="space-y-4">
            <Label>Productos y Servicios</Label>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-60 overflow-y-auto">
              {Array.isArray(products) && products.map((product: Product) => {
                const orderItem = orderItems.find(item => item.productId === product.id);
                return (
                  <Card key={product.id} className="cursor-pointer hover:shadow-md transition-shadow relative overflow-hidden">
                    {isServiceProduct(product as any) && <ServiceRibbon size="sm" />}
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start space-x-3 flex-1">
                          <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                            <Package className="h-5 w-5 text-gray-600" />
                          </div>
                          <div className="flex-1">
                            <h4 className="font-medium text-sm">{product.name}</h4>
                            <p className="text-xs text-gray-500 mt-1">{product.description}</p>
                            <div className="flex items-center space-x-2 mt-2">
                              <Badge variant={(product as any).type === 'service' || product.category === "service" ? "secondary" : "default"} className="text-xs">
                                {(product as any).type === 'service' || product.category === "service" ? "Servicio" : "Producto"}
                              </Badge>
                              <span className="text-sm font-semibold text-primary">
                                ${parseFloat(product.price).toLocaleString('es-MX')}
                              </span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          {orderItem ? (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => updateItemQuantity(product.id, orderItem.quantity - 1)}
                              >
                                <Minus className="h-3 w-3" />
                              </Button>
                              <span className="text-sm font-medium w-8 text-center">
                                {orderItem.quantity}
                              </span>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => updateItemQuantity(product.id, orderItem.quantity + 1)}
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                            </>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => addOrderItem(product.id)}
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Agregar
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Order Summary */}
          {orderItems.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <h4 className="font-medium mb-3">Resumen del Pedido</h4>
                <div className="space-y-2">
                  {orderItems.map(item => {
                    const product = products?.find((p: Product) => p.id === item.productId);
                    if (!product) return null;
                    
                    return (
                      <div key={item.productId} className="flex justify-between text-sm">
                        <span>{product.name} x {item.quantity}</span>
                        <span>${(parseFloat(product.price) * item.quantity).toLocaleString('es-MX')}</span>
                      </div>
                    );
                  })}
                  <div className="border-t pt-2 flex justify-between font-semibold">
                    <span>Total:</span>
                    <span>${calculateTotal().toLocaleString('es-MX')}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Order Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="description">Descripción del Pedido</Label>
              <Textarea
                {...form.register("description")}
                placeholder="Describe brevemente el pedido..."
                rows={3}
              />
              {form.formState.errors.description && (
                <p className="text-sm text-red-600">{form.formState.errors.description.message}</p>
              )}
            </div>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Prioridad</Label>
                <Select
                  value={form.watch("priority")}
                  onValueChange={(value) => form.setValue("priority", value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Baja</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                    <SelectItem value="urgent">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="notes">Notas Internas</Label>
                <Textarea
                  {...form.register("notes")}
                  placeholder="Notas adicionales..."
                  rows={2}
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button 
              type="submit"
              disabled={createOrderMutation.isPending || !selectedCustomer || orderItems.length === 0}
            >
              {createOrderMutation.isPending ? "Creando..." : "Crear Pedido"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
