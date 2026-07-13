import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowRightLeft, Plus, Search, CheckCircle, XCircle, Clock,
  Truck, Eye, Trash2, ChevronDown, ChevronUp, Package,
} from "lucide-react";

// ─── helpers ────────────────────────────────────────────────────────────────

const apiCall = async (endpoint: string, options: RequestInit = {}) => {
  const token = localStorage.getItem("auth_token");
  const res = await fetch(endpoint, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Error desconocido" }));
    throw new Error(err.error || "Error en la solicitud");
  }
  return res.json();
};

const formatDate = (d: string) =>
  new Date(d).toLocaleString("es-DO", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

// ─── Status badge helper ──────────────────────────────────────────────────────

const STATUS_MAP: Record<string, { label: string; variant: any; icon: any }> = {
  pending: { label: "Pendiente", variant: "secondary", icon: Clock },
  approved: { label: "Aprobada", variant: "default", icon: CheckCircle },
  in_transit: { label: "En tránsito", variant: "default", icon: Truck },
  completed: { label: "Completada", variant: "default", icon: CheckCircle },
  cancelled: { label: "Cancelada", variant: "destructive", icon: XCircle },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] ?? { label: status, variant: "secondary", icon: Clock };
  const Icon = s.icon;
  return (
    <Badge variant={s.variant} className="gap-1">
      <Icon className="h-3 w-3" />
      {s.label}
    </Badge>
  );
}

// ─── types ──────────────────────────────────────────────────────────────────

interface Warehouse {
  id: number;
  name: string;
}

interface Product {
  id: number;
  name: string;
  sku: string | null;
  stockQuantity: number;
}

interface TransferItem {
  productId: number;
  requestedQuantity: string;
  notes: string;
}

interface Transfer {
  id: number;
  transferNumber: string;
  status: string;
  notes: string | null;
  createdAt: string;
  approvedAt: string | null;
  completedAt: string | null;
  fromWarehouseId: number;
  toWarehouseId: number;
  fromWarehouseName: string;
  toWarehouseName: string;
  createdByName: string | null;
  items?: TransferDetailItem[];
}

interface TransferDetailItem {
  id: number;
  productId: number;
  productName: string;
  productSku: string | null;
  requestedQuantity: string;
  sentQuantity: string | null;
  receivedQuantity: string | null;
  notes: string | null;
}

// ─── component ───────────────────────────────────────────────────────────────

export default function WarehouseTransfersPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState<Transfer | null>(null);
  const [search, setSearch] = useState("");

  // Form state
  const [fromWarehouse, setFromWarehouse] = useState<string>("");
  const [toWarehouse, setToWarehouse] = useState<string>("");
  const [transferNotes, setTransferNotes] = useState("");
  const [items, setItems] = useState<TransferItem[]>([
    { productId: 0, requestedQuantity: "", notes: "" },
  ]);

  // ── queries ──
  const { data: warehouses = [] } = useQuery<Warehouse[]>({
    queryKey: ["/api/warehouses"],
    queryFn: () => apiCall("/api/warehouses"),
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
    queryFn: () => apiCall("/api/products"),
  });

  const { data: transfers = [], isLoading } = useQuery<Transfer[]>({
    queryKey: ["/api/warehouse-transfers"],
    queryFn: () => apiCall("/api/warehouse-transfers"),
  });

  const { data: transferDetail } = useQuery<Transfer>({
    queryKey: ["/api/warehouse-transfers", selectedTransfer?.id],
    queryFn: () => apiCall(`/api/warehouse-transfers/${selectedTransfer!.id}`),
    enabled: !!selectedTransfer && detailOpen,
  });

  // ── mutations ──
  const createMutation = useMutation({
    mutationFn: (data: any) =>
      apiCall("/api/warehouse-transfers", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/warehouse-transfers"] });
      toast({ title: "Transferencia creada correctamente" });
      setCreateOpen(false);
      resetForm();
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) =>
      apiCall(`/api/warehouse-transfers/${id}/approve`, { method: "PATCH" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/warehouse-transfers"] });
      if (selectedTransfer) {
        queryClient.invalidateQueries({ queryKey: ["/api/warehouse-transfers", selectedTransfer.id] });
      }
      toast({ title: "Transferencia aprobada" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const completeMutation = useMutation({
    mutationFn: (id: number) =>
      apiCall(`/api/warehouse-transfers/${id}/complete`, { method: "PATCH" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/warehouse-transfers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/warehouses"] });
      if (selectedTransfer) {
        queryClient.invalidateQueries({ queryKey: ["/api/warehouse-transfers", selectedTransfer.id] });
      }
      toast({ title: "Transferencia completada — stock actualizado" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) =>
      apiCall(`/api/warehouse-transfers/${id}/cancel`, { method: "PATCH" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/warehouse-transfers"] });
      if (selectedTransfer) {
        queryClient.invalidateQueries({ queryKey: ["/api/warehouse-transfers", selectedTransfer.id] });
      }
      toast({ title: "Transferencia cancelada" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // ── helpers ──
  const resetForm = () => {
    setFromWarehouse("");
    setToWarehouse("");
    setTransferNotes("");
    setItems([{ productId: 0, requestedQuantity: "", notes: "" }]);
  };

  const addItem = () =>
    setItems([...items, { productId: 0, requestedQuantity: "", notes: "" }]);

  const removeItem = (idx: number) =>
    setItems(items.filter((_, i) => i !== idx));

  const updateItem = (idx: number, field: keyof TransferItem, value: string | number) =>
    setItems(items.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));

  const handleCreate = () => {
    if (!fromWarehouse || !toWarehouse) {
      toast({ title: "Selecciona los almacenes de origen y destino", variant: "destructive" });
      return;
    }
    if (fromWarehouse === toWarehouse) {
      toast({ title: "Origen y destino deben ser almacenes diferentes", variant: "destructive" });
      return;
    }
    const validItems = items.filter(
      (i) => i.productId > 0 && parseFloat(i.requestedQuantity) > 0
    );
    if (validItems.length === 0) {
      toast({ title: "Agrega al menos un producto con cantidad válida", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      fromWarehouseId: parseInt(fromWarehouse),
      toWarehouseId: parseInt(toWarehouse),
      notes: transferNotes || null,
      items: validItems.map((i) => ({
        productId: i.productId,
        requestedQuantity: i.requestedQuantity,
        notes: i.notes || null,
      })),
    });
  };

  const openDetail = (t: Transfer) => {
    setSelectedTransfer(t);
    setDetailOpen(true);
  };

  // ── filter ──
  const filtered = transfers.filter(
    (t) =>
      t.transferNumber.toLowerCase().includes(search.toLowerCase()) ||
      t.fromWarehouseName?.toLowerCase().includes(search.toLowerCase()) ||
      t.toWarehouseName?.toLowerCase().includes(search.toLowerCase())
  );

  const activeWarehouses = warehouses.filter((w: any) => w.isActive);

  // ── stats ──
  const pending = transfers.filter((t) => t.status === "pending").length;
  const approved = transfers.filter((t) => t.status === "approved").length;
  const completed = transfers.filter((t) => t.status === "completed").length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
            <ArrowRightLeft className="h-6 w-6 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Transferencias entre Almacenes
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Gestiona el movimiento de stock entre sucursales
            </p>
          </div>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Nueva Transferencia
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <Clock className="h-8 w-8 text-yellow-500" />
            <div>
              <p className="text-sm text-gray-500">Pendientes</p>
              <p className="text-2xl font-bold text-yellow-600">{pending}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <Truck className="h-8 w-8 text-blue-500" />
            <div>
              <p className="text-sm text-gray-500">Aprobadas</p>
              <p className="text-2xl font-bold text-blue-600">{approved}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <CheckCircle className="h-8 w-8 text-green-500" />
            <div>
              <p className="text-sm text-gray-500">Completadas</p>
              <p className="text-2xl font-bold text-green-600">{completed}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar por número, almacén..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <ArrowRightLeft className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No hay transferencias registradas.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Origen</TableHead>
                  <TableHead>Destino</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Creada</TableHead>
                  <TableHead>Completada</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-sm">{t.transferNumber}</TableCell>
                    <TableCell>{t.fromWarehouseName}</TableCell>
                    <TableCell>{t.toWarehouseName}</TableCell>
                    <TableCell>
                      <StatusBadge status={t.status} />
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {formatDate(t.createdAt)}
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {t.completedAt ? formatDate(t.completedAt) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => openDetail(t)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        {t.status === "pending" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-green-600 hover:text-green-800"
                            onClick={() => approveMutation.mutate(t.id)}
                            disabled={approveMutation.isPending}
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                        )}
                        {(t.status === "approved" || t.status === "in_transit") && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-blue-600 hover:text-blue-800"
                            onClick={() => completeMutation.mutate(t.id)}
                            disabled={completeMutation.isPending}
                          >
                            <Truck className="h-4 w-4" />
                          </Button>
                        )}
                        {!["completed", "cancelled"].includes(t.status) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-700"
                            onClick={() => cancelMutation.mutate(t.id)}
                            disabled={cancelMutation.isPending}
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Create transfer dialog ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5" />
              Nueva Transferencia
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Almacén Origen *</Label>
                <Select value={fromWarehouse} onValueChange={setFromWarehouse}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Seleccionar origen" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeWarehouses.map((w: any) => (
                      <SelectItem key={w.id} value={String(w.id)}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Almacén Destino *</Label>
                <Select value={toWarehouse} onValueChange={setToWarehouse}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Seleccionar destino" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeWarehouses
                      .filter((w: any) => String(w.id) !== fromWarehouse)
                      .map((w: any) => (
                        <SelectItem key={w.id} value={String(w.id)}>
                          {w.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Notas</Label>
              <Textarea
                value={transferNotes}
                onChange={(e) => setTransferNotes(e.target.value)}
                placeholder="Observaciones opcionales..."
                className="mt-1"
                rows={2}
              />
            </div>

            {/* Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Productos a transferir *</Label>
                <Button type="button" variant="outline" size="sm" onClick={addItem}>
                  <Plus className="h-4 w-4 mr-1" />
                  Agregar producto
                </Button>
              </div>

              <div className="space-y-2">
                {items.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-end">
                    <div>
                      {idx === 0 && <Label className="text-xs mb-1">Producto</Label>}
                      <Select
                        value={item.productId ? String(item.productId) : ""}
                        onValueChange={(v) => updateItem(idx, "productId", parseInt(v))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar producto" />
                        </SelectTrigger>
                        <SelectContent>
                          {products.map((p: any) => (
                            <SelectItem key={p.id} value={String(p.id)}>
                              {p.name}
                              {p.sku && <span className="text-gray-400 ml-1">({p.sku})</span>}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-28">
                      {idx === 0 && <Label className="text-xs mb-1">Cantidad</Label>}
                      <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        placeholder="0"
                        value={item.requestedQuantity}
                        onChange={(e) => updateItem(idx, "requestedQuantity", e.target.value)}
                      />
                    </div>
                    <div className="w-32">
                      {idx === 0 && <Label className="text-xs mb-1">Nota</Label>}
                      <Input
                        placeholder="Nota..."
                        value={item.notes}
                        onChange={(e) => updateItem(idx, "notes", e.target.value)}
                      />
                    </div>
                    <div>
                      {idx === 0 && <div className="text-xs mb-1 invisible">X</div>}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeItem(idx)}
                        disabled={items.length === 1}
                        className="text-red-400 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateOpen(false); resetForm(); }}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creando..." : "Crear Transferencia"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Detail dialog ── */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              {transferDetail?.transferNumber ?? selectedTransfer?.transferNumber}
            </DialogTitle>
          </DialogHeader>

          {transferDetail && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-400">Origen</p>
                  <p className="font-medium">{transferDetail.fromWarehouseName}</p>
                </div>
                <div>
                  <p className="text-gray-400">Destino</p>
                  <p className="font-medium">{transferDetail.toWarehouseName}</p>
                </div>
                <div>
                  <p className="text-gray-400">Estado</p>
                  <StatusBadge status={transferDetail.status} />
                </div>
                <div>
                  <p className="text-gray-400">Creada</p>
                  <p className="font-medium">{formatDate(transferDetail.createdAt)}</p>
                </div>
                {transferDetail.approvedAt && (
                  <div>
                    <p className="text-gray-400">Aprobada</p>
                    <p className="font-medium">{formatDate(transferDetail.approvedAt)}</p>
                  </div>
                )}
                {transferDetail.completedAt && (
                  <div>
                    <p className="text-gray-400">Completada</p>
                    <p className="font-medium">{formatDate(transferDetail.completedAt)}</p>
                  </div>
                )}
              </div>

              {transferDetail.notes && (
                <div className="rounded-md bg-gray-50 dark:bg-gray-800 p-3 text-sm">
                  <span className="text-gray-400">Notas: </span>
                  {transferDetail.notes}
                </div>
              )}

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-right">Solicitado</TableHead>
                    <TableHead className="text-right">Enviado</TableHead>
                    <TableHead className="text-right">Recibido</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(transferDetail.items ?? []).map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div>
                          <span className="font-medium">{item.productName}</span>
                          {item.productSku && (
                            <span className="text-xs text-gray-400 ml-2">#{item.productSku}</span>
                          )}
                        </div>
                        {item.notes && (
                          <p className="text-xs text-gray-400 mt-0.5">{item.notes}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {parseFloat(item.requestedQuantity).toLocaleString("es-DO")}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.sentQuantity
                          ? parseFloat(item.sentQuantity).toLocaleString("es-DO")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.receivedQuantity
                          ? parseFloat(item.receivedQuantity).toLocaleString("es-DO")
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Action buttons inside detail */}
              {transferDetail.status === "pending" && (
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="outline"
                    className="text-red-500"
                    onClick={() => {
                      cancelMutation.mutate(transferDetail.id);
                      setDetailOpen(false);
                    }}
                    disabled={cancelMutation.isPending}
                  >
                    <XCircle className="h-4 w-4 mr-1" />
                    Cancelar
                  </Button>
                  <Button
                    onClick={() => approveMutation.mutate(transferDetail.id)}
                    disabled={approveMutation.isPending}
                  >
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Aprobar
                  </Button>
                </div>
              )}
              {(transferDetail.status === "approved" || transferDetail.status === "in_transit") && (
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="outline"
                    className="text-red-500"
                    onClick={() => {
                      cancelMutation.mutate(transferDetail.id);
                      setDetailOpen(false);
                    }}
                    disabled={cancelMutation.isPending}
                  >
                    <XCircle className="h-4 w-4 mr-1" />
                    Cancelar
                  </Button>
                  <Button
                    onClick={() => completeMutation.mutate(transferDetail.id)}
                    disabled={completeMutation.isPending}
                  >
                    <Truck className="h-4 w-4 mr-1" />
                    Marcar Completada
                  </Button>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
