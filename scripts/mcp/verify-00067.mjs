// ---------------------------------------------------------------------------
// Verificación de la migración 00067
// ---------------------------------------------------------------------------
//   node scripts/mcp/verify-00067.mjs
//
// Compara el estado de producción contra la línea base capturada ANTES de
// aplicar la migración. Solo lee: ni un INSERT, ni un UPDATE.
//
// Existe porque "verificar" leyendo números a ojo en un dashboard es cómo se
// pasan por alto las diferencias de una unidad. Lo que importa aquí es que la
// facturación del ciclo vigente siga dando EXACTAMENTE lo mismo: cualquier
// desviación significa que el módulo de proyectos tocó algo que cobra dinero.
//
// Sale con código 1 si algo cambió, para poder encadenarlo.
// ---------------------------------------------------------------------------

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_BASE || !KEY) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.');
  console.error('  set -a; . apps/web/.env.local; set +a');
  process.exit(2);
}

const H = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
};

/** Estado medido en producción el 15-oct-2026, antes de aplicar 00067. */
const BASELINE = {
  tickets_total: 714,
  por_tipo: {
    support: 298,
    warranty: 323,
    request: 34,
    desarrollo_pendiente: 2,
    incident: 43,
    backlog: 14,
  },
  sla_applies_true: 15,
  projects: 3,
  project_tasks: 6,
  organizations: 4,
  organization_users: 5,
  organization_support_contracts: 1,
  ciclo: {
    cycle_label: '22-Sep-2026 → 21-Oct-2026',
    quota: 30,
    consumed: 15,
    remaining: 15,
    overage: 0,
    pct_used: 50.0,
  },
  cumplimiento: {
    measurable: 15,
    met: 15,
    breached: 0,
    compliance_pct: 100.0,
    credit_tickets: 0,
    credit_cop: 0.0,
  },
};

let fallos = 0;
let avisos = 0;

function ok(label, detalle = '') {
  console.log(`  \x1b[32mOK\x1b[0m    ${label}${detalle ? `  ${detalle}` : ''}`);
}
function fail(label, esperado, obtenido) {
  console.log(`  \x1b[31mFALLA\x1b[0m ${label}`);
  console.log(`          esperado: ${esperado}`);
  console.log(`          obtenido: ${obtenido}`);
  fallos += 1;
}
function warn(label, detalle) {
  console.log(`  \x1b[33mAVISO\x1b[0m ${label}  ${detalle}`);
  avisos += 1;
}
function cmp(label, esperado, obtenido) {
  if (esperado === obtenido) ok(label, String(obtenido));
  else fail(label, esperado, obtenido);
}

async function get(path) {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, { headers: H });
  if (!res.ok) return { error: `HTTP ${res.status}`, body: await res.text() };
  return { data: await res.json() };
}

async function rpc(fn, body) {
  const res = await fetch(`${URL_BASE}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify(body),
  });
  if (!res.ok) return { error: `HTTP ${res.status}`, body: await res.text() };
  const json = await res.json();
  return { data: Array.isArray(json) ? json[0] : json };
}

async function main() {
  console.log('\n\x1b[1m1. La migración se aplicó\x1b[0m');

  const scale = await get('effort_conversion?select=size,points&effective_to=is.null');
  if (scale.error) {
    fail('effort_conversion existe', 'la tabla', scale.error);
    console.log('\n  La migración 00067 no está aplicada. Nada más que verificar.\n');
    process.exit(1);
  }
  const puntos = Object.fromEntries(scale.data.map((r) => [r.size, r.points]));
  cmp('escala S', 1, puntos.S);
  cmp('escala M', 3, puntos.M);
  cmp('escala L', 8, puntos.L);
  cmp('escala XL', 13, puntos.XL);

  console.log('\n\x1b[1m2. Las columnas nuevas nacieron vacías\x1b[0m');

  const nuevas = await get(
    'tickets?select=project_id,effort_size,effort_points&deleted_at=is.null',
  );
  if (nuevas.error) {
    fail('columnas nuevas legibles', 'datos', nuevas.error);
  } else {
    const filas = nuevas.data;
    cmp('tickets totales', BASELINE.tickets_total, filas.length);
    cmp('con project_id', 0, filas.filter((t) => t.project_id !== null).length);
    cmp('con effort_size', 0, filas.filter((t) => t.effort_size !== null).length);
    cmp('con effort_points', 0, filas.filter((t) => t.effort_points !== null).length);
  }

  console.log('\n\x1b[1m3. FACTURACIÓN — la comprobación que importa\x1b[0m');

  const contratos = await get('organization_support_contracts?select=id&limit=1');
  if (contratos.error || !contratos.data.length) {
    warn('no hay contrato que medir', 'sin contrato no se puede comparar la facturación');
  } else {
    const cid = contratos.data[0].id;

    const uso = await rpc('support_cycle_usage', { p_contract_id: cid });
    if (uso.error) {
      fail('support_cycle_usage responde', 'una fila', uso.error);
    } else {
      for (const [k, v] of Object.entries(BASELINE.ciclo)) {
        cmp(`ciclo.${k}`, v, uso.data[k]);
      }
    }

    const cum = await rpc('support_cycle_compliance', { p_contract_id: cid });
    if (cum.error) {
      fail('support_cycle_compliance responde', 'una fila', cum.error);
    } else {
      for (const [k, v] of Object.entries(BASELINE.cumplimiento)) {
        cmp(`cumplimiento.${k}`, v, Number(cum.data[k]));
      }
    }
  }

  console.log('\n\x1b[1m4. Los datos existentes siguen ahí\x1b[0m');

  const tipos = await get('tickets?select=type,sla_applies&deleted_at=is.null');
  if (tipos.error) {
    fail('tickets legibles', 'datos', tipos.error);
  } else {
    const cuenta = {};
    for (const t of tipos.data) cuenta[t.type] = (cuenta[t.type] ?? 0) + 1;
    for (const [tipo, n] of Object.entries(BASELINE.por_tipo)) {
      cmp(`tickets ${tipo}`, n, cuenta[tipo] ?? 0);
    }
    // La regla contractual: warranty nunca cuenta para cumplimiento.
    cmp(
      'sla_applies=true (solo support del contrato)',
      BASELINE.sla_applies_true,
      tipos.data.filter((t) => t.sla_applies).length,
    );
  }

  for (const tabla of ['projects', 'project_tasks', 'organizations', 'organization_users']) {
    const r = await get(`${tabla}?select=id`);
    if (r.error) fail(`${tabla} legible`, 'datos', r.error);
    else cmp(tabla, BASELINE[tabla], r.data.length);
  }

  console.log('\n\x1b[1m5. RLS: la clave pública sigue sin ver nada\x1b[0m');

  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anon) {
    warn('sin NEXT_PUBLIC_SUPABASE_ANON_KEY', 'no se pudo probar el acceso anónimo');
  } else {
    for (const tabla of ['projects', 'tickets', 'effort_conversion']) {
      const res = await fetch(`${URL_BASE}/rest/v1/${tabla}?select=id&limit=1`, {
        headers: { apikey: anon, Authorization: `Bearer ${anon}` },
      });
      const body = await res.json().catch(() => null);
      const bloqueado = !res.ok || (Array.isArray(body) && body.length === 0);
      if (bloqueado) ok(`${tabla} no legible con anon`);
      else fail(`${tabla} no legible con anon`, '0 filas o error', `${body?.length} filas`);
    }
  }

  console.log(
    `\n\x1b[1mResumen\x1b[0m  ${fallos === 0 ? '\x1b[32mtodo igual\x1b[0m' : `\x1b[31m${fallos} diferencia(s)\x1b[0m`}` +
      `${avisos ? ` · ${avisos} aviso(s)` : ''}\n`,
  );

  if (fallos) {
    console.log('Una diferencia en la sección 3 significa que algo tocó la facturación.');
    console.log('El rollback está al pie de la migración y en APLICAR-00067.md.\n');
  }

  process.exit(fallos ? 1 : 0);
}

main().catch((err) => {
  console.error('verificación fallida:', err);
  process.exit(2);
});
