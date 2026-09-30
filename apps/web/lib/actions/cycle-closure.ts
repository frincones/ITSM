'use server';

import { revalidatePath } from 'next/cache';

import { getSupabaseServerClient } from '@kit/supabase/server-client';

/**
 * Closing a billing cycle.
 *
 * This is the moment a cycle's numbers stop being negotiable: the quota count,
 * the compliance percentage and any service credit get frozen into
 * support_cycle_closures, and from then on the report reads the snapshot
 * instead of recomputing. A reclassification landing afterwards becomes a quota
 * credit on the current cycle rather than editing an invoiced one (contract
 * cl. 2).
 *
 * Restricted to admins, and the SQL function refuses an unfinished cycle or a
 * second close without an explicit force. Neither guard is about trust — they
 * are about not freezing an incomplete count by accident.
 */

export interface CloseCycleResult {
  data: {
    cycle_label: string;
    consumed: number;
    quota: number;
    overage: number;
    compliance_pct: number | null;
    credit_tickets: number;
    credit_cop: number;
  } | null;
  error: string | null;
}

export async function closeCycle(
  contractId: string,
  /** Any date inside the cycle to close. Defaults to the one containing today. */
  at?: string,
  options?: { force?: boolean; notes?: string },
): Promise<CloseCycleResult> {
  try {
    const client = getSupabaseServerClient();

    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) return { data: null, error: 'Unauthorized' };

    const { data: agent } = await client
      .from('agents')
      .select('role, is_active')
      .eq('user_id', user.id)
      .maybeSingle();

    const row = agent as { role: string; is_active: boolean } | null;
    if (!row?.is_active || row.role !== 'admin') {
      return {
        data: null,
        error: 'Solo un administrador puede cerrar un ciclo de facturación',
      };
    }

    const { data, error } = await client.rpc('close_support_cycle', {
      p_contract_id: contractId,
      ...(at ? { p_at: at } : {}),
      p_force: options?.force ?? false,
      ...(options?.notes ? { p_notes: options.notes } : {}),
    });

    if (error) {
      // The function raises with a readable message for the two refusals
      // (unfinished cycle, already closed) — pass it through rather than
      // flattening it into a generic failure.
      return { data: null, error: error.message };
    }

    const closure = data as unknown as {
      cycle_start: string;
      cycle_end: string;
      quota: number;
      consumed: number;
      overage: number;
      compliance_pct: number | null;
      credit_tickets: number;
      credit_cop: number;
    } | null;

    if (!closure) {
      return { data: null, error: 'El cierre no devolvió datos' };
    }

    revalidatePath('/home/reports/ciclo');

    return {
      data: {
        cycle_label: `${closure.cycle_start} → ${closure.cycle_end}`,
        consumed: closure.consumed,
        quota: closure.quota,
        overage: closure.overage,
        compliance_pct: closure.compliance_pct,
        credit_tickets: closure.credit_tickets,
        credit_cop: closure.credit_cop,
      },
      error: null,
    };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
