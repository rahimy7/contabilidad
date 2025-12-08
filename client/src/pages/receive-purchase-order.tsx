import { useState, useEffect, useRef } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Package,
  Scan,
  Plus,
  Save,
  X,
  AlertCircle,
  CheckCircle,
  ArrowLeft,
  Trash2,
  AlertTriangle,
} from "lucide-react";

interface PurchaseOrderItem {
  id: number;
  purchaseOrderId: number;
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
  items?: PurchaseOrderItem[];
}

interface ReceivedItem extends PurchaseOrderItem {
  receivedQuantity: string;
  receivedLotNumber: string;
  receivedExpirationDate: string;
  receivedManufacturingDate: string;
}

export default function ReceivePurchaseOrder() {
  const [, setLocation] = useLocation();
  const [match, params] = useRoute<{ id: string }>("/receive-purchase-order/:id");
  const id = params?.id;
  const queryClient = useQueryClient();
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  const [barcodeInput, setBarcodeInput] = useState("");
  const [receivedItems, setReceivedItems] = useState<ReceivedItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<ReceivedItem[]>([]);
  const [keepPending, setKeepPending] = useState(false);

  // Fetch purchase order details
  const { data: purchaseOrder, isLoading } = useQuery<PurchaseOrder>({
    queryKey: [`/api/purchase-orders/${id}`],
    queryFn: async () => {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/purchase-orders/${id}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        credentials: "include",
      });
      if (!response.ok) throw new Error("Error al cargar orden");
      return response.json();
    },
    enabled: !!id,
  });


  // Initialize received items when order loads
  useEffect(() => {
    if (purchaseOrder?.items) {
      const items = purchaseOrder.items.map((item) => ({
        ...item,
        receivedQuantity: item.quantityReceived || "0",
        receivedLotNumber: item.lotNumber || "",
        receivedExpirationDate: item.expirationDate ? item.expirationDate.split('T')[0] : "",
        receivedManufacturingDate: item.manufacturingDate ? item.manufacturingDate.split('T')[0] : "",
      }));
      setReceivedItems(items);
      setFilteredItems(items);
    }
  }, [purchaseOrder]);

  // Handle barcode scan or product search - FILTER ONLY
  const handleProductSearch = (searchTerm: string) => {
    if (!searchTerm.trim()) {
      // Reset filter to show all items
      setFilteredItems(receivedItems);
      return;
    }

    const searchLower = searchTerm.toLowerCase().trim();

    // Filter items in the order by barcode, SKU, or name
    const filtered = receivedItems.filter((item) =>
      item.barcode?.toLowerCase() === searchLower ||
      item.sku?.toLowerCase() === searchLower ||
      item.productName.toLowerCase().includes(searchLower)
    );

    if (filtered.length === 0) {
      alert(`⚠️ El producto "${searchTerm}" no está en esta orden de compra.\n\nSolo puede recibir productos que fueron solicitados en la orden.`);
      setBarcodeInput("");
      return;
    }

    setFilteredItems(filtered);

    // Focus on first match
    if (filtered.length > 0) {
      const firstMatch = filtered[0];
      const index = receivedItems.indexOf(firstMatch);
      setTimeout(() => {
        const element = document.getElementById(`item-${index}`);
        element?.scrollIntoView({ behavior: "smooth", block: "center" });
        element?.classList.add("ring-2", "ring-blue-500");
        setTimeout(() => {
          element?.classList.remove("ring-2", "ring-blue-500");
        }, 2000);
      }, 100);
    }

    setBarcodeInput("");
  };

  // Validate expiration date
  const validateExpirationDate = (dateString: string): { isValid: boolean; warning: string | null; error: string | null } => {
    if (!dateString) {
      return { isValid: true, warning: null, error: null };
    }

    const expirationDate = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    expirationDate.setHours(0, 0, 0, 0);

    // Check if expiration date is in the past
    if (expirationDate < today) {
      return {
        isValid: false,
        warning: null,
        error: "La fecha de vencimiento no puede ser anterior a la fecha actual"
      };
    }

    // Check if expiration date is within 30 days
    const thirtyDaysFromNow = new Date(today);
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    if (expirationDate <= thirtyDaysFromNow) {
      const daysUntilExpiration = Math.ceil((expirationDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return {
        isValid: true,
        warning: `Este producto vence en ${daysUntilExpiration} día${daysUntilExpiration !== 1 ? 's' : ''}`,
        error: null
      };
    }

    return { isValid: true, warning: null, error: null };
  };

  // Update received item
  const updateReceivedItem = (index: number, field: keyof ReceivedItem, value: string) => {
    const newItems = [...receivedItems];
    newItems[index] = { ...newItems[index], [field]: value };

    // Validate expiration date if it's being updated
    if (field === "receivedExpirationDate" && value) {
      const validation = validateExpirationDate(value);
      if (!validation.isValid) {
        alert(validation.error);
        return; // Don't update if invalid
      }
      if (validation.warning) {
        alert(`⚠️ ADVERTENCIA: ${validation.warning}`);
      }
    }

    setReceivedItems(newItems);
    // Update filtered items to reflect the change
    setFilteredItems(filteredItems.map(item =>
      receivedItems.indexOf(item) === index ? newItems[index] : item
    ));
  };

  // Remove item
  const removeItem = (index: number) => {
    const itemToRemove = receivedItems[index];
    const newItems = receivedItems.filter((_, i) => i !== index);
    setReceivedItems(newItems);
    setFilteredItems(filteredItems.filter(item => item !== itemToRemove));
  };

  // Duplicate item for adding another lot
  const duplicateItemForNewLot = (index: number) => {
    const originalItem = receivedItems[index];
    const newItem: ReceivedItem = {
      ...originalItem,
      id: 0, // New item (will be inserted)
      receivedQuantity: "0",
      receivedLotNumber: "",
      receivedExpirationDate: "",
      receivedManufacturingDate: "",
    };

    // Insert after the original item
    const newItems = [...receivedItems];
    newItems.splice(index + 1, 0, newItem);
    setReceivedItems(newItems);

    // Also update filtered items
    const filteredIndex = filteredItems.indexOf(originalItem);
    if (filteredIndex !== -1) {
      const newFiltered = [...filteredItems];
      newFiltered.splice(filteredIndex + 1, 0, newItem);
      setFilteredItems(newFiltered);
    }
  };

  // Receive order mutation
  const receiveOrderMutation = useMutation({
    mutationFn: async (data: any) => {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/purchase-orders/${id}/receive-items`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Error al recibir orden");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-stats"] });
      alert("Orden recibida exitosamente");
      setLocation("/purchase-management");
    },
    onError: (error: any) => {
      alert(`Error: ${error.message}`);
    },
  });

  // Handle receive order
  const handleReceiveOrder = async () => {
    // Validate that at least one item has received quantity
    const hasReceivedItems = receivedItems.some(
      (item) => parseFloat(item.receivedQuantity) > 0
    );

    if (!hasReceivedItems) {
      alert("Debe recibir al menos un producto");
      return;
    }

    // Validate expiration dates for items being received
    for (const item of receivedItems) {
      if (parseFloat(item.receivedQuantity) > 0 && item.receivedExpirationDate) {
        const validation = validateExpirationDate(item.receivedExpirationDate);
        if (!validation.isValid) {
          alert(`Error en ${item.productName}: ${validation.error}`);
          return;
        }
      }
    }

    // Calculate total received per product
    const productTotals = new Map<number, { ordered: number; received: number; prevReceived: number; productName: string }>();

    receivedItems.forEach((item) => {
      if (!item.productId) return;

      const existing = productTotals.get(item.productId);
      const currentReceived = parseFloat(item.receivedQuantity) || 0;

      if (existing) {
        existing.received += currentReceived;
      } else {
        productTotals.set(item.productId, {
          ordered: parseFloat(item.quantity) || 0,
          received: currentReceived,
          prevReceived: parseFloat(item.quantityReceived) || 0,
          productName: item.productName
        });
      }
    });

    // Check for pending items
    const pendingItems: Array<{ name: string; ordered: number; totalReceived: number; pending: number }> = [];

    productTotals.forEach((totals) => {
      const totalReceived = totals.prevReceived + totals.received;
      const pending = totals.ordered - totalReceived;

      if (pending > 0) {
        pendingItems.push({
          name: totals.productName,
          ordered: totals.ordered,
          totalReceived,
          pending
        });
      }
    });

    // Determine status and handle confirmation
    let status: "pending" | "received" | "partial" = "received";
    let closureNote: string | null = null;

    if (pendingItems.length > 0 && !keepPending) {
      // Build confirmation message
      const pendingList = pendingItems
        .map(item => `• ${item.name}: ${item.pending.toFixed(2)} pendiente (solicitado: ${item.ordered}, recibido: ${item.totalReceived})`)
        .join('\n');

      const confirmMessage = `⚠️ ADVERTENCIA: Hay productos con cantidades pendientes:\n\n${pendingList}\n\n¿Desea cerrar la orden como COMPLETA?\n\n• Si: La orden se marcará como recibida completamente y se agregará una nota indicando los faltantes\n• No: La orden se mantendrá como PENDIENTE para futuros recibos`;

      const closeOrder = confirm(confirmMessage);

      if (closeOrder) {
        status = "received";
        closureNote = `Orden cerrada con productos pendientes:\n${pendingItems
          .map(item => `- ${item.name}: ${item.pending.toFixed(2)} unidades faltantes`)
          .join('\n')}`;
      } else {
        status = "partial";
      }
    } else if (pendingItems.length > 0 && keepPending) {
      status = "partial";
    }

    const data = {
      items: receivedItems.map((item) => ({
        id: item.id || undefined,
        productId: item.productId,
        productName: item.productName,
        sku: item.sku,
        barcode: item.barcode,
        quantity: item.quantity,
        quantityReceived: item.receivedQuantity,
        lotNumber: item.receivedLotNumber || null,
        expirationDate: item.receivedExpirationDate || null,
        manufacturingDate: item.receivedManufacturingDate || null,
        unitCost: item.unitCost,
        taxRate: item.taxRate,
        discountRate: item.discountRate,
        totalCost: item.totalCost,
        notes: item.notes,
      })),
      status,
      closureNote,
    };

    receiveOrderMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando orden...</p>
        </div>
      </div>
    );
  }

  if (!purchaseOrder) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Orden no encontrada</h2>
          <button
            onClick={() => setLocation("/purchase-management")}
            className="text-blue-600 hover:underline"
          >
            Volver a gestión de compras
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => setLocation("/purchase-management")}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-5 h-5" />
          Volver a gestión de compras
        </button>
        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Recibir Orden de Compra #{purchaseOrder.purchaseNumber}
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Proveedor: {purchaseOrder.supplierName || "Sin proveedor"}
              </p>
              {purchaseOrder.invoiceNumber && (
                <p className="text-sm text-gray-600">Factura: {purchaseOrder.invoiceNumber}</p>
              )}
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-600">Fecha de orden</p>
              <p className="font-medium text-gray-900">
                {new Date(purchaseOrder.orderDate).toLocaleDateString("es-DO")}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Product Search */}
      <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200 mb-6">
        <div className="flex items-center gap-4">
          <Scan className="w-6 h-6 text-blue-600" />
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Buscar producto por código de barras o nombre
            </label>
            <div className="flex gap-2">
              <input
                ref={barcodeInputRef}
                type="text"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleProductSearch(barcodeInput);
                  }
                }}
                placeholder="Escanear código de barras o escribir nombre del producto..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                autoFocus
              />
              <button
                onClick={() => handleProductSearch(barcodeInput)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Buscar
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Puede escanear un código de barras o escribir el nombre del producto
            </p>
          </div>
        </div>
      </div>

      {/* Items List */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Productos a Recibir</h2>
          <div className="mt-2 space-y-1">
            <p className="text-sm text-gray-600">
              Ingrese las cantidades recibidas, lotes y fechas de vencimiento
            </p>
            <p className="text-sm text-blue-600 flex items-center gap-1">
              <Plus className="w-3 h-3" />
              Puede agregar múltiples lotes para un mismo producto usando el botón "+"
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Producto</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Cant. Solicitada</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Cant. Pendiente</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Cant. Recibida</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Lote</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">F. Vencimiento</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">F. Fabricación</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredItems.map((item) => {
                const actualIndex = receivedItems.indexOf(item);
                const quantityOrdered = parseFloat(item.quantity) || 0;
                const quantityPrevReceived = parseFloat(item.quantityReceived) || 0;

                // Check if this is part of a multi-lot group
                const sameProductItems = receivedItems.filter(i => i.productId === item.productId);
                const isMultiLot = sameProductItems.length > 1;
                const lotIndex = sameProductItems.indexOf(item) + 1;

                // Calculate total received for this product across all lines (current and previous in this session)
                const totalReceivedCurrentSession = receivedItems
                  .filter((i, idx) => i.productId === item.productId && idx <= actualIndex)
                  .reduce((sum, i) => sum + (parseFloat(i.receivedQuantity) || 0), 0);

                // Calculate total received from previous lines of the same product (before current line)
                const receivedInPreviousLines = receivedItems
                  .filter((i, idx) => i.productId === item.productId && idx < actualIndex)
                  .reduce((sum, i) => sum + (parseFloat(i.receivedQuantity) || 0), 0);

                // Calculate pending quantity considering all previous lines of the same product
                const quantityPending = Math.max(0, quantityOrdered - quantityPrevReceived - totalReceivedCurrentSession);

                const isFullyReceived = totalReceivedCurrentSession >= (quantityOrdered - quantityPrevReceived);
                const isPartiallyReceived = totalReceivedCurrentSession > 0 && totalReceivedCurrentSession < (quantityOrdered - quantityPrevReceived);

                // Validate expiration date for visual feedback
                const expirationValidation = item.receivedExpirationDate
                  ? validateExpirationDate(item.receivedExpirationDate)
                  : { isValid: true, warning: null, error: null };

                return (
                  <tr
                    key={actualIndex}
                    id={`item-${actualIndex}`}
                    className={`hover:bg-gray-50 transition-colors ${
                      isFullyReceived
                        ? "bg-green-50"
                        : isPartiallyReceived
                        ? "bg-yellow-50"
                        : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {isFullyReceived && <CheckCircle className="w-4 h-4 text-green-600" />}
                        {isPartiallyReceived && <AlertCircle className="w-4 h-4 text-yellow-600" />}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">{item.productName}</span>
                            {isMultiLot && (
                              <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded">
                                Lote {lotIndex}/{sameProductItems.length}
                              </span>
                            )}
                          </div>
                          {item.sku && <div className="text-xs text-gray-500">SKU: {item.sku}</div>}
                          {item.barcode && <div className="text-xs text-gray-500">Código: {item.barcode}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900">{item.quantity}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className={`text-sm font-medium ${
                        quantityPending > 0
                          ? 'text-orange-600'
                          : 'text-green-600'
                      }`}>
                        {quantityPending.toFixed(2)}
                      </div>
                      {quantityPrevReceived > 0 && (
                        <div className="text-xs text-gray-500">
                          Ya recibido: {quantityPrevReceived}
                        </div>
                      )}
                      {isMultiLot && receivedInPreviousLines > 0 && (
                        <div className="text-xs text-blue-600">
                          En lotes anteriores: {receivedInPreviousLines.toFixed(2)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max={item.quantity}
                        value={item.receivedQuantity}
                        onChange={(e) => updateReceivedItem(actualIndex, "receivedQuantity", e.target.value)}
                        className="w-24 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={item.receivedLotNumber}
                        onChange={(e) => updateReceivedItem(actualIndex, "receivedLotNumber", e.target.value)}
                        className="w-32 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Lote"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <input
                          type="date"
                          value={item.receivedExpirationDate}
                          onChange={(e) => updateReceivedItem(actualIndex, "receivedExpirationDate", e.target.value)}
                          className={`w-36 px-2 py-1 text-sm border rounded focus:ring-2 focus:border-transparent ${
                            !expirationValidation.isValid
                              ? "border-red-500 bg-red-50 focus:ring-red-500"
                              : expirationValidation.warning
                              ? "border-yellow-500 bg-yellow-50 focus:ring-yellow-500"
                              : "border-gray-300 focus:ring-blue-500"
                          }`}
                        />
                        {!expirationValidation.isValid && (
                          <div className="flex items-center gap-1 text-xs text-red-600">
                            <AlertTriangle className="w-3 h-3" />
                            <span>Fecha vencida</span>
                          </div>
                        )}
                        {expirationValidation.warning && expirationValidation.isValid && (
                          <div className="flex items-center gap-1 text-xs text-yellow-600">
                            <AlertTriangle className="w-3 h-3" />
                            <span>{expirationValidation.warning}</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="date"
                        value={item.receivedManufacturingDate}
                        onChange={(e) => updateReceivedItem(actualIndex, "receivedManufacturingDate", e.target.value)}
                        className="w-36 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => duplicateItemForNewLot(actualIndex)}
                          className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="Agregar otro lote para este producto"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                        {item.id === 0 && (
                          <button
                            onClick={() => removeItem(actualIndex)}
                            className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {receivedItems.length === 0 && (
            <div className="text-center py-12">
              <Package className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600">No hay productos en esta orden</p>
            </div>
          )}

          {filteredItems.length === 0 && receivedItems.length > 0 && (
            <div className="text-center py-12">
              <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600">No se encontraron productos con ese criterio de búsqueda</p>
              <button
                onClick={() => {
                  setBarcodeInput("");
                  setFilteredItems(receivedItems);
                }}
                className="mt-4 text-blue-600 hover:underline"
              >
                Mostrar todos los productos
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="keepPending"
              checked={keepPending}
              onChange={(e) => setKeepPending(e.target.checked)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
            />
            <label htmlFor="keepPending" className="text-sm font-medium text-gray-700">
              Mantener orden como pendiente (recepción parcial)
            </label>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setLocation("/purchase-management")}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleReceiveOrder}
              disabled={receiveOrderMutation.isPending}
              className="flex items-center gap-2 bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              <Save className="w-5 h-5" />
              {receiveOrderMutation.isPending ? "Guardando..." : "Recibir Orden"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
