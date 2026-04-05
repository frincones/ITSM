'use client';

import { useState } from 'react';

import { Mail, ArrowRight } from 'lucide-react';

import { Button } from '@kit/ui/button';

interface PortalEmailGateProps {
  orgName: string;
  onIdentified: (email: string, name: string) => void;
}

export function PortalEmailGate({ orgName, onIdentified }: PortalEmailGateProps) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedName = name.trim();

    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Por favor ingresa un email valido');
      return;
    }

    if (!trimmedName || trimmedName.length < 2) {
      setError('Por favor ingresa tu nombre');
      return;
    }

    onIdentified(trimmedEmail, trimmedName);
  };

  return (
    <div className="mx-auto max-w-sm space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/30">
          <Mail className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
        </div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Identificate para continuar
        </h3>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Para crear tickets y dar seguimiento, necesitamos tu email de {orgName}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <input
            type="text"
            placeholder="Tu nombre"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-gray-700 dark:bg-gray-800 dark:placeholder:text-gray-500"
          />
        </div>
        <div>
          <input
            type="email"
            placeholder="tu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-gray-700 dark:bg-gray-800 dark:placeholder:text-gray-500"
          />
        </div>

        {error && (
          <p className="text-xs text-red-500">{error}</p>
        )}

        <Button type="submit" className="w-full gap-2" size="sm">
          Continuar
          <ArrowRight className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
