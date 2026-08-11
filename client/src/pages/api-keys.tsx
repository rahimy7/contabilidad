import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Key, Plus, Copy, Trash2, ExternalLink, ShieldOff } from "lucide-react";

export default function ApiKeysPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [openNew, setOpenNew] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "", scopes: ["read"] as string[],
    rateLimitPerMin: 60, expiresAt: "",
  });

  const list = useQuery({
    queryKey: ["/api/api-keys"],
    queryFn: () => apiRequest("GET", "/api/api-keys"),
  });

  const create = useMutation({
    mutationFn: () => {
      const payload: any = {
        name: form.name, scopes: form.scopes,
        rateLimitPerMin: form.rateLimitPerMin,
      };
      if (form.expiresAt) payload.expiresAt = form.expiresAt;
      return apiRequest("POST", "/api/api-keys", payload);
    },
    onSuccess: (data: any) => {
      setNewToken(data.token);
      setOpenNew(false);
      qc.invalidateQueries({ queryKey: ["/api/api-keys"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const revoke = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/api-keys/${id}/revoke`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/api-keys"] }),
  });

  const copyToken = () => {
    if (newToken) {
      navigator.clipboard.writeText(newToken);
      toast({ title: "Token copiado" });
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Key className="w-8 h-8 text-indigo-600" />
          <div>
            <h1 className="text-2xl font-bold">API Keys</h1>
            <p className="text-muted-foreground">Tokens para integraciones externas · API pública v1</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.open("/api/v1/openapi.json", "_blank")}>
            <ExternalLink className="w-4 h-4 mr-2" /> Ver OpenAPI
          </Button>
          <Button onClick={() => setOpenNew(true)}>
            <Plus className="w-4 h-4 mr-2" /> Nueva API key
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Documentación rápida</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <p>Envía el token en el header <code className="bg-muted px-1 rounded">Authorization: Bearer sk_xxx</code> o <code className="bg-muted px-1 rounded">x-api-key: sk_xxx</code>.</p>
          <p>Endpoints públicos v1:</p>
          <ul className="list-disc list-inside space-y-0.5 text-xs font-mono">
            <li>GET /api/v1/dashboard</li>
            <li>GET /api/v1/orders?status=completed&from=YYYY-MM-DD</li>
            <li>GET /api/v1/products?search=...</li>
            <li>GET /api/v1/customers?search=...</li>
            <li>GET /api/v1/fx/rate?from=USD&amp;to=DOP</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Keys activas</CardTitle>
          <CardDescription>Cada key se muestra una vez al emitirla</CardDescription>
        </CardHeader>
        <CardContent>
          {list.data?.rows?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Prefix</TableHead>
                  <TableHead>Scopes</TableHead>
                  <TableHead className="text-right">Rate limit</TableHead>
                  <TableHead className="text-right">Uso</TableHead>
                  <TableHead>Último uso</TableHead>
                  <TableHead>Expira</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.data.rows.map((k: any) => (
                  <TableRow key={k.id}>
                    <TableCell className="font-medium">{k.name}</TableCell>
                    <TableCell className="font-mono text-xs">{k.keyPrefix}…</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {k.scopes?.map((s: string) => (
                          <Badge key={s} variant="outline" className="text-xs">{s}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{k.rateLimitPerMin}/min</TableCell>
                    <TableCell className="text-right font-mono">{k.usageCount}</TableCell>
                    <TableCell className="text-xs">{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString("es-DO") : "—"}</TableCell>
                    <TableCell className="text-xs">{k.expiresAt ?? "—"}</TableCell>
                    <TableCell>
                      {k.revokedAt ? (
                        <Badge variant="destructive">Revocada</Badge>
                      ) : k.isActive ? (
                        <Badge className="bg-green-600">Activa</Badge>
                      ) : (
                        <Badge variant="secondary">Inactiva</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {k.isActive && !k.revokedAt && (
                        <Button size="icon" variant="ghost" onClick={() => revoke.mutate(k.id)}>
                          <ShieldOff className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-center text-muted-foreground py-8">Sin API keys emitidas</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={openNew} onOpenChange={setOpenNew}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva API key</DialogTitle>
            <DialogDescription>El token se mostrará una sola vez</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nombre *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Integración Zapier" />
            </div>
            <div>
              <Label>Scopes</Label>
              <div className="flex gap-3 mt-1">
                {["read", "write", "admin"].map((s) => (
                  <label key={s} className="flex items-center gap-1 text-sm">
                    <input
                      type="checkbox"
                      checked={form.scopes.includes(s)}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...form.scopes, s]
                          : form.scopes.filter((x) => x !== s);
                        setForm({ ...form, scopes: next });
                      }}
                    />
                    {s}
                  </label>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Rate limit (req/min)</Label>
                <Input type="number" value={form.rateLimitPerMin} onChange={(e) => setForm({ ...form, rateLimitPerMin: Number(e.target.value) })} />
              </div>
              <div>
                <Label>Expira (opcional)</Label>
                <Input type="datetime-local" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenNew(false)}>Cancelar</Button>
            <Button onClick={() => create.mutate()} disabled={!form.name || create.isPending}>
              Emitir key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={newToken != null} onOpenChange={(o) => !o && setNewToken(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva API key emitida</DialogTitle>
            <DialogDescription className="text-red-600">
              ⚠️ Guarda este token ahora. No podrás verlo de nuevo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="p-3 bg-muted rounded font-mono text-sm break-all">
              {newToken}
            </div>
            <Button onClick={copyToken} className="w-full">
              <Copy className="w-4 h-4 mr-2" /> Copiar al portapapeles
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setNewToken(null)}>Entendido, ya la guardé</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
