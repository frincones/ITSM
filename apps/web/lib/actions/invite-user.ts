'use server';

import { createClient } from '@supabase/supabase-js';
import { getSupabaseServerClient } from '@kit/supabase/server-client';

import { generateTempPassword, sendInviteEmail } from '~/lib/services/invite-email';

interface InviteUserInput {
  email: string;
  name: string;
  organizationId?: string | null;
  organizationName?: string | null;
  role?: 'admin' | 'agent' | 'readonly';
  profileId?: string | null;
}

interface InviteResult {
  ok: boolean;
  error?: string;
  userId?: string;
  tempPassword?: string;
}

/**
 * Admin-only action to invite a user with a temporary password.
 * Creates/updates auth user, sets password_temporary flag, and sends email.
 */
export async function inviteUser(input: InviteUserInput): Promise<InviteResult> {
  const client = getSupabaseServerClient();

  // Verify the caller is an admin agent
  const { data: { user: caller } } = await client.auth.getUser();
  if (!caller) return { ok: false, error: 'Unauthorized' };

  const { data: callerAgent } = await client
    .from('agents')
    .select('role, name, tenant_id')
    .eq('user_id', caller.id)
    .maybeSingle();

  if (!callerAgent || !['admin', 'supervisor'].includes(callerAgent.role)) {
    return { ok: false, error: 'Forbidden: admin role required' };
  }

  // Use service role to manage auth users
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const tempPassword = generateTempPassword();

  try {
    // Check if user exists
    const { data: existingList } = await admin.auth.admin.listUsers();
    const existing = existingList?.users?.find(u => u.email?.toLowerCase() === input.email.toLowerCase());

    let userId: string;

    if (existing) {
      // Update existing user — set temp password + flag
      const { error } = await admin.auth.admin.updateUserById(existing.id, {
        password: tempPassword,
        user_metadata: {
          ...existing.user_metadata,
          password_temporary: true,
          invited_at: new Date().toISOString(),
          invited_by: callerAgent.name,
          name: input.name,
        },
        email_confirm: true,
      });

      if (error) return { ok: false, error: `Update failed: ${error.message}` };
      userId = existing.id;
    } else {
      // Create new user
      const { data, error } = await admin.auth.admin.createUser({
        email: input.email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          name: input.name,
          password_temporary: true,
          invited_at: new Date().toISOString(),
          invited_by: callerAgent.name,
        },
      });

      if (error || !data.user) return { ok: false, error: `Create failed: ${error?.message}` };
      userId = data.user.id;
    }

    // Send email with temporary credentials
    const emailResult = await sendInviteEmail({
      name: input.name,
      email: input.email,
      tempPassword,
      organizationName: input.organizationName ?? undefined,
      invitedByName: callerAgent.name,
    });

    if (!emailResult.ok) {
      // User was created/updated but email failed — return temp password so admin can share manually
      return {
        ok: true,
        userId,
        tempPassword,
        error: `User created but email failed: ${emailResult.error}`,
      };
    }

    return { ok: true, userId, tempPassword };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
