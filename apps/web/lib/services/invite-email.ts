/**
 * invite-email.ts — Send welcome email with temporary credentials via Resend
 */

import crypto from 'crypto';

const RESEND_FROM = 'NovaDesk ITSM <auth@itsm.tdxcore.com>';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://itsm-web.vercel.app';

/**
 * Generate a secure temporary password: Nd-{YYMM}-{8 chars}
 * Example: Nd-2604-Xk9m2Lp7
 */
export function generateTempPassword(): string {
  const now = new Date();
  const yymm = `${now.getFullYear().toString().slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const randomBytes = crypto.randomBytes(8);
  let random = '';
  for (let i = 0; i < 8; i++) {
    random += chars[randomBytes[i]! % chars.length];
  }
  return `Nd-${yymm}-${random}`;
}

interface SendInviteParams {
  name: string;
  email: string;
  tempPassword: string;
  organizationName?: string;
  invitedByName?: string;
}

/**
 * Send welcome email with temporary credentials
 */
export async function sendInviteEmail(params: SendInviteParams): Promise<{ ok: boolean; error?: string }> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return { ok: false, error: 'RESEND_API_KEY not configured' };
  }

  const html = buildInviteEmailHtml(params);

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: [params.email],
        subject: `Bienvenido a NovaDesk ITSM — Activa tu cuenta`,
        html,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return { ok: false, error: `Resend error ${response.status}: ${err}` };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown' };
  }
}

function buildInviteEmailHtml(params: SendInviteParams): string {
  const { name, email, tempPassword, organizationName, invitedByName } = params;
  const signInUrl = `${SITE_URL}/auth/activate?email=${encodeURIComponent(email)}`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body style="margin:0;padding:0;background-color:#f0f2f5;font-family:Segoe UI,Roboto,Helvetica Neue,Arial,sans-serif;-webkit-font-smoothing:antialiased">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f0f2f5">
  <tr><td align="center" style="padding:40px 16px">
    <table role="presentation" width="540" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06)">
      <!-- Header -->
      <tr><td align="center" style="background-color:#6366f1;padding:44px 32px">
        <h1 style="margin:0;font-size:30px;font-weight:800;color:#ffffff;letter-spacing:-0.5px">NovaDesk</h1>
        <p style="margin:6px 0 0;font-size:12px;font-weight:500;color:rgba(255,255,255,0.8);letter-spacing:2px;text-transform:uppercase">IT Service Management</p>
      </td></tr>

      <!-- Welcome -->
      <tr><td style="padding:40px 36px 16px">
        <h2 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#0f172a;letter-spacing:-0.3px">Bienvenido${name ? ', ' + name : ''}</h2>
        <p style="margin:0 0 12px;font-size:15px;line-height:1.7;color:#475569">
          ${invitedByName ? invitedByName + ' te ha invitado' : 'Has sido invitado'} a unirte a <strong style="color:#0f172a">NovaDesk ITSM</strong>${organizationName ? ' como usuario de <strong style="color:#0f172a">' + organizationName + '</strong>' : ''}.
        </p>
        <p style="margin:0;font-size:15px;line-height:1.7;color:#475569">
          Hemos creado tu cuenta con una contraseña temporal. Al iniciar sesión por primera vez se te pedirá establecer una contraseña permanente.
        </p>
      </td></tr>

      <!-- Credentials Card -->
      <tr><td style="padding:20px 36px 24px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc;border-radius:12px;border:1px solid #e2e8f0">
          <tr><td style="padding:24px">
            <p style="margin:0 0 6px;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:1px">Tu correo</p>
            <p style="margin:0 0 20px;font-size:15px;font-weight:600;color:#0f172a;font-family:Consolas,Monaco,monospace">${email}</p>

            <p style="margin:0 0 6px;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:1px">Contraseña temporal</p>
            <div style="background-color:#ffffff;border:1px solid #cbd5e1;border-radius:8px;padding:12px 16px;font-family:Consolas,Monaco,monospace;font-size:16px;font-weight:700;color:#6366f1;letter-spacing:0.5px;word-break:break-all">${tempPassword}</div>
          </td></tr>
        </table>
      </td></tr>

      <!-- CTA Button -->
      <tr><td align="center" style="padding:0 36px 32px">
        <a href="${signInUrl}" style="display:inline-block;padding:16px 48px;background-color:#6366f1;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;border-radius:10px;letter-spacing:0.3px">Activar mi Cuenta</a>
      </td></tr>

      <!-- Security note -->
      <tr><td style="padding:0 36px 32px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#fef3c7;border-radius:10px;border:1px solid #fde68a">
          <tr><td style="padding:16px 20px">
            <p style="margin:0;font-size:13px;line-height:1.5;color:#78350f">
              <strong>🔒 Importante:</strong> Por tu seguridad, te pediremos cambiar esta contraseña temporal al iniciar sesión por primera vez.
            </p>
          </td></tr>
        </table>
      </td></tr>

      <!-- Fallback -->
      <tr><td style="padding:0 36px 32px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #e2e8f0">
          <tr><td style="padding-top:20px">
            <p style="margin:0 0 6px;font-size:12px;line-height:1.5;color:#94a3b8">Si el botón no funciona, copia este enlace en tu navegador:</p>
            <p style="margin:0;font-size:11px;line-height:1.4;color:#6366f1;word-break:break-all">${signInUrl}</p>
          </td></tr>
        </table>
      </td></tr>
    </table>

    <!-- Footer -->
    <table role="presentation" width="540" cellpadding="0" cellspacing="0" border="0">
      <tr><td align="center" style="padding:24px 32px">
        <p style="margin:0;font-size:12px;color:#94a3b8;font-weight:500">NovaDesk ITSM by TDX Core</p>
        <p style="margin:4px 0 0;font-size:11px;color:#cbd5e1">itsm.tdxcore.com</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}
