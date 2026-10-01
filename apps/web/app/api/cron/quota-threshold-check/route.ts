import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { notifyEmail, notifyInApp } from '~/lib/services/notify.service';

/**
 * Cron Job — Quota threshold notice
 *
 * Contract cl. 6, verbatim: "TDX avisará al alcanzar el 80% del cupo mensual."
 * For Podenza's Professional plan that is 24 of 30 tickets. It is an explicit
 * obligation with no instrumentation until now, and one the client can check
 * against their own ticket count at any moment.
 *
 * A second notice fires at 100%, where overage billing starts. Not required by
 * the contract, but finding out about overage on the invoice is how billing
 * disputes begin.
 *
 * ── Who gets told, and why not the client directly ─────────────────────────
 *
 * The obligation is to notify the CLIENT, but this sends to TDX by default and
 * asks a human to pass it on. Auto-emailing a client a number that drives
 * billing, with copy nobody reviewed, is not something to switch on silently.
 *
 * Setting `notify_client = true` on the contract turns on the direct notice to
 * the organization's portal users. Flip it once the wording has been agreed —
 * at which point the obligation is met with no human in the loop.
 *
 * ── Why not triggerNotification() ──────────────────────────────────────────
 *
 * Because it does not work. notification.service.ts reads `tpl.recipient_type`
 * off notification_templates, and that column does not exist on that table — it
 * is on notification_queue (migration 00012). resolveRecipients() therefore
 * switches on undefined, matches no case, returns an empty list, and every call
 * queues nothing while reporting success. This uses notifyEmail/notifyInApp
 * instead, the path the testing-strike cron actually delivers through today.
 *
 * ── Idempotency ────────────────────────────────────────────────────────────
 * Each (contract, cycle, threshold) is announced once, tracked in
 * contracts.quota_notices. Because usage counts by CURRENT ticket type
 * (migration 00055), a reclassification can push usage back below a threshold —
 * the marker is then cleared so crossing it again genuinely re-notifies.
 */

const THRESHOLDS = [
  { key: '80', fraction: 0.8 },
  { key: '100', fraction: 1.0 },
] as const;

interface ContractRow {
  id: string;
  tenant_id: string;
  organization_id: string;
  plan_name: string;
  monthly_ticket_quota: number;
  ticket_unit_price_cop: number;
  notify_client: boolean;
  quota_notices: Record<string, string> | null;
}

interface UsageRow {
  cycle_start: string;
  cycle_end: string;
  cycle_label: string;
  quota: number;
  consumed: number;
  remaining: number;
  overage: number;
  pct_used: number;
  overage_cop: number;
}

const cop = (n: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(n);

function buildMessage(
  threshold: string,
  orgName: string,
  usage: UsageRow,
  unitPrice: number,
) {
  const atCap = threshold === '100';

  const subject = atCap
    ? `${orgName}: cupo mensual agotado (${usage.consumed}/${usage.quota})`
    : `${orgName}: 80% del cupo mensual consumido (${usage.consumed}/${usage.quota})`;

  const body = atCap
    ? `El ciclo ${usage.cycle_label} alcanzó el cupo contratado de ${usage.quota} tickets.\n\n` +
      `Consumidos: ${usage.consumed}\n` +
      `Excedentes: ${usage.overage} × ${cop(unitPrice)} = ${cop(usage.overage_cop)} + IVA\n\n` +
      `Los tickets adicionales se facturan a la tarifa del plan (contrato cl. 6), con detalle en el reporte mensual.`
    : `El ciclo ${usage.cycle_label} llegó al ${usage.pct_used}% del cupo contratado.\n\n` +
      `Consumidos: ${usage.consumed} de ${usage.quota}\n` +
      `Restantes: ${usage.remaining}\n\n` +
      `El contrato (cl. 6) obliga a avisar al cliente al alcanzar el 80%. ` +
      `Los tickets que superen el cupo se facturan a ${cop(unitPrice)} + IVA cada uno.`;

  return { subject, body };
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const today = new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/Bogota',
  });

  const { data: contracts, error } = await svc
    .from('organization_support_contracts')
    .select(
      'id, tenant_id, organization_id, plan_name, monthly_ticket_quota, ticket_unit_price_cop, notify_client, quota_notices',
    )
    .lte('effective_from', today)
    .or(`effective_to.is.null,effective_to.gte.${today}`);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const notified: Array<Record<string, unknown>> = [];

  for (const row of (contracts ?? []) as unknown as ContractRow[]) {
    const { data: usageRows, error: usageError } = await svc.rpc(
      'support_cycle_usage',
      { p_contract_id: row.id },
    );

    if (usageError) {
      console.error(
        '[quota-threshold] usage failed for contract',
        row.id,
        usageError.message,
      );
      continue;
    }

    const usage = (usageRows as unknown as UsageRow[])?.[0];
    if (!usage) continue;

    const notices = row.quota_notices ?? {};
    const next = { ...notices };
    let changed = false;

    for (const t of THRESHOLDS) {
      // The cycle start is part of the marker, so a new cycle starts clean
      // without anything having to reset it.
      const marker = `${usage.cycle_start}:${t.key}`;
      const crossed = usage.consumed >= usage.quota * t.fraction;

      if (!crossed) {
        // Usage can fall back below a threshold when a ticket is reclassified
        // out of the quota (cl. 2 restitution). Clearing the marker means
        // crossing it again notifies for real instead of being swallowed.
        if (notices[t.key] === marker) {
          delete next[t.key];
          changed = true;
        }
        continue;
      }

      if (notices[t.key] === marker) continue;

      const { data: org } = await svc
        .from('organizations')
        .select('name, default_agent_id')
        .eq('id', row.organization_id)
        .maybeSingle();

      const orgRow = org as {
        name: string;
        default_agent_id: string | null;
      } | null;

      const orgName = orgRow?.name ?? 'Cliente';
      const { subject, body } = buildMessage(
        t.key,
        orgName,
        usage,
        row.ticket_unit_price_cop,
      );

      // --- TDX side: the owner plus every admin, so it cannot be missed ---
      const { data: staff } = await svc
        .from('agents')
        .select('id, user_id, email')
        .eq('tenant_id', row.tenant_id)
        .eq('is_active', true)
        .or(
          orgRow?.default_agent_id
            ? `role.eq.admin,id.eq.${orgRow.default_agent_id}`
            : 'role.eq.admin',
        );

      for (const a of (staff ?? []) as Array<{
        user_id: string | null;
        email: string;
      }>) {
        if (a.user_id) {
          await notifyInApp(
            row.tenant_id,
            a.user_id,
            subject,
            body,
            'organization',
            row.organization_id,
          ).catch(() => {});
        }
        await notifyEmail(a.email, subject, `<pre>${body}</pre>`).catch(
          () => {},
        );
      }

      // --- Client side: only when explicitly enabled on the contract ---
      if (row.notify_client) {
        const { data: portalUsers } = await svc
          .from('organization_users')
          .select('user_id, email')
          .eq('organization_id', row.organization_id)
          .eq('is_active', true);

        for (const u of (portalUsers ?? []) as Array<{
          user_id: string | null;
          email: string | null;
        }>) {
          if (u.email) {
            await notifyEmail(u.email, subject, `<pre>${body}</pre>`).catch(
              () => {},
            );
          }
          if (u.user_id) {
            await notifyInApp(
              row.tenant_id,
              u.user_id,
              subject,
              body,
              'organization',
              row.organization_id,
            ).catch(() => {});
          }
        }
      }

      next[t.key] = marker;
      changed = true;
      notified.push({
        organization: orgName,
        threshold: t.key,
        consumed: usage.consumed,
        quota: usage.quota,
        client_notified: row.notify_client,
      });
    }

    if (changed) {
      await svc
        .from('organization_support_contracts')
        .update({ quota_notices: next })
        .eq('id', row.id);
    }
  }

  return NextResponse.json({
    ok: true,
    contracts: contracts?.length ?? 0,
    notified,
  });
}
