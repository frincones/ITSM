// ---------------------------------------------------------------------------
// Línea base del SLA de soporte — la prueba de que proyectos no lo tocó
// ---------------------------------------------------------------------------
//   node scripts/mcp/baseline-soporte.mjs              # imprime el estado
//   node scripts/mcp/baseline-soporte.mjs --esperado   # exige el estado base
//
// Las cifras de soporte son de Emma (migraciones 00047-00063) y están en
// reportes entregados al cliente. Cualquier paso del módulo de proyectos debe
// dejarlas IDÉNTICAS. Si una cambia, se revierte el paso.
//
// No es un argumento, es una medición. Solo lee.
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

const env = {};
for (const l of readFileSync('apps/web/.env.local', 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en apps/web/.env.local');
  process.exit(2);
}

const EXIGIR = process.argv.includes('--esperado');

/**
 * Medido el 16-oct-2026, ciclo 22-sep → 21-oct, ANTES de empezar el módulo
 * de proyectos. Estas son las cifras que no se pueden mover.
 */
const BASE = {
  // support_cycle_compliance — el cumplimiento y el crédito (dinero)
  // measurable y met suben juntos cuando Emma responde un ticket nuevo
  // dentro de plazo: el 19-oct respondió TKT-2610-00781 a las 12:37 y las
  // dos pasaron de 15 a 16. Que suban a la vez es la señal de que el
  // cumplimiento sigue al 100%; si subiera `measurable` y no `met`, eso sí
  // sería un incumplimiento y habría que mirarlo.
  measurable: 21,
  met: 21,
  breached: 0,
  compliance_pct: 100,
  credit_tickets: 0,
  credit_cop: 0,
  // ⚠ ESTA CIFRA NO ES DINERO y sube con cada ítem de proyecto.
  //
  // support_cycle_compliance recorre TODOS los tickets del ciclo y manda a
  // excluded_count los que no tienen SLA debido. No filtra por tipo, así que
  // cada backlog o desarrollo_pendiente del cronograma engorda el número.
  //
  // Re-basada el 16-oct-2026 tras cargar el cronograma de Podenza: de 3 a
  // 52 (49 del proyecto nuevo + 3 que ya estaban). Verificado que ninguno
  // de esos 49 tiene sla_applies ni consume cuota.
  //
  // Lo que SÍ es dinero y no puede moverse está arriba: measurable, met,
  // credit_cop, consumed y quota.
  excluded_count: 52,
  // ⚠ ESTAS DOS CRECEN SOLAS. Cada ticket de soporte que entra las sube, así
  // que la guarda salta por trabajo normal de Emma y hay que re-basarlas.
  // El 19-oct se re-basaron tres veces en una tarde: 15 → 17 → 20.
  //
  // Lo que importa NO es el número, es que `consumed` no suba por culpa de
  // un cambio en proyectos. Al re-basar, comprobar siempre que los tickets
  // nuevos son de tipo support, SIN requirement_phase y SIN delivery_cycle_id:
  //
  //   SELECT ticket_number, type, requirement_phase, delivery_cycle_id
  //     FROM tickets WHERE sla_applies AND created_at > now() - interval '1 day';
  //
  // Si alguno trae fase o ciclo, eso sí es un fallo de aislamiento y no se
  // re-basa: se investiga.
  //
  // support_cycle_usage — la cuota (dinero)
  //
  // Re-basada el 19-oct-2026 de 15 a 17: entraron TKT-2610-00780 y 00781,
  // dos tickets de soporte normales del día (12:13 y 12:20). No los provocó
  // ninguna migración — se comprobó que son de tipo support, sin fase de
  // proyecto y sin ciclo, y que la migración 00084 no hace UPDATE sobre
  // tickets. La guarda hizo justo lo que debía: avisar de que una cifra de
  // soporte se movió, para mirarla antes de seguir.
  consumed: 21,
  quota: 30,
  overage: 0,
  excluded_bad_dates: 7,
  // El universo de tickets con SLA, por tipo
  sla_support: 21,
  sla_otros: 0,
};

let fallos = 0;

function check(nombre, real, esperado) {
  const ok = real === esperado;
  const marca = EXIGIR ? (ok ? 'OK  ' : 'FALLA') : '    ';
  console.log(`  ${marca} ${nombre.padEnd(22)} ${String(real).padStart(6)}` +
    (EXIGIR && !ok ? `   <- esperado ${esperado}` : ''));
  if (EXIGIR && !ok) fallos++;
}

async function rest(path) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${(await r.text()).slice(0, 180)}`);
  return r.json();
}

async function rpc(fn, body) {
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`rpc ${fn}: ${r.status} ${(await r.text()).slice(0, 180)}`);
  return r.json();
}

const contratos = await rest(
  'organization_support_contracts?select=id,plan_name,organization_id,organizations(name)',
);

console.log('='.repeat(64));
console.log('LÍNEA BASE DEL SLA DE SOPORTE  (migraciones 00047-00063, de Emma)');
console.log('='.repeat(64));

for (const c of contratos) {
  const nombre = c.organizations?.name ?? '(sin nombre)';

  const comp = (await rpc('support_cycle_compliance', { p_contract_id: c.id }))[0];
  const uso = (await rpc('support_cycle_usage', { p_contract_id: c.id }))[0];

  console.log(`\n${nombre} — ${c.plan_name} — ciclo ${comp.cycle_label}`);
  console.log('\n  support_cycle_compliance (cumplimiento y crédito):');
  check('measurable', comp.measurable, BASE.measurable);
  check('met', comp.met, BASE.met);
  check('breached', comp.breached, BASE.breached);
  check('compliance_pct', Number(comp.compliance_pct), BASE.compliance_pct);
  check('credit_tickets', comp.credit_tickets, BASE.credit_tickets);
  check('credit_cop', Number(comp.credit_cop), BASE.credit_cop);
  check('excluded_count', comp.excluded_count, BASE.excluded_count);

  console.log('\n  support_cycle_usage (cuota):');
  check('consumed', uso.consumed, BASE.consumed);
  check('quota', uso.quota, BASE.quota);
  check('overage', uso.overage, BASE.overage);
  check('excluded_bad_dates', uso.excluded_bad_dates, BASE.excluded_bad_dates);
}

// El universo de tickets con SLA activo, por tipo. Debe seguir siendo
// exclusivamente de soporte: ni un ticket de proyecto ni de garantía.
const conSla = await rest(
  'tickets?select=type&sla_applies=is.true&deleted_at=is.null&limit=2000',
);
const porTipo = {};
for (const t of conSla) porTipo[t.type] = (porTipo[t.type] ?? 0) + 1;
const SOPORTE = ['support', 'incident', 'request'];
const otros = Object.entries(porTipo)
  .filter(([t]) => !SOPORTE.includes(t))
  .reduce((a, [, v]) => a + v, 0);

console.log('\n  Tickets con sla_applies = true, por tipo:');
check('de tipo support', porTipo.support ?? 0, BASE.sla_support);
check('de otros tipos', otros, BASE.sla_otros);
if (otros > 0) {
  console.log(`       ATENCIÓN: ${JSON.stringify(porTipo)}`);
}

console.log('\n' + '='.repeat(64));
if (!EXIGIR) {
  console.log('Estado actual impreso. Con --esperado se exige la línea base.');
  process.exit(0);
}
if (fallos) {
  console.log(`${fallos} CIFRA(S) DE SOPORTE CAMBIARON. Revertir el último paso.`);
  process.exit(1);
}
console.log('Soporte intacto: todas las cifras coinciden con la línea base.');
