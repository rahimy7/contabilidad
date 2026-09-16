import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { DataGrid, StatusChip, type Column } from "@/components/erp";
import { customersApi, type CustomerContact } from "@/lib/customers-api";
import { Field, apiErrorOf } from "./fields";

const ROLES: Record<CustomerContact["role"], string> = {
  buyer: "Compras",
  accountant: "Contabilidad / Cuentas por pagar",
  manager: "Gerencia",
  operations: "Operaciones",
  warehouse: "Almacén / Recepción",
  other: "Otro",
};

const EMPTY: Omit<CustomerContact, "id"> = {
  name: "", role: "buyer", email: null, phone: null, mobile: null,
  isPrimary: false, receivesInvoices: false, receivesStatements: false, notes: null,
};

/**
 * Personas de contacto del cliente. Separa a quién se le envía la factura de a
 * quién se le cobra: en una empresa rara vez son la misma persona.
 */
export function ContactsPanel({
  customerId, contacts, onChanged,
}: {
  customerId: number;
  contacts: CustomerContact[];
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState<{ id: number | null; form: Omit<CustomerContact, "id"> } | null>(null);

  const save = useMutation({
    mutationFn: () => customersApi.saveContact(customerId, editing!.id, editing!.form),
    onSuccess: () => {
      setEditing(null);
      onChanged();
    },
    onError: (e) => toast({ title: "No se pudo guardar el contacto", description: apiErrorOf(e).message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (contactId: number) => customersApi.removeContact(customerId, contactId),
    onSuccess: onChanged,
    onError: (e) => toast({ title: "No se pudo quitar el contacto", description: apiErrorOf(e).message, variant: "destructive" }),
  });

  const columns: Column<CustomerContact>[] = [
    {
      key: "name", header: "Nombre",
      cell: (c) => (
        <span className="flex items-center gap-2">
          <span className="font-medium">{c.name}</span>
          {c.isPrimary && <StatusChip status="ok">Principal</StatusChip>}
        </span>
      ),
    },
    { key: "role", header: "Función", cell: (c) => ROLES[c.role] ?? c.role },
    { key: "email", header: "Correo", cell: (c) => c.email ?? "—" },
    { key: "phone", header: "Teléfono", cell: (c) => [c.phone, c.mobile].filter(Boolean).join(" · ") || "—" },
    {
      key: "receives", header: "Recibe",
      cell: (c) => [c.receivesInvoices && "Facturas", c.receivesStatements && "Estados de cuenta"].filter(Boolean).join(", ") || "—",
    },
    {
      key: "actions", header: "", width: "80px", align: "right",
      cell: (c) => (
        <span className="inline-flex gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Editar ${c.name}`}
            onClick={() => setEditing({ id: c.id, form: { ...c } })}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Quitar ${c.name}`}
            onClick={() => remove.mutate(c.id)} disabled={remove.isPending}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </span>
      ),
    },
  ];

  const f = editing?.form;
  const set = <K extends keyof Omit<CustomerContact, "id">>(k: K, v: Omit<CustomerContact, "id">[K]) =>
    setEditing((e) => (e ? { ...e, form: { ...e.form, [k]: v } } : e));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-muted-foreground">Compras, cuentas por pagar y quién recibe facturas y estados de cuenta.</p>
        <Button size="sm" onClick={() => setEditing({ id: null, form: { ...EMPTY, isPrimary: contacts.length === 0 } })}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Agregar contacto
        </Button>
      </div>
      <DataGrid columns={columns} rows={contacts} rowKey={(c) => c.id} emptyMessage="Sin contactos registrados." />

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar contacto" : "Nuevo contacto"}</DialogTitle>
            <DialogDescription>Persona de contacto del cliente.</DialogDescription>
          </DialogHeader>
          {f && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nombre" editing required span={2}>
                <Input value={f.name} onChange={(e) => set("name", e.target.value)} autoFocus />
              </Field>
              <Field label="Función" editing>
                <Select value={f.role} onValueChange={(v) => set("role", v as CustomerContact["role"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROLES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Correo" editing>
                <Input type="email" value={f.email ?? ""} onChange={(e) => set("email", e.target.value)} />
              </Field>
              <Field label="Teléfono" editing>
                <Input value={f.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
              </Field>
              <Field label="Celular" editing>
                <Input value={f.mobile ?? ""} onChange={(e) => set("mobile", e.target.value)} />
              </Field>
              <div className="flex flex-col gap-2 sm:col-span-2">
                {([
                  ["isPrimary", "Contacto principal"],
                  ["receivesInvoices", "Recibe las facturas"],
                  ["receivesStatements", "Recibe los estados de cuenta"],
                ] as const).map(([k, label]) => (
                  <label key={k} className="flex items-center gap-2 text-[13px]">
                    <Switch checked={f[k]} onCheckedChange={(v) => set(k, v)} /> {label}
                  </label>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={!f || f.name.trim().length < 2 || save.isPending}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
