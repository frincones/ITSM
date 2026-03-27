'use client';

import { useRouter } from 'next/navigation';

import { BookOpen, FileText, Key, Monitor } from 'lucide-react';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface QuickCategoriesProps {
  onSetInput: (text: string) => void;
}

/* -------------------------------------------------------------------------- */
/*  Data                                                                       */
/* -------------------------------------------------------------------------- */

const categories = [
  {
    icon: Monitor,
    label: 'Problema tecnico',
    prompt: 'Tengo un problema tecnico con...',
    color: 'text-red-500',
    bg: 'bg-red-50 dark:bg-red-950/30',
  },
  {
    icon: Key,
    label: 'Accesos y permisos',
    prompt: 'Necesito acceso a...',
    color: 'text-amber-500',
    bg: 'bg-amber-50 dark:bg-amber-950/30',
  },
  {
    icon: FileText,
    label: 'Solicitud general',
    prompt: 'Quiero solicitar...',
    color: 'text-blue-500',
    bg: 'bg-blue-50 dark:bg-blue-950/30',
  },
  {
    icon: BookOpen,
    label: 'Base de conocimiento',
    prompt: '__navigate__/portal/kb',
    color: 'text-emerald-500',
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
  },
] as const;

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export function QuickCategories({ onSetInput }: QuickCategoriesProps) {
  const router = useRouter();

  const handleClick = (prompt: string) => {
    if (prompt.startsWith('__navigate__')) {
      router.push(prompt.replace('__navigate__', ''));
    } else {
      onSetInput(prompt);
    }
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      {categories.map((cat, i) => (
        <button
          key={cat.label}
          onClick={() => handleClick(cat.prompt)}
          className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 p-4 transition-all hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:border-gray-600 dark:hover:bg-gray-800/50"
          style={{
            animation: `fadeInUp 0.4s ease-out ${i * 0.08}s both`,
          }}
        >
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-lg ${cat.bg}`}
          >
            <cat.icon className={`h-5 w-5 ${cat.color}`} />
          </div>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {cat.label}
          </span>
        </button>
      ))}

      {/* Keyframe animation */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}} />
    </div>
  );
}
