'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { getSupabaseBrowserClient } from '@kit/supabase/browser-client';

interface ActivateClientProps {
  email: string;
}

export function ActivateClient({ email }: ActivateClientProps) {
  const [status, setStatus] = useState('Preparando tu activación...');

  useEffect(() => {
    async function run() {
      const supabase = getSupabaseBrowserClient();

      setStatus('Cerrando sesión anterior...');
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch {
        // ignore signout errors — we still want to continue
      }

      // Clear any lingering supabase cookies on the client just in case
      setStatus('Redirigiendo al inicio de sesión...');

      const target = `/auth/sign-in${email ? `?email=${encodeURIComponent(email)}` : ''}`;
      // Full reload so the middleware re-evaluates without the old session
      window.location.replace(target);
    }

    void run();
  }, [email]);

  return (
    <div className="flex flex-col items-center space-y-4 py-8">
      <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
      <p className="text-center text-sm text-muted-foreground">{status}</p>
      {email && (
        <p className="text-center text-xs text-muted-foreground">
          Cuenta a activar: <strong>{email}</strong>
        </p>
      )}
    </div>
  );
}
