'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';

import { getSupabaseBrowserClient } from '@kit/supabase/browser-client';
import { Button } from '@kit/ui/button';
import { Input } from '@kit/ui/input';

interface SetPasswordFormProps {
  userEmail: string;
}

export function SetPasswordForm({ userEmail }: SetPasswordFormProps) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres');
      return;
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    setLoading(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password,
        data: {
          password_temporary: false,
          password_changed_at: new Date().toISOString(),
        },
      });

      if (updateError) {
        setError(updateError.message);
        setLoading(false);
        return;
      }

      setSuccess(true);

      setTimeout(() => {
        router.push('/home');
        router.refresh();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="flex flex-col items-center space-y-4 py-8">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
          <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
        </div>
        <h2 className="text-xl font-semibold">Contraseña actualizada</h2>
        <p className="text-center text-sm text-muted-foreground">
          Tu contraseña ha sido configurada correctamente.<br />
          Redirigiendo al dashboard...
        </p>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col space-y-6">
      <div className="flex flex-col items-center space-y-2 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/30">
          <ShieldCheck className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight">
          Configura tu contraseña
        </h2>
        <p className="text-sm text-muted-foreground">
          Bienvenido a NovaDesk ITSM. Para continuar, establece una contraseña permanente para tu cuenta.
        </p>
      </div>

      <div className="rounded-lg border bg-muted/30 px-4 py-3">
        <p className="text-xs font-medium text-muted-foreground">Correo</p>
        <p className="text-sm font-medium">{userEmail}</p>
      </div>

      <form onSubmit={handleSubmit} className="flex w-full flex-col space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="password">
            Nueva contraseña
          </label>
          <Input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mínimo 8 caracteres"
            disabled={loading}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="confirm-password">
            Confirmar contraseña
          </label>
          <Input
            id="confirm-password"
            type="password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Repite tu contraseña"
            disabled={loading}
          />
        </div>

        {error && (
          <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Configurando...
            </>
          ) : (
            'Configurar Contraseña'
          )}
        </Button>
      </form>
    </div>
  );
}
