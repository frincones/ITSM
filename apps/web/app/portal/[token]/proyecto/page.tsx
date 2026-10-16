// ---------------------------------------------------------------------------
// Portal del cliente — su proyecto
// ---------------------------------------------------------------------------
// Lo que el PRD pide para el cliente: ver su backlog, el estado de su ciclo y
// el medidor de consumo.
//
// A diferencia del resto del portal, esta página EXIGE sesión. El chat y la
// base de conocimiento funcionan con el token de la URL porque muestran
// información que el cliente ya tiene; el backlog y el consumo dicen cuánto
// se le factura y qué tiene pendiente, y quien reenviara el enlace estaría
// compartiendo eso sin saberlo.
// ---------------------------------------------------------------------------

import Link from 'next/link';
import { notFound } from 'next/navigation';

import { resolveOrgByPortalToken } from '~/lib/services/portal-token.service';
import {
  getCreditMeter,
  getPhaseCatalog,
  getPortalBacklog,
  getPortalCycles,
  getPortalDelaySummary,
  getPortalRequirements,
  getPortalWaits,
  resolvePortalAccess,
} from '~/lib/services/portal-delivery.service';

import { PortalProjectClient } from './_components/portal-project-client';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const org = await resolveOrgByPortalToken(token);
  return { title: org ? `Mi proyecto | ${org.name}` : 'Mi proyecto' };
}

export default async function PortalProjectPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const org = await resolveOrgByPortalToken(token);
  if (!org) notFound();

  const access = await resolvePortalAccess(org.id);

  // Sin sesión no se muestra nada: ni siquiera cuántos items hay, porque el
  // número ya dice algo sobre el volumen de trabajo del cliente.
  if (!access) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <div className="rounded-xl border bg-white p-8 text-center shadow-sm dark:bg-gray-900">
          <h1 className="text-lg font-semibold">Inicia sesión para ver tu proyecto</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            El backlog y el consumo de tu ciclo son información de tu contrato, así
            que esta sección pide identificarte. El resto del portal sigue
            disponible sin iniciar sesión.
          </p>
          <Link
            href={`/auth/sign-in?next=${encodeURIComponent(`/portal/${token}/proyecto`)}`}
            className="mt-6 inline-flex items-center justify-center rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Iniciar sesión
          </Link>
          <p className="mt-6 text-xs text-gray-500">
            ¿No tienes acceso? Escríbenos desde el chat del portal y te lo damos.
          </p>
        </div>
      </div>
    );
  }

  const [meter, backlog, cycles, requirements, waits, summary, phaseCatalog] =
    await Promise.all([
      getCreditMeter(org.id),
      getPortalBacklog(org.id),
      getPortalCycles(org.id),
      getPortalRequirements(org.id),
      getPortalWaits(org.id),
      getPortalDelaySummary(org.id),
      getPhaseCatalog(),
    ]);

  return (
    <PortalProjectClient
      orgName={org.name}
      orgColors={org.brand_colors as { primary?: string; accent?: string } | null}
      userName={access.name}
      meter={meter}
      items={backlog.items}
      totals={backlog.totals}
      cycles={cycles}
      requirements={requirements}
      waits={waits}
      summary={summary}
      phaseCatalog={phaseCatalog}
    />
  );
}
