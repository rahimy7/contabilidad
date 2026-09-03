import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWarehouse } from "@/contexts/WarehouseContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  Package,
  Plus,
  Search,
  Filter,
  Calendar,
  DollarSign,
  TrendingUp,
  Users,
  CheckCircle,
  Clock,
  XCircle,
  Edit,
  Trash2,
  Eye,
  FileText,
  X,
  Save,
  AlertCircle,
} from "lucide-react";

interface Product {
  id: number;
  name: string;
  sku: string | null;
  barcode: string | null;
  price: string;
  stockQuantity: number;
  category: string;
}

interface Supplier {
  id: number;
  storeId: number;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  taxId: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PurchaseOrderItem {
  id?: number;
  productId: number | null;
  productName: string;
  sku: string | null;
  barcode: string | null;
  quantity: string;
  quantityReceived: string;
  unitId: number | null;
  lotNumber: string | null;
  expirationDate: string | null;
  manufacturingDate: string | null;
  unitCost: string;
  taxRate: string;
  discountRate: string;
  totalCost: string;
  notes: string | null;
}

interface PurchaseOrder {
  id: number;
  storeId: number;
  purchaseNumber: string;
  supplierId: number | null;
  supplierName: string | null;
  orderDate: string;
  expectedDeliveryDate: string | null;
  receivedDate: string | null;
  status: "pending" | "received" | "partial" | "cancelled";
  subtotal: string;
  tax: string;
  discount: string;
  shippingCost: string;
  totalAmount: string;
  currency: string;
  invoiceNumber: string | null;
  referenceNumber: string | null;
  notes: string | null;
  paymentTerms: string | null;
  paymentStatus: "unpaid" | "partial" | "paid";
  createdBy: number;
  createdAt: string;
  updatedAt: string;
  supplier?: Supplier;
  items?: PurchaseOrderItem[];
}

interface PurchaseStats {
  totalOrders: number;
  pendingOrders: number;
  receivedOrders: number;
  totalSpent: string;
  monthlySpending: string;
  topSuppliers: Array<{
    supplierId: number;
    supplierName: string;
    totalSpent: string;
    orderCount: number;
  }>;
}

export default function PurchaseManagement() {
  const [activeTab, setActiveTab] = useState<"orders" | "suppliers">("orders");
  const { activeWarehouseId } = useWarehouse();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [editingOrder, setEditingOrder] = useState<PurchaseOrder | null>(null);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [loadingOrderDetails, setLoadingOrderDetails] = useState(false);

  const queryClient = useQueryClient();

  // Fetch warehouses (only needed for admin users to show warehouse selector)
  const { data: warehouses = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/warehouses"],
    queryFn: async () => {
      const token = localStorage.getItem('auth_token');
      const response = await fetch("/api/warehouses", {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        credentials: "include",
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: isAdmin,
  });

  // Fetch products
  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
    queryFn: async () => {
      const token = localStorage.getItem('auth_token');
      const response = await fetch("/api/products", {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        credentials: "include"
      });
      if (!response.ok) throw new Error("Error al cargar productos");
      return response.json();
    },
  });

  // Fetch purchase orders
  const { data: purchaseOrders = [], isLoading: ordersLoading } = useQuery<PurchaseOrder[]>({
    queryKey: ["/api/purchase-orders", statusFilter, activeWarehouseId],
    queryFn: async () => {
      const token = localStorage.getItem('auth_token');
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.append("status", statusFilter);
      if (activeWarehouseId) params.append("warehouseId", String(activeWarehouseId));
      const response = await fetch(`/api/purchase-orders?${params}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        credentials: "include",
      });
      if (!response.ok) throw new Error("Error al cargar órdenes de compra");
      return response.json();
    },
  });

  // Fetch suppliers
  const { data: suppliers = [], isLoading: suppliersLoading } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers"],
    queryFn: async () => {
      const token = localStorage.getItem('auth_token');
      const response = await fetch("/api/suppliers", {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        credentials: "include"
      });
      if (!response.ok) throw new Error("Error al cargar proveedores");
      return response.json();
    },
  });

  // Fetch purchase stats
  const { data: stats } = useQuery<PurchaseStats>({
    queryKey: ["/api/purchase-stats", activeWarehouseId],
    queryFn: async () => {
      const token = localStorage.getItem('auth_token');
      const params = new URLSearchParams();
      if (activeWarehouseId) params.append("warehouseId", String(activeWarehouseId));
      const response = await fetch(`/api/purchase-stats?${params}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        credentials: "include"
      });
      if (!response.ok) throw new Error("Error al cargar estadísticas");
      return response.json();
    },
  });

  // Receive purchase order mutation
  const receiveMutation = useMutation({
    mutationFn: async (orderId: number) => {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/purchase-orders/${orderId}/receive`, {
        method: "POST",
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        credentials: "include",
      });
      if (!response.ok) throw new Error("Error al recibir orden");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-stats"] });
    },
  });

  // Delete purchase order mutation
  const deleteMutation = useMutation({
    mutationFn: async (orderId: number) => {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/purchase-orders/${orderId}`, {
        method: "DELETE",
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        credentials: "include",
      });
      if (!response.ok) throw new Error("Error al eliminar orden");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-stats"] });
    },
  });

  // Load order details with items
  const loadOrderDetails = async (orderId: number) => {
    setLoadingOrderDetails(true);
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/purchase-orders/${orderId}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        credentials: "include",
      });
      if (!response.ok) throw new Error("Error al cargar detalles de la orden");
      const orderWithItems = await response.json();
      setSelectedOrder(orderWithItems);
    } catch (error) {
      console.error('Error loading order details:', error);
      alert('Error al cargar los detalles de la orden');
    } finally {
      setLoadingOrderDetails(false);
    }
  };

  // Filter orders by search query
  const filteredOrders = purchaseOrders.filter((order) => {
    const matchesSearch =
      order.purchaseNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.supplierName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.invoiceNumber?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const getStatusBadge = (status: string) => {
    const badges = {
      pending: { color: "bg-warning/15 text-warning", icon: Clock, label: "Pendiente" },
      received: { color: "bg-success/10 text-success", icon: CheckCircle, label: "Recibido" },
      partial: { color: "bg-accent text-accent-foreground", icon: Package, label: "Parcial" },
      cancelled: { color: "bg-destructive/10 text-destructive", icon: XCircle, label: "Cancelado" },
    };
    const badge = badges[status as keyof typeof badges] || badges.pending;
    const Icon = badge.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${badge.color}`}>
        <Icon className="w-3 h-3" />
        {badge.label}
      </span>
    );
  };

  const getPaymentStatusBadge = (status: string) => {
    const badges = {
      unpaid: { color: "bg-destructive/10 text-destructive", label: "Sin Pagar" },
      partial: { color: "bg-warning/15 text-warning", label: "Pago Parcial" },
      paid: { color: "bg-success/10 text-success", label: "Pagado" },
    };
    const badge = badges[status as keyof typeof badges] || badges.unpaid;
    return <span className={`px-2 py-1 rounded-full text-xs font-medium ${badge.color}`}>{badge.label}</span>;
  };

  // Create/Edit Purchase Order Modal Component
  const PurchaseOrderModal = () => {
    const [formData, setFormData] = useState({
      supplierId: "",
      orderDate: new Date().toISOString().split("T")[0],
      expectedDeliveryDate: "",
      invoiceNumber: "",
      referenceNumber: "",
      paymentTerms: "",
      shippingCost: "0.00",
      taxRate: "18",
      discountRate: "0",
      notes: "",
      currency: "DOP",
      warehouseId: activeWarehouseId ? String(activeWarehouseId) : "",
    });

    const [items, setItems] = useState<PurchaseOrderItem[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedProductId, setSelectedProductId] = useState<number | null>(null);

    // Create purchase order mutation
    const createMutation = useMutation({
      mutationFn: async (data: any) => {
        const token = localStorage.getItem('auth_token');
        const response = await fetch("/api/purchase-orders", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          credentials: "include",
          body: JSON.stringify(data),
        });
        if (!response.ok) throw new Error("Error al crear orden de compra");
        return response.json();
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
        queryClient.invalidateQueries({ queryKey: ["/api/purchase-stats"] });
        setShowCreateModal(false);
        setFormData({
          supplierId: "",
          orderDate: new Date().toISOString().split("T")[0],
          expectedDeliveryDate: "",
          invoiceNumber: "",
          referenceNumber: "",
          paymentTerms: "",
          shippingCost: "0.00",
          taxRate: "18",
          discountRate: "0",
          notes: "",
          currency: "DOP",
        });
        setItems([]);
      },
    });

    const addItem = () => {
      const product = products.find((p) => p.id === selectedProductId);
      if (!product) return;

      setItems([
        ...items,
        {
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          barcode: product.barcode,
          quantity: "1",
          quantityReceived: "0",
          unitId: null,
          lotNumber: "",
          expirationDate: "",
          manufacturingDate: "",
          unitCost: product.price,
          taxRate: formData.taxRate,
          discountRate: "0",
          totalCost: product.price,
          notes: "",
        },
      ]);
      setSelectedProductId(null);
      setSearchTerm("");
    };

    const removeItem = (index: number) => {
      setItems(items.filter((_, i) => i !== index));
    };

    const updateItem = (index: number, field: keyof PurchaseOrderItem, value: any) => {
      const newItems = [...items];
      newItems[index] = { ...newItems[index], [field]: value };

      // Total de línea = cantidad × costo unitario (sin impuestos/descuentos por ítem)
      const quantity = parseFloat(newItems[index].quantity) || 0;
      const unitCost = parseFloat(newItems[index].unitCost) || 0;

      newItems[index].totalCost = (quantity * unitCost).toFixed(2);
      setItems(newItems);
    };

    // Calculate totals
    const calculateTotals = () => {
      const subtotal = items.reduce((sum, item) => {
        const quantity = parseFloat(item.quantity) || 0;
        const unitCost = parseFloat(item.unitCost) || 0;
        return sum + quantity * unitCost;
      }, 0);

      const discount = items.reduce((sum, item) => {
        const quantity = parseFloat(item.quantity) || 0;
        const unitCost = parseFloat(item.unitCost) || 0;
        const discountRate = parseFloat(item.discountRate) || 0;
        return sum + quantity * unitCost * (discountRate / 100);
      }, 0);

      const taxableAmount = subtotal - discount;
      const tax = items.reduce((sum, item) => {
        const quantity = parseFloat(item.quantity) || 0;
        const unitCost = parseFloat(item.unitCost) || 0;
        const discountRate = parseFloat(item.discountRate) || 0;
        const taxRate = parseFloat(item.taxRate) || 0;
        const itemSubtotal = quantity * unitCost;
        const itemDiscount = itemSubtotal * (discountRate / 100);
        const itemTaxable = itemSubtotal - itemDiscount;
        return sum + itemTaxable * (taxRate / 100);
      }, 0);

      const shippingCost = parseFloat(formData.shippingCost) || 0;
      const total = taxableAmount + tax + shippingCost;

      return { subtotal, discount, tax, shippingCost, total };
    };

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();

      if (!formData.supplierId) {
        alert("Por favor selecciona un proveedor");
        return;
      }

      if (items.length === 0) {
        alert("Por favor agrega al menos un producto");
        return;
      }

      const totals = calculateTotals();

      const orderData = {
        supplierId: parseInt(formData.supplierId),
        warehouseId: formData.warehouseId ? parseInt(formData.warehouseId) : (activeWarehouseId ?? undefined),
        orderDate: formData.orderDate,
        expectedDeliveryDate: formData.expectedDeliveryDate || null,
        invoiceNumber: formData.invoiceNumber || null,
        referenceNumber: formData.referenceNumber || null,
        paymentTerms: formData.paymentTerms || null,
        notes: formData.notes || null,
        currency: formData.currency,
        shippingCost: totals.shippingCost.toFixed(2),
        subtotal: totals.subtotal.toFixed(2),
        discount: totals.discount.toFixed(2),
        tax: totals.tax.toFixed(2),
        totalAmount: totals.total.toFixed(2),
        items: items.map((item) => ({
          productId: item.productId,
          productName: item.productName, // Campo obligatorio
          sku: item.sku || null,
          barcode: item.barcode || null,
          quantity: item.quantity,
          unitCost: item.unitCost,
          lotNumber: item.lotNumber || null,
          expirationDate: item.expirationDate || null,
          manufacturingDate: item.manufacturingDate || null,
          taxRate: item.taxRate,
          discountRate: item.discountRate,
          totalCost: item.totalCost,
          notes: item.notes || null,
        })),
      };

      createMutation.mutate(orderData);
    };

    const totals = calculateTotals();
    const filteredProducts = products.filter(
      (p) =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.barcode?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-card rounded-lg shadow-xl max-w-7xl w-full max-h-[90vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-border">
            <h2 className="text-2xl font-bold text-foreground">Nueva Orden de Compra</h2>
            <button
              onClick={() => setShowCreateModal(false)}
              className="text-muted-foreground hover:text-muted-foreground transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Form Content */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Order Information */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Proveedor <span className="text-destructive">*</span>
                </label>
                <select
                  value={formData.supplierId}
                  onChange={(e) => setFormData({ ...formData, supplierId: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  required
                >
                  <option value="">Seleccionar proveedor</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Warehouse selector — only shown to admin users */}
              {isAdmin && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Almacén destino <span className="text-destructive">*</span>
                  </label>
                  <select
                    value={formData.warehouseId}
                    onChange={(e) => setFormData({ ...formData, warehouseId: e.target.value })}
                    className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    required
                  >
                    <option value="">Seleccionar almacén</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Fecha de Orden <span className="text-destructive">*</span>
                </label>
                <input
                  type="date"
                  value={formData.orderDate}
                  onChange={(e) => setFormData({ ...formData, orderDate: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Fecha Esperada de Entrega</label>
                <input
                  type="date"
                  value={formData.expectedDeliveryDate}
                  onChange={(e) => setFormData({ ...formData, expectedDeliveryDate: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Número de Factura</label>
                <input
                  type="text"
                  value={formData.invoiceNumber}
                  onChange={(e) => setFormData({ ...formData, invoiceNumber: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="Ej: FAC-2024-001"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Número de Referencia</label>
                <input
                  type="text"
                  value={formData.referenceNumber}
                  onChange={(e) => setFormData({ ...formData, referenceNumber: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="Referencia interna"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Moneda</label>
                <select
                  value={formData.currency}
                  onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                >
                  <option value="DOP">DOP (Peso Dominicano)</option>
                  <option value="USD">USD (Dólar)</option>
                </select>
              </div>

              <div className="md:col-span-3">
                <label className="block text-sm font-medium text-foreground mb-2">Términos de Pago</label>
                <input
                  type="text"
                  value={formData.paymentTerms}
                  onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="Ej: Net 30, COD, etc."
                />
              </div>
            </div>

            {/* Products Section */}
            <div className="border-t border-border pt-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">Productos</h3>

              {/* Add Product */}
              <div className="flex gap-2 mb-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setSelectedProductId(null);
                    }}
                    placeholder="Buscar producto por nombre, SKU o código de barras..."
                    className="w-full pl-10 pr-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                  {searchTerm && filteredProducts.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-card border border-border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {filteredProducts.slice(0, 10).map((product) => (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => {
                            setSelectedProductId(product.id);
                            setSearchTerm(product.name);
                          }}
                          className="w-full px-4 py-2 text-left hover:bg-accent flex items-center justify-between"
                        >
                          <div>
                            <div className="font-medium text-foreground">{product.name}</div>
                            <div className="text-sm text-muted-foreground">
                              {product.sku && `SKU: ${product.sku}`}
                              {product.barcode && ` | Código: ${product.barcode}`}
                            </div>
                          </div>
                          <div className="text-sm font-medium text-foreground">${parseFloat(product.price).toFixed(2)}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={addItem}
                  disabled={!selectedProductId}
                  className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary-hover disabled:bg-muted-foreground disabled:cursor-not-allowed transition-colors"
                >
                  <Plus className="w-5 h-5" />
                  Agregar
                </button>
              </div>

              {/* Items Table */}
              {items.length > 0 ? (
                <div className="overflow-x-auto border border-border rounded-lg">
                  <table className="w-full">
                    <thead className="bg-subtle border-b border-border">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Producto</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Lote</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">F. Vencimiento</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">F. Fabricación</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Cantidad</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Costo Unitario</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Impuesto %</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Desc. %</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Total</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {items.map((item, index) => (
                        <tr key={index} className="hover:bg-subtle">
                          <td className="px-4 py-3">
                            <div className="font-medium text-foreground">{item.productName}</div>
                            {item.sku && <div className="text-xs text-muted-foreground">SKU: {item.sku}</div>}
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={item.lotNumber || ""}
                              onChange={(e) => updateItem(index, "lotNumber", e.target.value)}
                              className="w-24 px-2 py-1 text-sm border border-border rounded focus:ring-2 focus:ring-primary focus:border-transparent"
                              placeholder="Lote"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="date"
                              value={item.expirationDate || ""}
                              onChange={(e) => updateItem(index, "expirationDate", e.target.value)}
                              className="w-36 px-2 py-1 text-sm border border-border rounded focus:ring-2 focus:ring-primary focus:border-transparent"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="date"
                              value={item.manufacturingDate || ""}
                              onChange={(e) => updateItem(index, "manufacturingDate", e.target.value)}
                              className="w-36 px-2 py-1 text-sm border border-border rounded focus:ring-2 focus:ring-primary focus:border-transparent"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              value={item.quantity}
                              onChange={(e) => updateItem(index, "quantity", e.target.value)}
                              className="w-20 px-2 py-1 text-sm border border-border rounded focus:ring-2 focus:ring-primary focus:border-transparent"
                              required
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={item.unitCost}
                              onChange={(e) => updateItem(index, "unitCost", e.target.value)}
                              className="w-24 px-2 py-1 text-sm border border-border rounded focus:ring-2 focus:ring-primary focus:border-transparent"
                              required
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              max="100"
                              value={item.taxRate}
                              onChange={(e) => updateItem(index, "taxRate", e.target.value)}
                              className="w-16 px-2 py-1 text-sm border border-border rounded focus:ring-2 focus:ring-primary focus:border-transparent"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              max="100"
                              value={item.discountRate}
                              onChange={(e) => updateItem(index, "discountRate", e.target.value)}
                              className="w-16 px-2 py-1 text-sm border border-border rounded focus:ring-2 focus:ring-primary focus:border-transparent"
                            />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="font-semibold text-foreground">${parseFloat(item.totalCost).toFixed(2)}</div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              type="button"
                              onClick={() => removeItem(index)}
                              className="p-1 text-destructive hover:bg-destructive/10 rounded transition-colors"
                              title="Eliminar"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-12 border border-border rounded-lg bg-subtle">
                  <Package className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">No hay productos agregados</p>
                  <p className="text-sm text-muted-foreground mt-1">Busca y agrega productos a la orden de compra</p>
                </div>
              )}
            </div>

            {/* Totals and Additional Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-border pt-6">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Notas</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={4}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="Notas adicionales sobre la orden..."
                />

                <label className="block text-sm font-medium text-foreground mb-2 mt-4">Costo de Envío</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.shippingCost}
                  onChange={(e) => setFormData({ ...formData, shippingCost: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>

              <div className="bg-subtle p-6 rounded-lg border border-border">
                <h4 className="text-lg font-semibold text-foreground mb-4">Resumen de Costos</h4>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal:</span>
                    <span className="font-medium text-foreground">${totals.subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Descuento:</span>
                    <span className="font-medium text-destructive">-${totals.discount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Impuestos:</span>
                    <span className="font-medium text-foreground">${totals.tax.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Envío:</span>
                    <span className="font-medium text-foreground">${totals.shippingCost.toFixed(2)}</span>
                  </div>
                  <div className="border-t border-border pt-3 flex justify-between">
                    <span className="text-lg font-bold text-foreground">Total:</span>
                    <span className="text-lg font-bold text-primary">
                      ${totals.total.toFixed(2)} {formData.currency}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </form>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 p-6 border-t border-border bg-subtle">
            <button
              type="button"
              onClick={() => setShowCreateModal(false)}
              className="px-6 py-2 border border-border text-foreground rounded-lg hover:bg-muted transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={createMutation.isPending || items.length === 0}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2 rounded-lg hover:bg-primary-hover disabled:bg-muted-foreground disabled:cursor-not-allowed transition-colors"
            >
              <Save className="w-5 h-5" />
              {createMutation.isPending ? "Guardando..." : "Guardar Orden"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Supplier Modal Component
  const SupplierModal = () => {
    const [formData, setFormData] = useState({
      name: editingSupplier?.name || "",
      contactName: editingSupplier?.contactName || "",
      phone: editingSupplier?.phone || "",
      email: editingSupplier?.email || "",
      address: editingSupplier?.address || "",
      taxId: editingSupplier?.taxId || "",
      notes: editingSupplier?.notes || "",
      isActive: editingSupplier?.isActive ?? true,
    });

    // Create supplier mutation
    const createSupplierMutation = useMutation({
      mutationFn: async (data: any) => {
        const token = localStorage.getItem('auth_token');
        const response = await fetch("/api/suppliers", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          credentials: "include",
          body: JSON.stringify(data),
        });
        if (!response.ok) throw new Error("Error al crear proveedor");
        return response.json();
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] });
        setShowSupplierModal(false);
        setEditingSupplier(null);
      },
    });

    // Update supplier mutation
    const updateSupplierMutation = useMutation({
      mutationFn: async (data: any) => {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`/api/suppliers/${editingSupplier!.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          credentials: "include",
          body: JSON.stringify(data),
        });
        if (!response.ok) throw new Error("Error al actualizar proveedor");
        return response.json();
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] });
        setShowSupplierModal(false);
        setEditingSupplier(null);
      },
    });

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();

      if (!formData.name.trim()) {
        alert("El nombre del proveedor es requerido");
        return;
      }

      const supplierData = {
        name: formData.name.trim(),
        contactName: formData.contactName.trim() || null,
        phone: formData.phone.trim() || null,
        email: formData.email.trim() || null,
        address: formData.address.trim() || null,
        taxId: formData.taxId.trim() || null,
        notes: formData.notes.trim() || null,
        isActive: formData.isActive,
      };

      if (editingSupplier) {
        updateSupplierMutation.mutate(supplierData);
      } else {
        createSupplierMutation.mutate(supplierData);
      }
    };

    const isPending = createSupplierMutation.isPending || updateSupplierMutation.isPending;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-card rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-border">
            <h2 className="text-2xl font-bold text-foreground">
              {editingSupplier ? "Editar Proveedor" : "Nuevo Proveedor"}
            </h2>
            <button
              onClick={() => {
                setShowSupplierModal(false);
                setEditingSupplier(null);
              }}
              className="text-muted-foreground hover:text-muted-foreground transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Form Content */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
            {/* Name (Required) */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Nombre del Proveedor <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="Ej: Distribuidora XYZ"
                required
              />
            </div>

            {/* Contact Name */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Nombre de Contacto</label>
              <input
                type="text"
                value={formData.contactName}
                onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="Ej: Juan Pérez"
              />
            </div>

            {/* Phone and Email */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Teléfono</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="Ej: 809-555-1234"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="Ej: contacto@proveedor.com"
                />
              </div>
            </div>

            {/* Address */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Dirección</label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="Ej: Calle Principal #123, Santo Domingo"
              />
            </div>

            {/* Tax ID (RNC) */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">RNC / Identificación Fiscal</label>
              <input
                type="text"
                value={formData.taxId}
                onChange={(e) => setFormData({ ...formData, taxId: e.target.value })}
                className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="Ej: 123-45678-9"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Notas</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="Notas adicionales sobre el proveedor..."
              />
            </div>

            {/* Active Status */}
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="isActive"
                checked={formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                className="w-4 h-4 text-primary border-border rounded focus:ring-2 focus:ring-primary"
              />
              <label htmlFor="isActive" className="text-sm font-medium text-foreground">
                Proveedor Activo
              </label>
            </div>
          </form>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 p-6 border-t border-border bg-subtle">
            <button
              type="button"
              onClick={() => {
                setShowSupplierModal(false);
                setEditingSupplier(null);
              }}
              className="px-6 py-2 border border-border text-foreground rounded-lg hover:bg-muted transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={isPending}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2 rounded-lg hover:bg-primary-hover disabled:bg-muted-foreground disabled:cursor-not-allowed transition-colors"
            >
              <Save className="w-5 h-5" />
              {isPending ? "Guardando..." : editingSupplier ? "Actualizar" : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Order Details Modal Component
  const OrderDetailsModal = () => {
    if (!selectedOrder) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-card rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-border">
            <div>
              <h2 className="text-2xl font-bold text-foreground">Orden de Compra #{selectedOrder.purchaseNumber}</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Creada el {new Date(selectedOrder.createdAt).toLocaleDateString("es-DO")}
              </p>
            </div>
            <button
              onClick={() => setSelectedOrder(null)}
              className="text-muted-foreground hover:text-muted-foreground transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Content */}
          {loadingOrderDetails ? (
            <div className="flex-1 flex items-center justify-center p-12">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-muted-foreground">Cargando detalles...</p>
              </div>
            </div>
          ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Order Info */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-subtle p-4 rounded-lg border border-border">
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Proveedor</h3>
                <p className="text-lg font-semibold text-foreground">{selectedOrder.supplierName || "Sin proveedor"}</p>
              </div>
              <div className="bg-subtle p-4 rounded-lg border border-border">
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Estado</h3>
                {getStatusBadge(selectedOrder.status)}
              </div>
              <div className="bg-subtle p-4 rounded-lg border border-border">
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Estado de Pago</h3>
                {getPaymentStatusBadge(selectedOrder.paymentStatus)}
              </div>
            </div>

            {/* Dates and References */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {selectedOrder.orderDate && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Fecha de Orden</h4>
                  <p className="text-foreground mt-1">{new Date(selectedOrder.orderDate).toLocaleDateString("es-DO")}</p>
                </div>
              )}
              {selectedOrder.expectedDeliveryDate && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Fecha Esperada de Entrega</h4>
                  <p className="text-foreground mt-1">
                    {new Date(selectedOrder.expectedDeliveryDate).toLocaleDateString("es-DO")}
                  </p>
                </div>
              )}
              {selectedOrder.receivedDate && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Fecha de Recepción</h4>
                  <p className="text-foreground mt-1">
                    {new Date(selectedOrder.receivedDate).toLocaleDateString("es-DO")}
                  </p>
                </div>
              )}
              {selectedOrder.invoiceNumber && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Número de Factura</h4>
                  <p className="text-foreground mt-1">{selectedOrder.invoiceNumber}</p>
                </div>
              )}
              {selectedOrder.referenceNumber && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Número de Referencia</h4>
                  <p className="text-foreground mt-1">{selectedOrder.referenceNumber}</p>
                </div>
              )}
              {selectedOrder.paymentTerms && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Términos de Pago</h4>
                  <p className="text-foreground mt-1">{selectedOrder.paymentTerms}</p>
                </div>
              )}
            </div>

            {/* Items */}
            {selectedOrder.items && selectedOrder.items.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-4">Productos</h3>
                <div className="overflow-x-auto border border-border rounded-lg">
                  <table className="w-full">
                    <thead className="bg-subtle border-b border-border">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Producto</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Lote</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Vencimiento</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Cantidad</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Costo Unit.</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {selectedOrder.items.map((item, index) => (
                        <tr key={index} className="hover:bg-subtle">
                          <td className="px-4 py-3">
                            <div className="font-medium text-foreground">{item.productName}</div>
                            {item.sku && <div className="text-xs text-muted-foreground">SKU: {item.sku}</div>}
                          </td>
                          <td className="px-4 py-3 text-sm text-foreground">{item.lotNumber || "-"}</td>
                          <td className="px-4 py-3 text-sm text-foreground">
                            {item.expirationDate ? new Date(item.expirationDate).toLocaleDateString("es-DO") : "-"}
                          </td>
                          <td className="px-4 py-3 text-sm text-foreground">{item.quantity}</td>
                          <td className="px-4 py-3 text-sm text-right font-medium text-foreground">
                            ${parseFloat(item.unitCost).toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-sm text-right font-semibold text-foreground">
                            ${parseFloat(item.totalCost).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Totals */}
            <div className="bg-subtle p-6 rounded-lg border border-border">
              <h4 className="text-lg font-semibold text-foreground mb-4">Resumen Financiero</h4>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal:</span>
                  <span className="font-medium text-foreground">
                    ${parseFloat(selectedOrder.subtotal).toFixed(2)} {selectedOrder.currency}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Descuento:</span>
                  <span className="font-medium text-destructive">
                    -${parseFloat(selectedOrder.discount).toFixed(2)} {selectedOrder.currency}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Impuestos:</span>
                  <span className="font-medium text-foreground">
                    ${parseFloat(selectedOrder.tax).toFixed(2)} {selectedOrder.currency}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Costo de Envío:</span>
                  <span className="font-medium text-foreground">
                    ${parseFloat(selectedOrder.shippingCost).toFixed(2)} {selectedOrder.currency}
                  </span>
                </div>
                <div className="border-t border-border pt-3 flex justify-between">
                  <span className="text-xl font-bold text-foreground">Total:</span>
                  <span className="text-xl font-bold text-primary">
                    ${parseFloat(selectedOrder.totalAmount).toFixed(2)} {selectedOrder.currency}
                  </span>
                </div>
              </div>
            </div>

            {/* Notes */}
            {selectedOrder.notes && (
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">Notas</h4>
                <p className="text-foreground bg-subtle p-4 rounded-lg border border-border">{selectedOrder.notes}</p>
              </div>
            )}
          </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-6 border-t border-border bg-subtle">
            <button
              onClick={() => setSelectedOrder(null)}
              className="px-6 py-2 border border-border text-foreground rounded-lg hover:bg-muted transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight">Gestión de Compras</h1>
          <p className="text-muted-foreground mt-1">Administra órdenes de compra y proveedores</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary-hover transition-colors"
        >
          <Plus className="w-5 h-5" />
          Nueva Orden de Compra
        </button>
      </div>

      {/* Stats Dashboard */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-card rounded-lg shadow-sm p-6 border border-border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Órdenes Totales</p>
                <p className="text-2xl font-bold text-foreground mt-1">{stats.totalOrders}</p>
              </div>
              <div className="bg-accent p-3 rounded-lg">
                <FileText className="w-6 h-6 text-primary" />
              </div>
            </div>
          </div>

          <div className="bg-card rounded-lg shadow-sm p-6 border border-border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Órdenes Pendientes</p>
                <p className="text-2xl font-bold text-warning mt-1">{stats.pendingOrders}</p>
              </div>
              <div className="bg-warning/15 p-3 rounded-lg">
                <Clock className="w-6 h-6 text-warning" />
              </div>
            </div>
          </div>

          <div className="bg-card rounded-lg shadow-sm p-6 border border-border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Órdenes Recibidas</p>
                <p className="text-2xl font-bold text-success mt-1">{stats.receivedOrders}</p>
              </div>
              <div className="bg-success/10 p-3 rounded-lg">
                <CheckCircle className="w-6 h-6 text-success" />
              </div>
            </div>
          </div>

          <div className="bg-card rounded-lg shadow-sm p-6 border border-border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Gasto Total</p>
                <p className="text-2xl font-bold text-foreground mt-1">
                  ${parseFloat(stats.totalSpent).toLocaleString("es-DO", { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="bg-accent p-3 rounded-lg">
                <DollarSign className="w-6 h-6 text-primary" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-card rounded-lg shadow-sm border border-border">
        <div className="border-b border-border">
          <div className="flex">
            <button
              onClick={() => setActiveTab("orders")}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === "orders"
                  ? "text-primary border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Órdenes de Compra
            </button>
            <button
              onClick={() => setActiveTab("suppliers")}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === "suppliers"
                  ? "text-primary border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Proveedores
            </button>
          </div>
        </div>

        {/* Orders Tab */}
        {activeTab === "orders" && (
          <div className="p-6">
            {/* Filters */}
            <div className="flex items-center gap-4 mb-6">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
                <input
                  type="text"
                  placeholder="Buscar por número, proveedor, factura..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="all">Todos los Estados</option>
                <option value="pending">Pendiente</option>
                <option value="received">Recibido</option>
                <option value="partial">Parcial</option>
                <option value="cancelled">Cancelado</option>
              </select>
            </div>

            {/* Orders Table */}
            {ordersLoading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
                <p className="text-muted-foreground mt-4">Cargando órdenes...</p>
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="text-center py-12">
                <Package className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">No hay órdenes de compra</h3>
                <p className="text-muted-foreground mb-4">Comienza creando tu primera orden de compra</p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary-hover"
                >
                  <Plus className="w-5 h-5" />
                  Nueva Orden de Compra
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-subtle border-b border-border">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Número</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Proveedor</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Fecha</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Estado</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Pago</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Total</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredOrders.map((order) => (
                      <tr key={order.id} className="hover:bg-subtle">
                        <td className="px-4 py-4">
                          <div className="font-medium text-foreground">{order.purchaseNumber}</div>
                          {order.invoiceNumber && (
                            <div className="text-xs text-muted-foreground">Factura: {order.invoiceNumber}</div>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <div className="text-sm text-foreground">{order.supplierName || "Sin proveedor"}</div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="text-sm text-foreground">
                            {new Date(order.orderDate).toLocaleDateString("es-DO")}
                          </div>
                          {order.expectedDeliveryDate && (
                            <div className="text-xs text-muted-foreground">
                              Esperado: {new Date(order.expectedDeliveryDate).toLocaleDateString("es-DO")}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4">{getStatusBadge(order.status)}</td>
                        <td className="px-4 py-4">{getPaymentStatusBadge(order.paymentStatus)}</td>
                        <td className="px-4 py-4 text-right">
                          <div className="font-semibold text-foreground">
                            ${parseFloat(order.totalAmount).toLocaleString("es-DO", { minimumFractionDigits: 2 })}
                          </div>
                          <div className="text-xs text-muted-foreground">{order.currency}</div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => loadOrderDetails(order.id)}
                              className="p-2 text-primary hover:bg-accent rounded-lg transition-colors"
                              title="Ver detalles"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            {order.status === "pending" && (
                              <>
                                <button
                                  onClick={() => setEditingOrder(order)}
                                  className="p-2 text-muted-foreground hover:bg-subtle rounded-lg transition-colors"
                                  title="Editar"
                                >
                                  <Edit className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => window.location.href = `/receive-purchase-order/${order.id}`}
                                  className="p-2 text-success hover:bg-success/10 rounded-lg transition-colors"
                                  title="Recibir orden"
                                >
                                  <Package className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => {
                                    if (confirm("¿Marcar esta orden como recibida (sin trazabilidad)?")) {
                                      receiveMutation.mutate(order.id);
                                    }
                                  }}
                                  className="p-2 text-success hover:bg-success/10 rounded-lg transition-colors"
                                  title="Marcar como recibido (rápido)"
                                >
                                  <CheckCircle className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => {
                                    if (confirm("¿Eliminar esta orden de compra?")) {
                                      deleteMutation.mutate(order.id);
                                    }
                                  }}
                                  className="p-2 text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                                  title="Eliminar"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Suppliers Tab */}
        {activeTab === "suppliers" && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-foreground">Proveedores</h2>
              <button
                onClick={() => {
                  setEditingSupplier(null);
                  setShowSupplierModal(true);
                }}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary-hover"
              >
                <Plus className="w-5 h-5" />
                Nuevo Proveedor
              </button>
            </div>

            {suppliersLoading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
                <p className="text-muted-foreground mt-4">Cargando proveedores...</p>
              </div>
            ) : suppliers.length === 0 ? (
              <div className="text-center py-12">
                <Users className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">No hay proveedores</h3>
                <p className="text-muted-foreground mb-4">Agrega proveedores para crear órdenes de compra</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {suppliers.map((supplier) => (
                  <div key={supplier.id} className="bg-card border border-border rounded-lg p-6 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-foreground">{supplier.name}</h3>
                        {supplier.contactName && (
                          <p className="text-sm text-muted-foreground mt-1">{supplier.contactName}</p>
                        )}
                      </div>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          supplier.isActive ? "bg-success/10 text-success" : "bg-muted text-foreground"
                        }`}
                      >
                        {supplier.isActive ? "Activo" : "Inactivo"}
                      </span>
                    </div>

                    <div className="space-y-2 mb-4">
                      {supplier.phone && (
                        <div className="text-sm text-muted-foreground">
                          <span className="font-medium">Tel:</span> {supplier.phone}
                        </div>
                      )}
                      {supplier.email && (
                        <div className="text-sm text-muted-foreground">
                          <span className="font-medium">Email:</span> {supplier.email}
                        </div>
                      )}
                      {supplier.taxId && (
                        <div className="text-sm text-muted-foreground">
                          <span className="font-medium">RNC:</span> {supplier.taxId}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 pt-4 border-t border-border">
                      <button
                        onClick={() => {
                          setEditingSupplier(supplier);
                          setShowSupplierModal(true);
                        }}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-primary bg-accent rounded-lg hover:bg-accent"
                      >
                        <Edit className="w-4 h-4" />
                        Editar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {showCreateModal && <PurchaseOrderModal />}
      {showSupplierModal && <SupplierModal />}
      {selectedOrder && <OrderDetailsModal />}
    </div>
  );
}
