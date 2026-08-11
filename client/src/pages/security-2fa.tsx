import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { ShieldCheck, ShieldAlert, Copy, Loader2, KeyRound, Smartphone } from 'lucide-react';

type StatusResp = { enabled: boolean };
type EnrollResp = { otpauthUrl: string; qrDataUrl: string; secret: string };
type VerifyEnrollResp = { enabled: true; backupCodes: string[]; warning: string };

export default function SecurityTwoFactor() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [enrollment, setEnrollment] = useState<EnrollResp | null>(null);
  const [enrollCode, setEnrollCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [disableCode, setDisableCode] = useState('');
  const [showDisable, setShowDisable] = useState(false);

  const statusQ = useQuery<StatusResp>({
    queryKey: ['/api/auth/2fa/status'],
    queryFn: () => apiRequest('GET', '/api/auth/2fa/status') as Promise<StatusResp>,
  });

  const startEnroll = useMutation({
    mutationFn: () => apiRequest('POST', '/api/auth/2fa/enroll') as Promise<EnrollResp>,
    onSuccess: (data) => {
      setEnrollment(data);
      setEnrollCode('');
      setBackupCodes(null);
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const verifyEnroll = useMutation({
    mutationFn: (code: string) =>
      apiRequest('POST', '/api/auth/2fa/enroll/verify', { code }) as Promise<VerifyEnrollResp>,
    onSuccess: (data) => {
      setBackupCodes(data.backupCodes);
      setEnrollment(null);
      setEnrollCode('');
      qc.invalidateQueries({ queryKey: ['/api/auth/2fa/status'] });
      toast({ title: '2FA activado', description: 'Guarda los códigos de respaldo ahora.' });
    },
    onError: (e: Error) =>
      toast({ title: 'Código inválido', description: e.message, variant: 'destructive' }),
  });

  const disable = useMutation({
    mutationFn: (code: string) =>
      apiRequest('POST', '/api/auth/2fa/disable', { code }) as Promise<{ enabled: false }>,
    onSuccess: () => {
      setShowDisable(false);
      setDisableCode('');
      setBackupCodes(null);
      qc.invalidateQueries({ queryKey: ['/api/auth/2fa/status'] });
      toast({ title: '2FA desactivado', description: 'Vuelve a activarlo desde esta pantalla.' });
    },
    onError: (e: Error) =>
      toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: `${label} copiado` });
    } catch {
      toast({ title: 'No se pudo copiar', variant: 'destructive' });
    }
  };

  const enabled = statusQ.data?.enabled ?? false;

  return (
    <div className="mx-auto max-w-2xl p-6 space-y-6">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold">Verificación en dos pasos</h1>
          <p className="text-sm text-muted-foreground">
            Añade un segundo factor para proteger tu cuenta.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Estado</CardTitle>
            {statusQ.isLoading ? (
              <Badge variant="outline">Cargando…</Badge>
            ) : enabled ? (
              <Badge className="bg-green-600 hover:bg-green-600">Activo</Badge>
            ) : (
              <Badge variant="secondary">Desactivado</Badge>
            )}
          </div>
          <CardDescription>
            {enabled
              ? 'Tu cuenta pide un código de 6 dígitos al iniciar sesión.'
              : 'Sólo tu contraseña protege esta cuenta ahora mismo.'}
          </CardDescription>
        </CardHeader>
        {!enabled && !enrollment && !backupCodes && (
          <CardContent>
            <Button onClick={() => startEnroll.mutate()} disabled={startEnroll.isPending}>
              {startEnroll.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Smartphone className="mr-2 h-4 w-4" />
              )}
              Activar 2FA
            </Button>
          </CardContent>
        )}
        {enabled && !showDisable && !backupCodes && (
          <CardContent className="flex gap-3">
            <Button variant="destructive" onClick={() => setShowDisable(true)}>
              Desactivar 2FA
            </Button>
          </CardContent>
        )}
      </Card>

      {enrollment && (
        <Card>
          <CardHeader>
            <CardTitle>Escanea el código QR</CardTitle>
            <CardDescription>
              Usa Google Authenticator, 1Password, Authy o cualquier app compatible con TOTP.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-center">
              <img
                src={enrollment.qrDataUrl}
                alt="QR de enrolamiento 2FA"
                className="border rounded-md bg-white p-2"
                width={220}
                height={220}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="text-xs text-muted-foreground">Clave manual</p>
                <p className="font-mono text-sm">{enrollment.secret}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => copy(enrollment.secret, 'Secreto')}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <Separator />
            <div className="space-y-3">
              <p className="text-sm">
                Después de escanear, ingresa el código de 6 dígitos que muestra la app.
              </p>
              <div className="flex justify-center">
                <InputOTP maxLength={6} value={enrollCode} onChange={setEnrollCode} autoFocus>
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>
              <div className="flex gap-3 justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setEnrollment(null);
                    setEnrollCode('');
                  }}
                  disabled={verifyEnroll.isPending}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={() => verifyEnroll.mutate(enrollCode)}
                  disabled={enrollCode.length !== 6 || verifyEnroll.isPending}
                >
                  {verifyEnroll.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="mr-2 h-4 w-4" />
                  )}
                  Verificar y activar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {backupCodes && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" /> Códigos de respaldo
            </CardTitle>
            <CardDescription>
              Guárdalos ahora. No los volveremos a mostrar. Cada uno sirve una sola vez.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>Importante</AlertTitle>
              <AlertDescription>
                Estos códigos son la única forma de entrar si pierdes el dispositivo con la app.
              </AlertDescription>
            </Alert>
            <div className="grid grid-cols-2 gap-2 font-mono text-sm">
              {backupCodes.map((c) => (
                <div key={c} className="rounded border px-3 py-2 text-center tracking-widest">
                  {c}
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => copy(backupCodes.join('\n'), 'Códigos')}
              >
                <Copy className="mr-2 h-4 w-4" />
                Copiar todos
              </Button>
              <Button onClick={() => setBackupCodes(null)}>Ya los guardé</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {showDisable && (
        <Card>
          <CardHeader>
            <CardTitle>Confirma para desactivar</CardTitle>
            <CardDescription>
              Ingresa el código actual de tu app o un código de respaldo para confirmar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-center">
              <InputOTP
                maxLength={6}
                value={disableCode}
                onChange={setDisableCode}
                autoFocus
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </div>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowDisable(false);
                  setDisableCode('');
                }}
                disabled={disable.isPending}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={() => disable.mutate(disableCode)}
                disabled={
                  disable.isPending ||
                  (disableCode.length !== 6 && disableCode.length !== 10)
                }
              >
                {disable.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Desactivar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
