import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { TrendingDown, ShieldCheck, Printer, FileText, CheckCircle2 } from 'lucide-react';
import { buildWithdrawalThermalTicket, buildWithdrawalNormalHtml } from '@/lib/thermal-print';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CashWithdrawal {
  id: number;
  concept: string;
  amount: string | number;
  currency: string;
  notes?: string | null;
  createdAt: string | Date;
  cashierName?: string;
  authorizerName?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  storeName?: string;
}

// ─── API helper ───────────────────────────────────────────────────────────────

const apiCall = async (endpoint: string, options: RequestInit = {}) => {
  const token = localStorage.getItem('auth_token');
  const res = await fetch(endpoint, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Error desconocido' }));
    throw new Error(err.error || 'Error en la solicitud');
  }
  return res.json();
};

// ─── Component ────────────────────────────────────────────────────────────────

export function CashWithdrawalDialog({ open, onClose, storeName }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  type Step = 'form' | 'auth' | 'receipt';
  const [step, setStep] = useState<Step>('form');

  // Step 1 — form
  const [concept, setConcept]           = useState('');
  const [amount, setAmount]             = useState('');
  const [currency, setCurrency]         = useState('DOP');
  const [notes, setNotes]               = useState('');

  // Step 2 — auth
  const [authUser, setAuthUser]         = useState('');
  const [authPass, setAuthPass]         = useState('');

  // Step 3 — receipt
  const [savedWithdrawal, setSavedWithdrawal] = useState<CashWithdrawal | null>(null);

  const createMutation = useMutation({
    mutationFn: (body: any) =>
      apiCall('/api/cash-withdrawals', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (data) => {
      setSavedWithdrawal(data.withdrawal);
      setStep('receipt');
      queryClient.invalidateQueries({ queryKey: ['/api/cash-withdrawals'] });
      queryClient.invalidateQueries({ queryKey: ['/api/cash-register/sessions/current-stats'] });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const handleSubmitForm = () => {
    if (!concept.trim()) {
      toast({ title: 'Concepto requerido', description: 'Ingresa el concepto del retiro.', variant: 'destructive' });
      return;
    }
    const parsedAmount = parseFloat(amount);
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      toast({ title: 'Monto inválido', description: 'Ingresa un monto mayor a 0.', variant: 'destructive' });
      return;
    }
    setStep('auth');
  };

  const handleSubmitAuth = () => {
    if (!authUser.trim() || !authPass.trim()) {
      toast({ title: 'Credenciales requeridas', description: 'Ingresa el usuario y contraseña del autorizador.', variant: 'destructive' });
      return;
    }
    createMutation.mutate({
      concept: concept.trim(),
      amount: parseFloat(amount),
      currency,
      notes: notes.trim() || undefined,
      authorizerUsername: authUser,
      authorizerPassword: authPass,
    });
  };

  const handlePrintThermal = () => {
    if (!savedWithdrawal) return;
    const content = buildWithdrawalThermalTicket({ ...savedWithdrawal, storeName });
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<html><head><title>Retiro</title></head><body><pre style="font-family:monospace;white-space:pre">${content}</pre></body></html>`);
    win.document.close();
    win.print();
    win.close();
  };

  const handlePrintHtml = () => {
    if (!savedWithdrawal) return;
    const html = buildWithdrawalNormalHtml({ ...savedWithdrawal, storeName });
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.print();
    win.close();
  };

  const handleClose = () => {
    setStep('form');
    setConcept(''); setAmount(''); setCurrency('DOP'); setNotes('');
    setAuthUser(''); setAuthPass('');
    setSavedWithdrawal(null);
    onClose();
  };

  const fmtMoney = (v: string | number, curr = currency) =>
    new Intl.NumberFormat('es-DO', { style: 'currency', currency: curr === 'USD' ? 'USD' : 'DOP' }).format(parseFloat(String(v)) || 0);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-md">
        {/* ─ Step 1: Data ─ */}
        {step === 'form' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <TrendingDown className="h-5 w-5 text-red-500" />
                Retiro de Efectivo
              </DialogTitle>
              <DialogDescription>
                Registra una salida de efectivo de la caja. Se requiere autorización de administrador.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <Label htmlFor="concept">Concepto <span className="text-red-500">*</span></Label>
                <Textarea
                  id="concept"
                  placeholder="Ej: Pago de servicio eléctrico, Compra de suministros..."
                  value={concept}
                  onChange={(e) => setConcept(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="amount">Monto <span className="text-red-500">*</span></Label>
                  <Input
                    id="amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Moneda</Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DOP">RD$ (DOP)</SelectItem>
                      <SelectItem value="USD">$ (USD)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="notes">Notas adicionales</Label>
                <Input
                  id="notes"
                  placeholder="Opcional..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Cancelar</Button>
              <Button onClick={handleSubmitForm}>Continuar →</Button>
            </DialogFooter>
          </>
        )}

        {/* ─ Step 2: Auth ─ */}
        {step === 'auth' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-amber-500" />
                Autorización Requerida
              </DialogTitle>
              <DialogDescription>
                Un administrador debe autorizar este retiro de{' '}
                <strong>{fmtMoney(amount, currency)}</strong>.
              </DialogDescription>
            </DialogHeader>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              <strong>Concepto:</strong> {concept}
              {notes && <><br /><span className="text-amber-600">{notes}</span></>}
            </div>

            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <Label htmlFor="auth-user">Usuario administrador</Label>
                <Input
                  id="auth-user"
                  placeholder="Nombre de usuario"
                  value={authUser}
                  onChange={(e) => setAuthUser(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="auth-pass">Contraseña</Label>
                <Input
                  id="auth-pass"
                  type="password"
                  placeholder="••••••••"
                  value={authPass}
                  onChange={(e) => setAuthPass(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSubmitAuth(); }}
                  autoComplete="current-password"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('form')}>← Volver</Button>
              <Button
                onClick={handleSubmitAuth}
                disabled={createMutation.isPending}
                className="bg-red-600 hover:bg-red-700"
              >
                {createMutation.isPending ? 'Verificando...' : 'Autorizar y Registrar'}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ─ Step 3: Receipt ─ */}
        {step === 'receipt' && savedWithdrawal && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                Retiro Registrado
              </DialogTitle>
              <DialogDescription>
                El retiro fue registrado exitosamente. Imprime el comprobante como constancia.
              </DialogDescription>
            </DialogHeader>

            <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-green-700 font-medium">No.</span>
                <span className="font-bold">#{String(savedWithdrawal.id).padStart(6, '0')}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-green-700 font-medium">Concepto</span>
                <span className="text-right max-w-[200px]">{savedWithdrawal.concept}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-green-700 font-medium">Monto</span>
                <span className="font-bold text-red-600">{fmtMoney(savedWithdrawal.amount, savedWithdrawal.currency)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-green-700 font-medium">Autorizado por</span>
                <span>{savedWithdrawal.authorizerName}</span>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1 flex items-center gap-2"
                onClick={handlePrintThermal}
              >
                <Printer className="h-4 w-4" />
                Térmico (58mm)
              </Button>
              <Button
                variant="outline"
                className="flex-1 flex items-center gap-2"
                onClick={handlePrintHtml}
              >
                <FileText className="h-4 w-4" />
                Imprimir A4
              </Button>
            </div>

            <DialogFooter>
              <Button onClick={handleClose} className="w-full">Cerrar</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
