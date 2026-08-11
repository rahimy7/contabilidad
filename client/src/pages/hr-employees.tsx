import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import {
  Users, UserPlus, RotateCw, Eye, Calculator, AlertTriangle, CheckCircle2,
} from 'lucide-react';

interface Employee {
  id: number;
  employeeCode: string;
  firstName: string;
  lastName: string;
  cedula: string | null;
  department: string | null;
  positionTitle: string | null;
  hireDate: string;
  employmentStatus: string;
  monthlySalary: string;
}

const STATUS: Record<string, { label: string; className?: string; variant?: 'default' | 'destructive' | 'secondary' | 'outline' }> = {
  active: { label: 'Activo', className: 'bg-green-600 hover:bg-green-600' },
  on_leave: { label: 'Licencia', variant: 'secondary' },
  terminated: { label: 'Terminado', variant: 'destructive' },
  retired: { label: 'Jubilado', variant: 'outline' },
  suspended: { label: 'Suspendido', variant: 'outline' },
};

const money = (v: string) => Number(v).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function StatusBadge({ s }: { s: string }) {
  const c = STATUS[s] ?? { label: s, variant: 'outline' as const };
  return <Badge variant={c.variant ?? 'default'} className={c.className}>{c.label}</Badge>;
}

export default function HrEmployeesPage() {
  const [status, setStatus] = useState('active');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<number | null>(null);
  const [hire, setHire] = useState(false);

  const params = new URLSearchParams();
  if (status !== 'all') params.set('status', status);
  if (search) params.set('search', search);
  const q = useQuery<{ rows: Employee[] }>({
    queryKey: ['/api/hr/employees', params.toString()],
    queryFn: () => apiRequest('GET', `/api/hr/employees?${params.toString()}`) as any,
  });

  return (
    <div className="mx-auto max-w-7xl p-6 space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Users className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold">Empleados</h1>
            <p className="text-sm text-muted-foreground">
              Expediente completo: datos personales, contratos, puestos, documentos, contactos.
            </p>
          </div>
        </div>
        <Button onClick={() => setHire(true)}>
          <UserPlus className="h-4 w-4 mr-1" /> Contratar
        </Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Label>Estado:</Label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Activo</SelectItem>
            <SelectItem value="on_leave">Licencia</SelectItem>
            <SelectItem value="terminated">Terminado</SelectItem>
            <SelectItem value="suspended">Suspendido</SelectItem>
          </SelectContent>
        </Select>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, código o cédula"
          className="w-[280px]"
        />
        <Button variant="outline" size="sm" onClick={() => q.refetch()}>
          <RotateCw className={`h-4 w-4 mr-1 ${q.isFetching ? 'animate-spin' : ''}`} />
          Refrescar
        </Button>
        <span className="text-sm text-muted-foreground">
          {q.data?.rows?.length ?? 0} empleados
        </span>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Cédula</TableHead>
                <TableHead>Departamento</TableHead>
                <TableHead>Puesto</TableHead>
                <TableHead>Ingreso</TableHead>
                <TableHead className="text-right">Salario</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(q.data?.rows ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono">{r.employeeCode}</TableCell>
                  <TableCell>{r.firstName} {r.lastName}</TableCell>
                  <TableCell className="font-mono text-xs">{r.cedula ?? '—'}</TableCell>
                  <TableCell>{r.department ?? '—'}</TableCell>
                  <TableCell>{r.positionTitle ?? '—'}</TableCell>
                  <TableCell>{r.hireDate}</TableCell>
                  <TableCell className="text-right font-mono">{money(r.monthlySalary)}</TableCell>
                  <TableCell><StatusBadge s={r.employmentStatus} /></TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => setDetail(r.id)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {(q.data?.rows?.length ?? 0) === 0 && !q.isLoading && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    Sin empleados.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {detail != null && <EmployeeDetailDialog id={detail} onClose={() => setDetail(null)} />}
      {hire && <HireDialog onClose={() => setHire(false)} />}
    </div>
  );
}

interface FullEmployee {
  employee: Employee & {
    userId: number | null; nationality: string; birthDate: string | null;
    personalEmail: string | null; personalPhone: string | null;
    homeAddress: string | null; contractType: string | null;
    supervisorId: number | null; workLocation: string | null;
    paymentFrequency: string; terminationDate: string | null;
  };
  contracts: Array<any>;
  positions: Array<any>;
  documents: Array<any>;
  emergencyContacts: Array<any>;
  dependents: Array<any>;
  bankAccounts: Array<any>;
}

function EmployeeDetailDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const [showTerm, setShowTerm] = useState(false);
  const q = useQuery<FullEmployee>({
    queryKey: ['/api/hr/employees', id, 'full'],
    queryFn: () => apiRequest('GET', `/api/hr/employees/${id}/full`) as any,
  });
  const d = q.data;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {d ? `${d.employee.firstName} ${d.employee.lastName}` : '…'}
          </DialogTitle>
          <DialogDescription>
            {d && (
              <span className="flex items-center gap-2">
                <span className="font-mono">{d.employee.employeeCode}</span>
                <StatusBadge s={d.employee.employmentStatus} />
                {d.employee.terminationDate && (
                  <span className="text-xs">Salida: {d.employee.terminationDate}</span>
                )}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        {d && (
          <Tabs defaultValue="personal">
            <TabsList>
              <TabsTrigger value="personal">Personal</TabsTrigger>
              <TabsTrigger value="job">Puesto</TabsTrigger>
              <TabsTrigger value="history">Historial</TabsTrigger>
              <TabsTrigger value="docs">Documentos</TabsTrigger>
              <TabsTrigger value="contacts">Contactos</TabsTrigger>
            </TabsList>
            <TabsContent value="personal" className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Field label="Cédula" value={d.employee.cedula} />
                <Field label="Nacionalidad" value={d.employee.nationality} />
                <Field label="Nacimiento" value={d.employee.birthDate} />
                <Field label="Correo" value={d.employee.personalEmail} />
                <Field label="Teléfono" value={d.employee.personalPhone} />
                <Field label="Dirección" value={d.employee.homeAddress} />
              </div>
            </TabsContent>
            <TabsContent value="job" className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Field label="Puesto" value={d.employee.positionTitle} />
                <Field label="Departamento" value={d.employee.department} />
                <Field label="Ingreso" value={d.employee.hireDate} />
                <Field label="Tipo contrato" value={d.employee.contractType} />
                <Field label="Ubicación" value={d.employee.workLocation} />
                <Field label="Salario mensual" value={money(d.employee.monthlySalary)} />
                <Field label="Ciclo pago" value={d.employee.paymentFrequency} />
              </div>
              {d.employee.employmentStatus === 'active' && (
                <div className="pt-3 border-t">
                  <Button variant="outline" onClick={() => setShowTerm(true)}>
                    <Calculator className="h-4 w-4 mr-1" /> Calcular prestaciones (desvinculación)
                  </Button>
                </div>
              )}
            </TabsContent>
            <TabsContent value="history" className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">Puestos</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Desde</TableHead>
                      <TableHead>Hasta</TableHead>
                      <TableHead>Puesto</TableHead>
                      <TableHead>Salario</TableHead>
                      <TableHead>Razón</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.positions.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>{p.effectiveFrom}</TableCell>
                        <TableCell>{p.effectiveTo ?? 'vigente'}</TableCell>
                        <TableCell>{p.positionTitle}</TableCell>
                        <TableCell className="font-mono">{money(p.monthlySalary)}</TableCell>
                        <TableCell>{p.changeReason}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Contratos</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Inicio</TableHead>
                      <TableHead>Fin</TableHead>
                      <TableHead>Salario</TableHead>
                      <TableHead>Vigente</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.contracts.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>{c.contractType}</TableCell>
                        <TableCell>{c.startDate}</TableCell>
                        <TableCell>{c.endDate ?? (c.isIndefinite ? 'Indefinido' : '—')}</TableCell>
                        <TableCell className="font-mono">{money(c.monthlySalary)}</TableCell>
                        <TableCell>{c.isCurrent ? '✓' : ''}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
            <TabsContent value="docs">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead>Emitido</TableHead>
                    <TableHead>Vence</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.documents.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell>{doc.documentType}</TableCell>
                      <TableCell>{doc.title}</TableCell>
                      <TableCell>{doc.issuedAt ?? '—'}</TableCell>
                      <TableCell>{doc.expiresAt ?? 'sin vencimiento'}</TableCell>
                      <TableCell>
                        <a href={doc.fileUrl} target="_blank" rel="noreferrer" className="text-xs underline">
                          abrir
                        </a>
                      </TableCell>
                    </TableRow>
                  ))}
                  {d.documents.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-4">Sin documentos.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TabsContent>
            <TabsContent value="contacts" className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">Contactos de emergencia</h4>
                {d.emergencyContacts.length === 0 && (
                  <p className="text-sm text-muted-foreground">Ninguno registrado.</p>
                )}
                <div className="space-y-2">
                  {d.emergencyContacts.map((c) => (
                    <div key={c.id} className="border rounded-md p-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{c.name}</span>
                        <Badge variant="outline">{c.relationship}</Badge>
                        {c.isPrimary && <Badge>Principal</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {c.phonePrimary}{c.phoneSecondary && ` / ${c.phoneSecondary}`}
                        {c.email && ` · ${c.email}`}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Dependientes</h4>
                {d.dependents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Ninguno registrado.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nombre</TableHead>
                        <TableHead>Relación</TableHead>
                        <TableHead>Nacimiento</TableHead>
                        <TableHead>ISR</TableHead>
                        <TableHead>Salud</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {d.dependents.map((dp) => (
                        <TableRow key={dp.id}>
                          <TableCell>{dp.name}</TableCell>
                          <TableCell>{dp.relationship}</TableCell>
                          <TableCell>{dp.birthDate ?? '—'}</TableCell>
                          <TableCell>{dp.isTaxDependent ? '✓' : ''}</TableCell>
                          <TableCell>{dp.isHealthBeneficiary ? '✓' : ''}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}
        {showTerm && d && (
          <TerminationDialog
            employeeId={d.employee.id}
            employeeName={`${d.employee.firstName} ${d.employee.lastName}`}
            hireDate={d.employee.hireDate}
            monthlySalary={Number(d.employee.monthlySalary)}
            onClose={() => setShowTerm(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div>{value ?? '—'}</div>
    </div>
  );
}

function HireDialog({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    cedula: '',
    personalEmail: '',
    personalPhone: '',
    hireDate: new Date().toISOString().slice(0, 10),
    department: '',
    positionTitle: '',
    monthlySalary: 0,
    contractType: 'indefinite' as string,
  });
  const create = useMutation({
    mutationFn: () => apiRequest('POST', '/api/hr/employees', form),
    onSuccess: () => {
      toast({ title: 'Empleado contratado' });
      qc.invalidateQueries({ queryKey: ['/api/hr/employees'] });
      onClose();
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Contratar empleado</DialogTitle>
          <DialogDescription>Los datos crearán el expediente, primer contrato y primer puesto.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Nombres *</Label>
            <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
          </div>
          <div>
            <Label>Apellidos *</Label>
            <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
          </div>
          <div>
            <Label>Cédula</Label>
            <Input value={form.cedula} onChange={(e) => setForm({ ...form, cedula: e.target.value })} placeholder="000-0000000-0" />
          </div>
          <div>
            <Label>Correo personal</Label>
            <Input value={form.personalEmail} onChange={(e) => setForm({ ...form, personalEmail: e.target.value })} />
          </div>
          <div>
            <Label>Teléfono</Label>
            <Input value={form.personalPhone} onChange={(e) => setForm({ ...form, personalPhone: e.target.value })} />
          </div>
          <div>
            <Label>Fecha de ingreso *</Label>
            <Input type="date" value={form.hireDate} onChange={(e) => setForm({ ...form, hireDate: e.target.value })} />
          </div>
          <div>
            <Label>Departamento</Label>
            <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
          </div>
          <div>
            <Label>Puesto</Label>
            <Input value={form.positionTitle} onChange={(e) => setForm({ ...form, positionTitle: e.target.value })} />
          </div>
          <div>
            <Label>Sueldo mensual *</Label>
            <Input type="number" min={0} step="0.01" value={form.monthlySalary} onChange={(e) => setForm({ ...form, monthlySalary: Number(e.target.value) })} />
          </div>
          <div>
            <Label>Tipo de contrato</Label>
            <Select value={form.contractType} onValueChange={(v) => setForm({ ...form, contractType: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="indefinite">Indefinido</SelectItem>
                <SelectItem value="fixed_term">Plazo fijo</SelectItem>
                <SelectItem value="probation">Prueba</SelectItem>
                <SelectItem value="part_time">Medio tiempo</SelectItem>
                <SelectItem value="internship">Pasantía</SelectItem>
                <SelectItem value="consultant">Consultoría</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending || !form.firstName || !form.lastName || form.monthlySalary <= 0}>
            Contratar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface TerminationCalc {
  yearsOfService: number;
  monthsExtra: number;
  dailyWage: number;
  noticeDays: number;
  noticeAmount: number;
  severanceDays: number;
  severanceAmount: number;
  proportionalVacationDays: number;
  proportionalVacationAmount: number;
  proportionalChristmasBonus: number;
  pendingSalary: number;
  otherBenefits: number;
  grossTotal: number;
  deductionsAmount: number;
  netTotal: number;
}

function TerminationDialog({ employeeId, employeeName, hireDate, monthlySalary, onClose }: {
  employeeId: number;
  employeeName: string;
  hireDate: string;
  monthlySalary: number;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    terminationDate: new Date().toISOString().slice(0, 10),
    terminationType: 'employer_dismissal_no_cause' as string,
    reason: '',
    pendingSalary: 0,
    otherBenefits: 0,
    deductionsAmount: 0,
  });
  const [calc, setCalc] = useState<TerminationCalc | null>(null);

  const preview = useMutation({
    mutationFn: () =>
      apiRequest('POST', '/api/hr/terminations/preview', {
        employeeId,
        terminationDate: form.terminationDate,
        terminationType: form.terminationType,
        pendingSalary: form.pendingSalary || undefined,
        otherBenefits: form.otherBenefits || undefined,
        deductionsAmount: form.deductionsAmount || undefined,
      }),
    onSuccess: (d: any) => setCalc(d),
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const save = useMutation({
    mutationFn: () =>
      apiRequest('POST', '/api/hr/terminations', {
        employeeId,
        terminationDate: form.terminationDate,
        terminationType: form.terminationType,
        reason: form.reason || undefined,
        pendingSalary: form.pendingSalary || undefined,
        otherBenefits: form.otherBenefits || undefined,
        deductionsAmount: form.deductionsAmount || undefined,
      }),
    onSuccess: () => {
      toast({ title: 'Cálculo guardado', description: 'Se creó el borrador de desvinculación.' });
      qc.invalidateQueries({ queryKey: ['/api/hr/employees'] });
      onClose();
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Calcular prestaciones — {employeeName}</DialogTitle>
          <DialogDescription>
            Prestaciones laborales según Código de Trabajo DR (arts. 76, 80, 177, 219).
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <Label>Ingreso (referencia)</Label>
            <Input value={hireDate} disabled />
          </div>
          <div>
            <Label>Sueldo mensual</Label>
            <Input value={money(String(monthlySalary))} disabled />
          </div>
          <div>
            <Label>Fecha de salida</Label>
            <Input type="date" value={form.terminationDate} onChange={(e) => setForm({ ...form, terminationDate: e.target.value })} />
          </div>
          <div>
            <Label>Tipo</Label>
            <Select value={form.terminationType} onValueChange={(v) => setForm({ ...form, terminationType: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="employer_dismissal_no_cause">Desahucio empleador (sin causa)</SelectItem>
                <SelectItem value="employer_dismissal_with_cause">Despido con causa (art. 88)</SelectItem>
                <SelectItem value="employee_resignation">Renuncia trabajador</SelectItem>
                <SelectItem value="employee_resignation_justified">Dimisión justificada</SelectItem>
                <SelectItem value="mutual_agreement">Mutuo acuerdo</SelectItem>
                <SelectItem value="end_of_contract">Fin de contrato</SelectItem>
                <SelectItem value="death">Fallecimiento</SelectItem>
                <SelectItem value="retirement">Jubilación</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Sueldo pendiente</Label>
            <Input type="number" min={0} step="0.01" value={form.pendingSalary} onChange={(e) => setForm({ ...form, pendingSalary: Number(e.target.value) })} />
          </div>
          <div>
            <Label>Otros beneficios</Label>
            <Input type="number" min={0} step="0.01" value={form.otherBenefits} onChange={(e) => setForm({ ...form, otherBenefits: Number(e.target.value) })} />
          </div>
          <div>
            <Label>Deducciones</Label>
            <Input type="number" min={0} step="0.01" value={form.deductionsAmount} onChange={(e) => setForm({ ...form, deductionsAmount: Number(e.target.value) })} />
          </div>
          <div className="col-span-2">
            <Label>Motivo / observaciones</Label>
            <Textarea rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </div>
        </div>
        <div>
          <Button variant="outline" onClick={() => preview.mutate()} disabled={preview.isPending}>
            <Calculator className="h-4 w-4 mr-1" /> Calcular
          </Button>
        </div>
        {calc && (
          <div className="mt-4 border rounded-md p-3 space-y-2 text-sm bg-muted/30">
            <div className="text-xs text-muted-foreground">
              Antigüedad: {calc.yearsOfService} años, {calc.monthsExtra} meses ·
              Salario diario: {money(String(calc.dailyWage))}
            </div>
            <BreakdownLine label={`Preaviso (${calc.noticeDays} días)`} value={calc.noticeAmount} />
            <BreakdownLine label={`Cesantía (${calc.severanceDays} días)`} value={calc.severanceAmount} />
            <BreakdownLine label={`Vacaciones proporcionales (${calc.proportionalVacationDays} días)`} value={calc.proportionalVacationAmount} />
            <BreakdownLine label="Regalía pascual proporcional" value={calc.proportionalChristmasBonus} />
            <BreakdownLine label="Sueldo pendiente" value={calc.pendingSalary} />
            <BreakdownLine label="Otros beneficios" value={calc.otherBenefits} />
            <div className="border-t pt-2 flex justify-between font-semibold">
              <span>Bruto</span>
              <span className="font-mono">{money(String(calc.grossTotal))}</span>
            </div>
            <BreakdownLine label="Deducciones" value={-calc.deductionsAmount} />
            <div className="border-t pt-2 flex justify-between text-lg font-bold">
              <span>Neto a pagar</span>
              <span className="font-mono">{money(String(calc.netTotal))}</span>
            </div>
          </div>
        )}
        <DialogFooter className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
          {calc && (
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              <CheckCircle2 className="h-4 w-4 mr-1" /> Guardar como borrador
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BreakdownLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{money(String(value))}</span>
    </div>
  );
}
