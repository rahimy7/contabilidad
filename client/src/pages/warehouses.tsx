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
import { Switch } from "@/components/ui/switch";
import {
  Warehouse, Plus, Pencil, Trash2, Star, MapPin, Phone, User,
  Package, TrendingUp,
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

// ─── types ──────────────────────────────────────────────────────────────────

interface WarehouseRecord {
  id: number;
  name: string;
  description: string | null;
  address: string | null;
  phone: string | null;
  manager: string | null;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
}

interface StockItem {
  productId: number;
  productName: string;
  productSku: string | null;
  productCategory: string;
  quantity: string;
  minStock: string | null;
}

interface WarehouseForm {
  name: string;
  description: string;
  address: string;
  phone: string;
  manager: string;
  isDefault: boolean;
  isActive: boolean;
}

const emptyForm: WarehouseForm = {
  name: "",
  description: "",
  address: "",
  phone: "",
  manager: "",
  isDefault: false,
  isActive: true,
};

// ─── component ───────────────────────────────────────────────────────────────

export default function WarehousesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [stockDialogOpen, setStockDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editing, setEditing] = useState<WarehouseRecord | null>(null);
  const [selectedWarehouse, setSelectedWarehouse] = useState<WarehouseRecord | null>(null);
  const [form, setForm] = useState<WarehouseForm>(emptyForm);

  // ── queries ──
  const { data: warehouses = [], isLoading } = useQuery<WarehouseRecord[]>({
    queryKey: ["/api/warehouses"],
    queryFn: () => apiCall("/api/warehouses"),
  });

  const { data: stockItems = [], isLoading: loadingStock } = useQuery<StockItem[]>({
    queryKey: ["/api/warehouses", selectedWarehouse?.id, "stock"],
    queryFn: () => apiCall(`/api/warehouses/${selectedWarehouse!.id}/stock`),
    enabled: !!selectedWarehouse,
  });

  // ── mutations ──
  const createMutation = useMutation({
    mutationFn: (data: WarehouseForm) => apiCall("/api/warehouses", {
      method: "POST",
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/warehouses"] });
      toast({ title: "Almacén creado correctamente" });
      setDialogOpen(false);
      setForm(emptyForm);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<WarehouseForm> }) =>
      apiCall(`/api/warehouses/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/warehouses"] });
      toast({ title: "Almacén actualizado" });
      setDialogOpen(false);
      setEditing(null);
      setForm(emptyForm);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiCall(`/api/warehouses/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/warehouses"] });
      toast({ title: "Almacén desactivado" });
      setDeleteDialogOpen(false);
      setEditing(null);
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // ── handlers ──
  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (w: WarehouseRecord) => {
    setEditing(w);
    setForm({
      name: w.name,
      description: w.description ?? "",
      address: w.address ?? "",
      phone: w.phone ?? "",
      manager: w.manager ?? "",
      isDefault: w.isDefault,
      isActive: w.isActive,
    });
    setDialogOpen(true);
  };

  const openDelete = (w: WarehouseRecord) => {
    setEditing(w);
    setDeleteDialogOpen(true);
  };

  const openStock = (w: WarehouseRecord) => {
    setSelectedWarehouse(w);
    setStockDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      toast({ title: "El nombre del almacén es requerido", variant: "destructive" });
      return;
    }
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  // ── render ──
  const activeWarehouses = warehouses.filter((w) => w.isActive);
  const inactiveWarehouses = warehouses.filter((w) => !w.isActive);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
            <Warehouse className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Gestión de Almacenes
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Administra sucursales y puntos de almacenamiento
            </p>
          </div>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Nuevo Almacén
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Warehouse className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Almacenes</p>
              <p className="text-2xl font-bold">{warehouses.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <TrendingUp className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Activos</p>
              <p className="text-2xl font-bold text-green-600">{activeWarehouses.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="p-3 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
              <Star className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Predeterminado</p>
              <p className="text-sm font-semibold text-yellow-700 dark:text-yellow-400">
                {warehouses.find((w) => w.isDefault)?.name ?? "Ninguno"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Warehouses table */}
      <Card>
        <CardHeader>
          <CardTitle>Almacenes Activos</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : activeWarehouses.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Warehouse className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No hay almacenes registrados. Crea el primero.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Dirección</TableHead>
                  <TableHead>Responsable</TableHead>
                  <TableHead>Teléfono</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeWarehouses.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{w.name}</span>
                        {w.isDefault && (
                          <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-400" />
                        )}
                      </div>
                      {w.description && (
                        <p className="text-xs text-gray-400 mt-0.5">{w.description}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
                        {w.address ? (
                          <>
                            <MapPin className="h-3.5 w-3.5 shrink-0" />
                            {w.address}
                          </>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        {w.manager ? (
                          <>
                            <User className="h-3.5 w-3.5 text-gray-400" />
                            {w.manager}
                          </>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        {w.phone ? (
                          <>
                            <Phone className="h-3.5 w-3.5 text-gray-400" />
                            {w.phone}
                          </>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={w.isActive ? "default" : "secondary"}>
                        {w.isActive ? "Activo" : "Inactivo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openStock(w)}
                          title="Ver stock"
                        >
                          <Package className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(w)}
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {!w.isDefault && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-700"
                            onClick={() => openDelete(w)}
                            title="Desactivar"
                          >
                            <Trash2 className="h-4 w-4" />
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

      {/* Inactive warehouses */}
      {inactiveWarehouses.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-gray-400">Almacenes Inactivos</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Dirección</TableHead>
                  <TableHead>Responsable</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inactiveWarehouses.map((w) => (
                  <TableRow key={w.id} className="opacity-60">
                    <TableCell className="font-medium">{w.name}</TableCell>
                    <TableCell>{w.address ?? "—"}</TableCell>
                    <TableCell>{w.manager ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(w)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ── Create/Edit dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar Almacén" : "Nuevo Almacén"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label>Nombre *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Sucursal Principal"
                className="mt-1"
              />
            </div>

            <div>
              <Label>Descripción</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Descripción opcional..."
                className="mt-1"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Teléfono</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="809-000-0000"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Responsable</Label>
                <Input
                  value={form.manager}
                  onChange={(e) => setForm({ ...form, manager: e.target.value })}
                  placeholder="Nombre del encargado"
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label>Dirección</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="Calle, sector, ciudad"
                className="mt-1"
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Almacén predeterminado</p>
                <p className="text-xs text-gray-400">Usado por defecto para nuevas operaciones</p>
              </div>
              <Switch
                checked={form.isDefault}
                onCheckedChange={(v) => setForm({ ...form, isDefault: v })}
              />
            </div>

            {editing && (
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Activo</p>
                  <p className="text-xs text-gray-400">Desactivar oculta el almacén de las operaciones</p>
                </div>
                <Switch
                  checked={form.isActive}
                  onCheckedChange={(v) => setForm({ ...form, isActive: v })}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {createMutation.isPending || updateMutation.isPending ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm dialog ── */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Desactivar almacén</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            ¿Deseas desactivar el almacén <strong>{editing?.name}</strong>? No se eliminarán los datos,
            solo se ocultará de las operaciones.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => editing && deleteMutation.mutate(editing.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Desactivando..." : "Desactivar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Stock dialog ── */}
      <Dialog open={stockDialogOpen} onOpenChange={setStockDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Stock en {selectedWarehouse?.name}
            </DialogTitle>
          </DialogHeader>

          {loadingStock ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : stockItems.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Package className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Este almacén no tiene productos registrados aún.</p>
              <p className="text-xs mt-1 text-gray-400">
                Los productos se agregan al completar transferencias o ajustes de inventario.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Stock Mín.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stockItems.map((item) => {
                  const qty = parseFloat(item.quantity);
                  const min = item.minStock ? parseFloat(item.minStock) : null;
                  const isLow = min !== null && qty <= min;
                  return (
                    <TableRow key={item.productId}>
                      <TableCell>
                        <div>
                          <span className="font-medium">{item.productName}</span>
                          {item.productSku && (
                            <span className="text-xs text-gray-400 ml-2">#{item.productSku}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-gray-500">{item.productCategory}</TableCell>
                      <TableCell className="text-right">
                        <span className={isLow ? "text-red-600 font-semibold" : "font-medium"}>
                          {qty.toLocaleString("es-DO")}
                        </span>
                        {isLow && (
                          <span className="ml-1 text-xs text-red-500">(bajo)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm text-gray-400">
                        {min !== null ? min.toLocaleString("es-DO") : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setStockDialogOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
