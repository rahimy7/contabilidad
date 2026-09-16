import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ChevronLeft, MoreHorizontal, Pencil, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Fact, FactBox, PageHeader, StatusChip, money } from "@/components/erp";
import { CreditChip, Field, Section, apiErrorOf, fmtDate, fmtDateTime } from "@/components/customers/fields";
import { CreditPanel } from "@/components/customers/credit-panel";
import { ContactsPanel } from "@/components/customers/contacts-panel";
import { StatementPanel } from "@/components/customers/statement-panel";
import { customersApi, customerKeys, type CustomerDetail, type CustomerForm } from "@/lib/customers-api";
import {
  DGII_STATUS, DR_PROVINCES, NCF_TYPES, PERSON_TYPES, TAXPAYER_TYPES, TAX_ID_TYPES,
  checkFiscalIdentity, formatTaxId, onlyDigits,
  type PersonType, type TaxIdType, type TaxpayerType,
} from "@shared/customer-fiscal";

/**
 * Ficha de cliente: una sola vista para crear, consultar y editar.
 *
 * Consultar es el modo por defecto — la ficha se abre para leerla, y "Editar"
 * es un paso explícito que habilita los campos. Crédito, contactos y estado de
 * cuenta existen sólo para un cliente ya guardado; en el alta se ven, pero
 * explican por qué están cerrados.
 */

const EMPTY_FORM: CustomerForm = {
  code: null, personType: "juridica", taxIdType: "rnc", rnc: null, foreignId: null,
  legalName: "", tradeName: null, taxpayerType: "contribuyente", defaultNcfType: "B01",
  itbisExempt: false, exemptionReference: null, economicActivity: null, dgiiStatus: null, dgiiVerifiedAt: null,
  phone: "", phoneAlt: null, email: null, website: null,
  address: null, sector: null, municipality: null, province: null, postalCode: null, country: "DO",
  customerTypeId: null, salesRepUserId: null, currency: "DOP", preferredPaymentMethod: null,
  isActive: true, notes: null,
  terms: {
    priceListId: null, additionalDiscountPercent: 0, earlyPaymentDiscountPercent: 0, earlyPaymentDays: null,
    itbisRetentionPercent: 0, isrRetentionPercent: 0, requiresPurchaseOrder: false, gracePeriodDays: 0, notes: null,
  },
};

const COUNTRIES: Record<string, string> = {
  DO: "República Dominicana", US: "Estados Unidos", PR: "Puerto Rico", HT: "Haití", ES: "España",
  CO: "Colombia", VE: "Venezuela", PA: "Panamá", MX: "México", CN: "China", OT: "Otro",
};
const PAYMENT_METHODS: Record<string, string> = { transfer: "Transferencia", check: "Cheque", cash: "Efectivo", card: "Tarjeta" };
const CURRENCIES: Record<string, string> = { DOP: "DOP · Peso dominicano", USD: "USD · Dólar", EUR: "EUR · Euro" };

function toForm(d: CustomerDetail): CustomerForm {
  const c = d.customer;
  return {
    code: c.code, personType: c.personType, taxIdType: c.taxIdType, rnc: c.rnc, foreignId: c.foreignId,
    legalName: c.legalName ?? "", tradeName: c.tradeName, taxpayerType: c.taxpayerType, defaultNcfType: c.defaultNcfType,
    itbisExempt: c.itbisExempt, exemptionReference: c.exemptionReference, economicActivity: c.economicActivity,
    dgiiStatus: c.dgiiStatus, dgiiVerifiedAt: c.dgiiVerifiedAt, phone: c.phone ?? "", phoneAlt: c.phoneAlt,
    email: c.email, website: c.website, address: c.address, sector: c.sector, municipality: c.municipality,
    province: c.province, postalCode: c.postalCode, country: c.country ?? "DO", customerTypeId: c.customerTypeId,
    salesRepUserId: c.salesRepUserId, currency: c.currency ?? "DOP", preferredPaymentMethod: c.preferredPaymentMethod,
    isActive: c.isActive, notes: c.notes,
    terms: {
      priceListId: d.terms.priceListId, additionalDiscountPercent: d.terms.additionalDiscountPercent,
      earlyPaymentDiscountPercent: d.terms.earlyPaymentDiscountPercent, earlyPaymentDays: d.terms.earlyPaymentDays,
      itbisRetentionPercent: d.terms.itbisRetentionPercent, isrRetentionPercent: d.terms.isrRetentionPercent,
      requiresPurchaseOrder: d.terms.requiresPurchaseOrder, gracePeriodDays: d.terms.gracePeriodDays, notes: d.terms.notes,
    },
  };
}

export default function CustomerDetailPage() {
  const [isNew] = useRoute("/customers/new");
  const [, params] = useRoute<{ id: string }>("/customers/:id");
  const routeId = params ? params.id : "none";
  // Una ficha por cliente: cambiar de ruta no arrastra el estado de la anterior.
  return <CustomerRecord key={isNew ? "new" : routeId} id={isNew ? null : Number(routeId)} />;
}

function CustomerRecord({ id }: { id: number | null }) {
  const isNew = id === null;
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();

  const detail = useQuery({
    queryKey: customerKeys.detail(id ?? 0),
    queryFn: () => customersApi.get(id!),
    enabled: !isNew && Number.isInteger(id),
  });
  const lookups = useQuery({ queryKey: ["/api/customer-master/lookups"], queryFn: () => customersApi.lookups() });

  const [editing, setEditing] = useState(isNew);
  const [form, setForm] = useState<CustomerForm>(EMPTY_FORM);
  const [tab, setTab] = useState("general");
  const [attempted, setAttempted] = useState(false);
  const [duplicate, setDuplicate] = useState<{ code?: string; name?: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (detail.data && !editing) setForm(toForm(detail.data));
  }, [detail.data, editing]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: customerKeys.list });
    if (id) {
      qc.invalidateQueries({ queryKey: customerKeys.detail(id) });
      qc.invalidateQueries({ queryKey: customerKeys.statement(id) });
    }
  };

  // ── edición ────────────────────────────────────────────────────────────────
  const set = <K extends keyof CustomerForm>(k: K, v: CustomerForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setTerm = <K extends keyof CustomerForm["terms"]>(k: K, v: CustomerForm["terms"][K]) =>
    setForm((f) => ({ ...f, terms: { ...f.terms, [k]: v } }));

  /** Una persona jurídica se identifica con RNC y no es consumidor final. */
  const setPersonType = (p: PersonType) =>
    setForm((f) => {
      const next = { ...f, personType: p };
      if (p === "juridica") {
        next.taxIdType = f.taxpayerType === "exterior" ? f.taxIdType : "rnc";
        if (f.taxpayerType === "consumidor_final") {
          next.taxpayerType = "contribuyente";
          next.defaultNcfType = TAXPAYER_TYPES.contribuyente.ncf;
        }
      } else if (f.taxIdType === "rnc") {
        next.taxIdType = "cedula";
      }
      return next;
    });

  /** El régimen propone el comprobante; el usuario puede cambiarlo después. */
  const setTaxpayer = (t: TaxpayerType) =>
    setForm((f) => ({
      ...f,
      taxpayerType: t,
      defaultNcfType: TAXPAYER_TYPES[t].ncf,
      personType: t === "gubernamental" ? "juridica" : f.personType,
      taxIdType: t === "gubernamental" ? "rnc" : t === "exterior" && (f.taxIdType === "rnc" || f.taxIdType === "cedula") ? "pasaporte" : f.taxIdType,
    }));

  const setTaxIdType = (v: string) =>
    setForm((f) => ({ ...f, taxIdType: v === "none" ? null : (v as TaxIdType), rnc: v === "rnc" || v === "cedula" ? f.rnc : null, foreignId: v === "pasaporte" || v === "extranjero" ? f.foreignId : null }));

  const fiscal = useMemo(() => checkFiscalIdentity({ ...form, rnc: onlyDigits(form.rnc) || null }), [form]);
  const requiredErrors = {
    legalName: !form.legalName.trim() ? "Obligatorio." : null,
    phone: form.phone.trim().length < 7 ? "Indique un teléfono válido." : null,
    email: form.email && !/^\S+@\S+\.\S+$/.test(form.email) ? "Correo inválido." : null,
  };
  const blocking = [...fiscal.errors, ...Object.values(requiredErrors).filter(Boolean)] as string[];
  // Cada error se marca en la pestaña donde se corrige.
  const IDENTITY_ERROR = /dígitos|razón social|nombre completo|documento de identidad|jurídica dominicana/;
  const generalHasErrors = fiscal.errors.some((e) => IDENTITY_ERROR.test(e)) || Object.values(requiredErrors).some(Boolean);
  const fiscalHasErrors = fiscal.errors.some((e) => !IDENTITY_ERROR.test(e));

  const save = useMutation({
    mutationFn: (confirmDuplicateTaxId: boolean) => {
      const body = { ...form, rnc: onlyDigits(form.rnc) || null, confirmDuplicateTaxId };
      return isNew ? customersApi.create(body) : customersApi.update(id!, body);
    },
    onSuccess: (r) => {
      setDuplicate(null);
      refresh();
      toast({ title: isNew ? "Cliente registrado" : "Cambios guardados" });
      if (isNew) navigate(`/customers/${r.id}`);
      else setEditing(false);
    },
    onError: (e) => {
      const err = apiErrorOf(e);
      if (err.code === "duplicate_tax_id") return setDuplicate(err.details ?? {});
      toast({ title: "No se pudo guardar", description: err.message, variant: "destructive" });
    },
  });

  const submit = () => {
    setAttempted(true);
    if (blocking.length > 0) {
      toast({ title: "Revise la ficha", description: blocking[0], variant: "destructive" });
      return;
    }
    save.mutate(false);
  };

  const cancel = () => {
    if (isNew) return navigate("/customers");
    if (detail.data) setForm(toForm(detail.data));
    setAttempted(false);
    setEditing(false);
  };

  const toggleActive = useMutation({
    mutationFn: () => customersApi.update(id!, { ...toForm(detail.data!), isActive: !detail.data!.customer.isActive }),
    onSuccess: () => {
      refresh();
      toast({ title: detail.data?.customer.isActive ? "Cliente inactivado" : "Cliente reactivado" });
    },
    onError: (e) => toast({ title: "No se pudo cambiar el estado", description: apiErrorOf(e).message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: () => customersApi.remove(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: customerKeys.list });
      toast({ title: "Cliente eliminado" });
      navigate("/customers");
    },
    onError: (e) => {
      setConfirmDelete(false);
      toast({ title: "No se pudo eliminar", description: apiErrorOf(e).message, variant: "destructive" });
    },
  });

  // ── estados de carga ───────────────────────────────────────────────────────
  if (!isNew && detail.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!isNew && (detail.isError || !detail.data)) {
    return (
      <div className="space-y-3">
        <BackLink />
        <p className="text-[13px] text-destructive">No se pudo abrir el cliente: {apiErrorOf(detail.error).message}</p>
      </div>
    );
  }

  const d = detail.data;
  const lk = lookups.data;
  const showErr = (msg: string | null) => (attempted ? msg : null);
  const idDigits = onlyDigits(form.rnc);
  const checkDigitWarning = fiscal.warnings.find((w) => w.includes("dígito"));
  const isDominicanId = form.taxIdType === "rnc" || form.taxIdType === "cedula";

  const title = isNew ? "Nuevo cliente" : d!.customer.name;
  const subtitle = isNew ? (
    "Complete la identificación fiscal; el código se asigna al guardar."
  ) : (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="font-mono">{d!.customer.code}</span>
      <span>·</span>
      <span>{d!.customer.rnc ? `${TAX_ID_TYPES[d!.customer.taxIdType ?? "rnc"]} ${formatTaxId(d!.customer.rnc)}` : d!.customer.foreignId ?? "Sin identificación fiscal"}</span>
      <span>·</span>
      <span>{TAXPAYER_TYPES[d!.customer.taxpayerType]?.label}</span>
      <StatusChip status={d!.customer.isActive ? "ok" : "void"}>{d!.customer.isActive ? "Activo" : "Inactivo"}</StatusChip>
      <CreditChip status={d!.credit.status} pending={d!.applications.some((a) => a.status === "pending")} />
    </span>
  );

  return (
    <div className="space-y-3">
      <BackLink />
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          editing ? (
            <>
              <Button variant="outline" size="sm" onClick={cancel} disabled={save.isPending}>
                <X className="mr-1.5 h-3.5 w-3.5" /> Cancelar
              </Button>
              <Button size="sm" onClick={submit} disabled={save.isPending}>
                <Save className="mr-1.5 h-3.5 w-3.5" /> {save.isPending ? "Guardando…" : isNew ? "Registrar cliente" : "Guardar cambios"}
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                onClick={() => {
                  // Editar es de los datos de la ficha: crédito, contactos y cuenta tienen sus propias acciones.
                  if (!["general", "fiscal", "terms"].includes(tab)) setTab("general");
                  setEditing(true);
                }}
              >
                <Pencil className="mr-1.5 h-3.5 w-3.5" /> Editar
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" aria-label="Más acciones">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setTab("credit")}>Línea de crédito</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setTab("statement")}>Estado de cuenta</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/approvals")}>Bandeja de aprobaciones</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => toggleActive.mutate()}>
                    {d!.customer.isActive ? "Inactivar cliente" : "Reactivar cliente"}
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive" onClick={() => setConfirmDelete(true)}>
                    Eliminar cliente
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )
        }
      />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="mb-3 h-auto flex-wrap justify-start">
              <TabsTrigger value="general">
                General{editing && attempted && generalHasErrors && <span className="ml-1 text-destructive" aria-label="con errores">•</span>}
              </TabsTrigger>
              <TabsTrigger value="fiscal">
                Fiscal{editing && attempted && fiscalHasErrors && <span className="ml-1 text-destructive" aria-label="con errores">•</span>}
              </TabsTrigger>
              <TabsTrigger value="terms">Condiciones</TabsTrigger>
              <TabsTrigger value="credit" disabled={editing}>Crédito</TabsTrigger>
              <TabsTrigger value="contacts" disabled={editing}>Contactos{d ? ` (${d.contacts.length})` : ""}</TabsTrigger>
              <TabsTrigger value="statement" disabled={editing}>Estado de cuenta</TabsTrigger>
            </TabsList>

            {/* ── General ─────────────────────────────────────────────────── */}
            <TabsContent value="general" className="mt-0 space-y-3">
              <Section title="Identificación" description="Tal como figura en el Registro Nacional de Contribuyentes">
                <Field label="Código" editing={editing} display={form.code} hint="Vacío: se asigna CL-000000 al guardar">
                  <Input value={form.code ?? ""} onChange={(e) => set("code", e.target.value)} placeholder="Automático" />
                </Field>
                <Field label="Tipo de persona" required editing={editing} display={PERSON_TYPES[form.personType]}>
                  <Select value={form.personType} onValueChange={(v) => setPersonType(v as PersonType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(PERSON_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Tipo de documento" editing={editing} display={form.taxIdType ? TAX_ID_TYPES[form.taxIdType] : "Sin identificación"}>
                  <Select value={form.taxIdType ?? "none"} onValueChange={setTaxIdType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(TAX_ID_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                      <SelectItem value="none">Sin identificación (consumidor final)</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field
                  label={form.taxIdType === "rnc" ? "Número de RNC" : form.taxIdType === "cedula" ? "Número de cédula" : "Número de documento"}
                  required={!!form.taxIdType}
                  editing={editing}
                  display={isDominicanId ? formatTaxId(form.rnc) : form.foreignId}
                  error={showErr(fiscal.errors.find((e) => /dígitos|número del documento/.test(e)) ?? null)}
                  hint={
                    checkDigitWarning ? <span className="text-warning">{checkDigitWarning}</span>
                      : isDominicanId && idDigits.length >= 9 ? <span className="text-success">Formato válido</span>
                      : form.taxIdType === "rnc" ? "9 dígitos" : form.taxIdType === "cedula" ? "11 dígitos" : undefined
                  }
                >
                  {isDominicanId ? (
                    <Input
                      value={form.rnc ?? ""}
                      onChange={(e) => set("rnc", e.target.value)}
                      onBlur={() => form.rnc && set("rnc", formatTaxId(form.rnc))}
                      inputMode="numeric"
                      placeholder={form.taxIdType === "rnc" ? "1-01-00000-0" : "001-0000000-0"}
                      disabled={!form.taxIdType}
                    />
                  ) : (
                    <Input value={form.foreignId ?? ""} onChange={(e) => set("foreignId", e.target.value)} disabled={!form.taxIdType} />
                  )}
                </Field>
                <Field
                  label={form.personType === "juridica" ? "Razón social" : "Nombre completo"}
                  required span={2} editing={editing} display={form.legalName} error={showErr(requiredErrors.legalName)}
                >
                  <Input value={form.legalName} onChange={(e) => set("legalName", e.target.value)} />
                </Field>
                <Field label="Nombre comercial" editing={editing} display={form.tradeName} hint="Así aparece en listas y búsquedas">
                  <Input value={form.tradeName ?? ""} onChange={(e) => set("tradeName", e.target.value)} />
                </Field>
              </Section>

              <Section title="Contacto">
                <Field label="Teléfono principal" required editing={editing} display={form.phone} error={showErr(requiredErrors.phone)}>
                  <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="809-555-0000" inputMode="tel" />
                </Field>
                <Field label="Teléfono alterno" editing={editing} display={form.phoneAlt}>
                  <Input value={form.phoneAlt ?? ""} onChange={(e) => set("phoneAlt", e.target.value)} inputMode="tel" />
                </Field>
                <Field label="Correo electrónico" editing={editing} display={form.email} error={requiredErrors.email}
                  hint="Para el envío de facturas electrónicas">
                  <Input type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} />
                </Field>
                <Field label="Sitio web" editing={editing} display={form.website}>
                  <Input value={form.website ?? ""} onChange={(e) => set("website", e.target.value)} />
                </Field>
              </Section>

              <Section title="Dirección fiscal">
                <Field label="Calle y número" span={2} editing={editing} display={form.address}>
                  <Input value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} placeholder="Av. Winston Churchill No. 25, Torre X, local 3" />
                </Field>
                <Field label="Sector" editing={editing} display={form.sector}>
                  <Input value={form.sector ?? ""} onChange={(e) => set("sector", e.target.value)} />
                </Field>
                <Field label="Municipio" editing={editing} display={form.municipality}>
                  <Input value={form.municipality ?? ""} onChange={(e) => set("municipality", e.target.value)} />
                </Field>
                <Field label="Provincia" editing={editing} display={form.province}>
                  <Select value={form.province ?? ""} onValueChange={(v) => set("province", v)}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>
                      {DR_PROVINCES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Código postal" editing={editing} display={form.postalCode}>
                  <Input value={form.postalCode ?? ""} onChange={(e) => set("postalCode", e.target.value)} inputMode="numeric" />
                </Field>
                <Field label="País" editing={editing} display={COUNTRIES[form.country] ?? form.country}>
                  <Select value={form.country} onValueChange={(v) => set("country", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(COUNTRIES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </Section>

              <Section title="Clasificación y gestión">
                <Field label="Tipo de cliente" editing={editing}
                  display={lk?.customerTypes.find((t) => t.id === form.customerTypeId)?.name}>
                  <Select value={form.customerTypeId ? String(form.customerTypeId) : "none"} onValueChange={(v) => set("customerTypeId", v === "none" ? null : Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin clasificar</SelectItem>
                      {lk?.customerTypes.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Vendedor asignado" editing={editing}
                  display={lk?.salesReps.find((u) => u.id === form.salesRepUserId)?.name ?? d?.customer.salesRepName}>
                  <Select value={form.salesRepUserId ? String(form.salesRepUserId) : "none"} onValueChange={(v) => set("salesRepUserId", v === "none" ? null : Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin asignar</SelectItem>
                      {lk?.salesReps.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Estado" editing={editing} display={form.isActive ? "Activo" : "Inactivo"}>
                  <label className="flex h-9 items-center gap-2 text-[13px]">
                    <Switch checked={form.isActive} onCheckedChange={(v) => set("isActive", v)} />
                    {form.isActive ? "Activo" : "Inactivo — no aparece en ventas"}
                  </label>
                </Field>
                <Field label="Notas internas" span={3} editing={editing} display={form.notes}>
                  <Textarea value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} rows={2} />
                </Field>
              </Section>
            </TabsContent>

            {/* ── Fiscal ──────────────────────────────────────────────────── */}
            <TabsContent value="fiscal" className="mt-0 space-y-3">
              <Section title="Régimen y comprobante" description="Determina el NCF que se le emite y qué exige la DGII en el 607">
                <Field label="Régimen tributario" required span={2} editing={editing} display={TAXPAYER_TYPES[form.taxpayerType]?.label}>
                  <Select value={form.taxpayerType} onValueChange={(v) => setTaxpayer(v as TaxpayerType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(TAXPAYER_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Comprobante por defecto" editing={editing}
                  display={form.defaultNcfType ? NCF_TYPES[form.defaultNcfType] ?? form.defaultNcfType : null}
                  hint={`Sugerido para el régimen: ${TAXPAYER_TYPES[form.taxpayerType].ncf}`}
                  error={showErr(fiscal.errors.find((e) => /comprobante/i.test(e)) ?? null)}>
                  <Select value={form.defaultNcfType ?? "none"} onValueChange={(v) => set("defaultNcfType", v === "none" ? null : v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Elegir al facturar</SelectItem>
                      {Object.entries(NCF_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Actividad económica" span={3} editing={editing} display={form.economicActivity}
                  hint="Actividad principal registrada en la DGII">
                  <Input value={form.economicActivity ?? ""} onChange={(e) => set("economicActivity", e.target.value)} placeholder="Venta al por mayor de productos alimenticios" />
                </Field>
              </Section>

              <Section title="Impuestos y retenciones" description="Cómo trata el cliente el ITBIS y el ISR de nuestras facturas">
                <Field label="Exento de ITBIS" editing={editing} display={form.itbisExempt ? "Sí" : "No"}>
                  <label className="flex h-9 items-center gap-2 text-[13px]">
                    <Switch checked={form.itbisExempt} onCheckedChange={(v) => set("itbisExempt", v)} />
                    {form.itbisExempt ? "Exento" : "Gravado"}
                  </label>
                </Field>
                <Field label="Resolución o constancia de exención" span={2} editing={editing} display={form.exemptionReference}
                  required={form.itbisExempt}
                  error={showErr(fiscal.errors.find((e) => /exento/.test(e)) ?? null)}>
                  <Input value={form.exemptionReference ?? ""} onChange={(e) => set("exemptionReference", e.target.value)} disabled={!form.itbisExempt} />
                </Field>
                <Field label="Retención de ITBIS (%)" editing={editing}
                  display={form.terms.itbisRetentionPercent ? `${form.terms.itbisRetentionPercent}%` : "No retiene"}
                  hint="Si el cliente es agente de retención (p. ej. 30% o 100%)">
                  <NumInput value={form.terms.itbisRetentionPercent} onChange={(v) => setTerm("itbisRetentionPercent", v ?? 0)} max={100} />
                </Field>
                <Field label="Retención de ISR (%)" editing={editing}
                  display={form.terms.isrRetentionPercent ? `${form.terms.isrRetentionPercent}%` : "No retiene"}
                  hint="Según el concepto (p. ej. 2% o 10%)">
                  <NumInput value={form.terms.isrRetentionPercent} onChange={(v) => setTerm("isrRetentionPercent", v ?? 0)} max={100} />
                </Field>
              </Section>

              <Section title="Verificación en la DGII" description="Resultado de la consulta del RNC en dgii.gov.do">
                <Field label="Estado del contribuyente" editing={editing} display={form.dgiiStatus ? DGII_STATUS[form.dgiiStatus] : "No verificado"}>
                  <Select value={form.dgiiStatus ?? "no_verificado"} onValueChange={(v) => set("dgiiStatus", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(DGII_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Fecha de verificación" editing={editing} display={fmtDate(form.dgiiVerifiedAt)}>
                  <Input type="date" value={form.dgiiVerifiedAt ?? ""} onChange={(e) => set("dgiiVerifiedAt", e.target.value)} />
                </Field>
              </Section>
            </TabsContent>

            {/* ── Condiciones ─────────────────────────────────────────────── */}
            <TabsContent value="terms" className="mt-0 space-y-3">
              <Section title="Precios y descuentos">
                <Field label="Lista de precios" editing={editing}
                  display={lk?.priceLists.find((p) => p.id === form.terms.priceListId)?.name ?? "Precio base"}>
                  <Select value={form.terms.priceListId ? String(form.terms.priceListId) : "none"} onValueChange={(v) => setTerm("priceListId", v === "none" ? null : Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Precio base</SelectItem>
                      {lk?.priceLists.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Descuento adicional (%)" editing={editing}
                  display={form.terms.additionalDiscountPercent ? `${form.terms.additionalDiscountPercent}%` : "Ninguno"}>
                  <NumInput value={form.terms.additionalDiscountPercent} onChange={(v) => setTerm("additionalDiscountPercent", v ?? 0)} max={100} />
                </Field>
                <Field label="Moneda de facturación" editing={editing} display={CURRENCIES[form.currency] ?? form.currency}>
                  <Select value={form.currency} onValueChange={(v) => set("currency", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(CURRENCIES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Forma de pago habitual" editing={editing}
                  display={form.preferredPaymentMethod ? PAYMENT_METHODS[form.preferredPaymentMethod] : null}>
                  <Select value={form.preferredPaymentMethod ?? "none"} onValueChange={(v) => set("preferredPaymentMethod", v === "none" ? null : v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No indicada</SelectItem>
                      {Object.entries(PAYMENT_METHODS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Exige orden de compra" editing={editing} display={form.terms.requiresPurchaseOrder ? "Sí" : "No"}>
                  <label className="flex h-9 items-center gap-2 text-[13px]">
                    <Switch checked={form.terms.requiresPurchaseOrder} onCheckedChange={(v) => setTerm("requiresPurchaseOrder", v)} />
                    {form.terms.requiresPurchaseOrder ? "No se factura sin OC del cliente" : "No"}
                  </label>
                </Field>
              </Section>

              <Section title="Cobranza" description="El límite y el plazo sólo cambian con una solicitud de crédito aprobada">
                <Field label="Límite de crédito" editing={false}
                  display={d && Number(d.credit.limit) > 0 ? money(d.credit.limit) : "Sin línea aprobada"} />
                <Field label="Plazo de crédito" editing={false}
                  display={d && d.credit.days > 0 ? `${d.credit.days} días` : "Contado"} />
                <Field label="Días de gracia" editing={editing}
                  display={form.terms.gracePeriodDays ? `${form.terms.gracePeriodDays} días` : "Ninguno"}
                  hint="Antes de considerar la factura en mora">
                  <NumInput value={form.terms.gracePeriodDays} onChange={(v) => setTerm("gracePeriodDays", Math.round(v ?? 0))} max={365} integer />
                </Field>
                <Field label="Descuento por pronto pago (%)" editing={editing}
                  display={form.terms.earlyPaymentDiscountPercent ? `${form.terms.earlyPaymentDiscountPercent}% si paga en ${form.terms.earlyPaymentDays ?? 0} días` : "Ninguno"}>
                  <NumInput value={form.terms.earlyPaymentDiscountPercent} onChange={(v) => setTerm("earlyPaymentDiscountPercent", v ?? 0)} max={100} />
                </Field>
                <Field label="Pagando dentro de (días)" editing={editing} display={form.terms.earlyPaymentDays}>
                  <NumInput value={form.terms.earlyPaymentDays} onChange={(v) => setTerm("earlyPaymentDays", v === null ? null : Math.round(v))} max={365} integer nullable />
                </Field>
                <Field label="Notas de condiciones" span={3} editing={editing} display={form.terms.notes}>
                  <Textarea value={form.terms.notes ?? ""} onChange={(e) => setTerm("notes", e.target.value)} rows={2} />
                </Field>
                {d?.terms.validFrom && (
                  <p className="text-[11.5px] text-muted-foreground sm:col-span-2 lg:col-span-3">
                    Condiciones vigentes desde {fmtDate(String(d.terms.validFrom).slice(0, 10))}. Cada cambio guarda una versión nueva.
                  </p>
                )}
              </Section>
            </TabsContent>

            {d && user && (
              <>
                <TabsContent value="credit" className="mt-0">
                  <CreditPanel detail={d} userId={Number(user.id)} userRole={String(user.role)} onChanged={refresh} />
                </TabsContent>
                <TabsContent value="contacts" className="mt-0">
                  <ContactsPanel customerId={d.customer.id} contacts={d.contacts} onChanged={refresh} />
                </TabsContent>
                <TabsContent value="statement" className="mt-0">
                  <StatementPanel customerId={d.customer.id} />
                </TabsContent>
              </>
            )}
          </Tabs>
        </div>

        {/* ── Panel lateral ───────────────────────────────────────────────── */}
        <div className="space-y-3 lg:sticky lg:top-3">
          {editing ? (
            <FactBox title="Validación fiscal">
              {fiscal.errors.length === 0 && fiscal.warnings.length === 0 ? (
                <p className="flex items-start gap-2 text-[12.5px] text-success">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Identidad fiscal coherente con el régimen y el comprobante.
                </p>
              ) : (
                <ul className="space-y-2 text-[12.5px]">
                  {fiscal.errors.map((e) => (
                    <li key={e} className="flex items-start gap-2 text-destructive">
                      <X className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {e}
                    </li>
                  ))}
                  {fiscal.warnings.map((w) => (
                    <li key={w} className="flex items-start gap-2 text-warning">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {w}
                    </li>
                  ))}
                </ul>
              )}
              <div className="border-t border-border pt-2">
                <Fact label="Comprobante">{form.defaultNcfType ?? "Al facturar"}</Fact>
                <Fact label="Régimen">{TAXPAYER_TYPES[form.taxpayerType].label.split(" (")[0]}</Fact>
              </div>
            </FactBox>
          ) : d ? (
            <>
              <FactBox title="Resumen de crédito">
                <Fact label="Estado"><CreditChip status={d.credit.status} pending={d.applications.some((a) => a.status === "pending")} /></Fact>
                <Fact label="Límite">{Number(d.credit.limit) > 0 ? money(d.credit.limit) : "—"}</Fact>
                <Fact label="Plazo">{d.credit.days > 0 ? `${d.credit.days} días` : "Contado"}</Fact>
                <Fact label="Utilizado">{money(d.credit.used)}</Fact>
                <Fact label="Disponible">
                  <span className={d.credit.status === "active" ? "text-success" : "text-muted-foreground"}>
                    {d.credit.status === "active" ? money(d.credit.available) : "—"}
                  </span>
                </Fact>
                <Fact label="Vencido">
                  <span className={Number(d.credit.overdue) > 0 ? "text-destructive" : ""}>{money(d.credit.overdue)}</span>
                </Fact>
                {d.credit.maxDaysOverdue ? <Fact label="Mayor atraso">{d.credit.maxDaysOverdue} días</Fact> : null}
              </FactBox>
              <FactBox title="Actividad">
                <Fact label="Ventas 12 meses">{money(d.credit.sales12m)}</Fact>
                <Fact label="Última factura">{fmtDate(d.credit.lastInvoice) ?? "—"}</Fact>
                <Fact label="Último cobro">{fmtDate(d.credit.lastReceipt) ?? "—"}</Fact>
                <Fact label="Vendedor">{d.customer.salesRepName ?? "—"}</Fact>
              </FactBox>
              <FactBox title="Registro">
                <Fact label="Código">{d.customer.code ?? "—"}</Fact>
                <Fact label="Creado">{fmtDateTime(d.customer.createdAt)}</Fact>
                <Fact label="Por">{d.customer.createdByName ?? "—"}</Fact>
                <Fact label="Modificado">{fmtDateTime(d.customer.updatedAt)}</Fact>
                <Fact label="Por">{d.customer.updatedByName ?? "—"}</Fact>
              </FactBox>
            </>
          ) : null}
        </div>
      </div>

      <AlertDialog open={!!duplicate} onOpenChange={(v) => !v && setDuplicate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>RNC ya registrado</AlertDialogTitle>
            <AlertDialogDescription>
              El documento {formatTaxId(form.rnc)} ya pertenece a {duplicate?.code ? `${duplicate.code} · ` : ""}{duplicate?.name}.
              Regístrelo de nuevo sólo si es una sucursal o cuenta separada del mismo contribuyente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Revisar</AlertDialogCancel>
            <AlertDialogAction onClick={() => save.mutate(true)}>Registrar de todas formas</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar cliente</AlertDialogTitle>
            <AlertDialogDescription>
              Sólo se puede eliminar un cliente sin comprobantes, pedidos ni cuentas por cobrar. Si ya tiene movimientos, inactívelo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => remove.mutate()}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/customers" className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground">
      <ChevronLeft className="h-3.5 w-3.5" /> Clientes
    </Link>
  );
}

/**
 * Entrada numérica que conserva lo que se teclea ("2." mientras se escribe
 * 2.5) y entrega el número al formulario.
 */
function NumInput({
  id, value, onChange, max, integer, nullable,
}: {
  id?: string;
  value: number | null;
  onChange: (v: number | null) => void;
  max?: number;
  integer?: boolean;
  nullable?: boolean;
}) {
  const [text, setText] = useState(value === null ? "" : String(value));
  useEffect(() => {
    if (value === null ? text !== "" : Number(text) !== value) setText(value === null ? "" : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <Input
      id={id}
      value={text}
      inputMode={integer ? "numeric" : "decimal"}
      onChange={(e) => {
        const raw = e.target.value.replace(",", ".");
        if (raw !== "" && !(integer ? /^\d+$/ : /^\d*\.?\d*$/).test(raw)) return;
        setText(raw);
        if (raw === "") return onChange(nullable ? null : 0);
        const n = Number(raw);
        if (!Number.isNaN(n)) onChange(max !== undefined ? Math.min(n, max) : n);
      }}
    />
  );
}
