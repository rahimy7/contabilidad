import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Landmark, Upload, Zap, CheckCircle2, XCircle, EyeOff, Loader2 } from "lucide-react";

const money = (v: string | number) =>
  Number(v ?? 0).toLocaleString("es-DO", { minimumFractionDigits: 2 });

const CONFIDENCE_COLOR: Record<string, string> = {
  exact: "bg-green-600",
  high: "bg-green-500",
  medium: "bg-yellow-500",
  manual: "bg-blue-500",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  matched: "Emparejada",
  ignored: "Ignorada",
  created: "Creada",
};

/** Conciliación bancaria: importa extractos, ejecuta auto-matching, revisa manual. */
export default function BankReconciliationPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [accountId, setAccountId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showImport, setShowImport] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const accounts = useQuery({
    queryKey: ["/api/treasury/accounts"],
    queryFn: () => apiRequest("GET", "/api/treasury/accounts"),
  });

  const imports = useQuery({
    queryKey: ["/api/treasury/statements/imports", accountId],
    queryFn: () => apiRequest("GET", `/api/treasury/statements/imports?bankAccountId=${accountId}`),
    enabled: accountId != null,
  });

  const lines = useQuery({
    queryKey: ["/api/treasury/statements/lines", accountId, statusFilter],
    queryFn: () => {
      const st = statusFilter === "all" ? "" : `&status=${statusFilter}`;
      return apiRequest("GET", `/api/treasury/statements/lines?bankAccountId=${accountId}${st}`);
    },
    enabled: accountId != null,
  });

  const autoMatch = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/treasury/statements/auto-match", { bankAccountId: accountId }),
    onSuccess: (data: any) => {
      toast({
        title: "Auto-matching completado",
        description: `${data.matched} emparejadas · ${data.ambiguous} ambiguas · ${data.unmatched} sin match`,
      });
      qc.invalidateQueries({ queryKey: ["/api/treasury/statements/lines"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const ignore = useMutation({
    mutationFn: (lineId: number) =>
      apiRequest("POST", `/api/treasury/statements/lines/${lineId}/ignore`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/treasury/statements/lines"] }),
  });

  const unmatch = useMutation({
    mutationFn: (lineId: number) =>
      apiRequest("POST", `/api/treasury/statements/lines/${lineId}/unmatch`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/treasury/statements/lines"] }),
  });

  const acctList = accounts.data?.accounts ?? [];
  const selectedAccount = acctList.find((a: any) => a.id === accountId);

  const counts = countByStatus(lines.data?.rows ?? []);

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Landmark className="w-8 h-8 text-teal-600" />
          <div>
            <h1 className="text-2xl font-bold">Conciliación Bancaria</h1>
            <p className="text-muted-foreground">Importa extractos y empareja con tus movimientos</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Select value={accountId ? String(accountId) : ""} onValueChange={(v) => setAccountId(Number(v))}>
            <SelectTrigger className="w-72"><SelectValue placeholder="Selecciona cuenta bancaria" /></SelectTrigger>
            <SelectContent>
              {acctList.map((a: any) => (
                <SelectItem key={a.id} value={String(a.id)}>
                  {a.code} — {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => setShowImport(true)} disabled={!accountId}>
            <Upload className="w-4 h-4 mr-2" /> Importar CSV
          </Button>
          <Button onClick={() => autoMatch.mutate()} disabled={!accountId || autoMatch.isPending} variant="secondary">
            {autoMatch.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
            Auto-match
          </Button>
        </div>
      </div>

      {!accountId ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground">
          Selecciona una cuenta bancaria para comenzar.
        </CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-5 gap-3">
            <StatCard label="Total líneas" value={lines.data?.rows?.length ?? 0} />
            <StatCard label="Pendientes" value={counts.pending} color="text-yellow-600" />
            <StatCard label="Emparejadas" value={counts.matched} color="text-green-600" />
            <StatCard label="Ignoradas" value={counts.ignored} color="text-gray-600" />
            <StatCard label="Saldo cuenta" value={`RD$ ${money(selectedAccount?.balance ?? 0)}`} />
          </div>

          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Extractos importados</CardTitle>
                  <CardDescription>{imports.data?.rows?.length ?? 0} imports</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {imports.data?.rows?.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Archivo</TableHead>
                      <TableHead>Período</TableHead>
                      <TableHead className="text-right">Saldo inicial</TableHead>
                      <TableHead className="text-right">Saldo final</TableHead>
                      <TableHead className="text-right">Líneas</TableHead>
                      <TableHead className="text-right">Duplicadas</TableHead>
                      <TableHead>Importado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {imports.data.rows.map((imp: any) => (
                      <TableRow key={imp.id}>
                        <TableCell className="font-mono text-xs">{imp.fileName ?? "—"}</TableCell>
                        <TableCell className="text-xs">{imp.periodStart} → {imp.periodEnd}</TableCell>
                        <TableCell className="text-right font-mono">{imp.openingBalance ? money(imp.openingBalance) : "—"}</TableCell>
                        <TableCell className="text-right font-mono">{imp.closingBalance ? money(imp.closingBalance) : "—"}</TableCell>
                        <TableCell className="text-right">{imp.importedLines}/{imp.totalLines}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{imp.duplicateLines}</TableCell>
                        <TableCell className="text-xs">{new Date(imp.importedAt).toLocaleString("es-DO")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center text-muted-foreground py-6">Sin extractos importados</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Líneas del extracto</CardTitle>
                  <CardDescription>Empareja con movimientos bancarios registrados</CardDescription>
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="pending">Pendientes</SelectItem>
                    <SelectItem value="matched">Emparejadas</SelectItem>
                    <SelectItem value="ignored">Ignoradas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {lines.data?.rows?.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Dir</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead>Referencia</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Match</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.data.rows.map((l: any) => (
                      <TableRow key={l.id}>
                        <TableCell className="text-xs">{l.txnDate}</TableCell>
                        <TableCell>
                          {l.direction === "in" ? (
                            <Badge className="bg-green-600 text-white">Ingreso</Badge>
                          ) : (
                            <Badge variant="secondary">Salida</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono">{money(l.amount)}</TableCell>
                        <TableCell className="text-sm">{l.description ?? "—"}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{l.bankReference ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant={l.status === "matched" ? "default" : "outline"}>
                            {STATUS_LABEL[l.status] ?? l.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {l.matchConfidence && (
                            <Badge className={`${CONFIDENCE_COLOR[l.matchConfidence] ?? "bg-slate-500"} text-white text-xs`}>
                              {l.matchConfidence}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="space-x-1">
                          {l.status === "matched" && (
                            <Button size="sm" variant="ghost" onClick={() => unmatch.mutate(l.id)}>
                              <XCircle className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {l.status === "pending" && (
                            <Button size="sm" variant="ghost" onClick={() => ignore.mutate(l.id)}>
                              <EyeOff className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center text-muted-foreground py-6">Sin líneas para este filtro</p>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <ImportDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        accountId={accountId}
        onDone={() => {
          qc.invalidateQueries({ queryKey: ["/api/treasury/statements/imports"] });
          qc.invalidateQueries({ queryKey: ["/api/treasury/statements/lines"] });
        }}
      />
    </div>
  );
}

function StatCard({ label, value, color = "" }: { label: string; value: string | number; color?: string }) {
  return (
    <Card><CardContent className="pt-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </CardContent></Card>
  );
}

function countByStatus(rows: any[]) {
  const c = { pending: 0, matched: 0, ignored: 0, created: 0 };
  for (const r of rows) {
    if (r.status in c) (c as any)[r.status]++;
  }
  return c;
}

function ImportDialog({
  open, onClose, accountId, onDone,
}: { open: boolean; onClose: () => void; accountId: number | null; onDone: () => void }) {
  const { toast } = useToast();
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [dateFormat, setDateFormat] = useState<"DD/MM/YYYY" | "YYYY-MM-DD" | "MM/DD/YYYY">("DD/MM/YYYY");

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    const text = await f.text();
    const parsed = parseCsv(text);
    setRows(parsed);
    toast({ title: "CSV cargado", description: `${parsed.length} filas` });
  };

  const importMut = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/treasury/statements/import-csv", {
        bankAccountId: accountId,
        periodStart, periodEnd,
        fileName,
        rows,
        parserOptions: { dateFormat },
      }),
    onSuccess: (data: any) => {
      toast({
        title: "Importado",
        description: `${data.importedLines} líneas nuevas · ${data.duplicateLines} duplicadas`,
      });
      onDone();
      onClose();
      setRows([]); setFileName(""); setPeriodStart(""); setPeriodEnd("");
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar extracto bancario</DialogTitle>
          <DialogDescription>
            CSV con columnas: fecha, descripcion, debito, credito (o monto), referencia
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Archivo CSV</Label>
            <Input type="file" accept=".csv,.txt" onChange={handleFile} />
            {fileName && <p className="text-xs text-muted-foreground mt-1">{fileName} · {rows.length} filas</p>}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Período desde</Label>
              <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            </div>
            <div>
              <Label>Período hasta</Label>
              <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </div>
            <div>
              <Label>Formato fecha</Label>
              <Select value={dateFormat} onValueChange={(v) => setDateFormat(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                  <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                  <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {rows.length > 0 && (
            <div className="border rounded p-2 max-h-40 overflow-auto text-xs">
              <pre>{JSON.stringify(rows.slice(0, 3), null, 2)}</pre>
              <p className="text-muted-foreground">Vista previa (primeras 3 filas)</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={() => importMut.mutate()}
            disabled={!rows.length || !periodStart || !periodEnd || importMut.isPending}
          >
            {importMut.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Importar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const out: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = cells[idx] ?? ""; });
    out.push(row);
  }
  return out;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === "," && !inQuote) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}
