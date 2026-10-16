// ---------------------------------------------------------------------------
// Arrancar el ciclo 1 de Podenza
// ---------------------------------------------------------------------------
//   node scripts/arrancar-ciclo1.mjs            # ENSAYO, revierte al final
//   node scripts/arrancar-ciclo1.mjs --aplicar  # aplica de verdad
//
// Dos cosas que faltaban para que el módulo empiece a medir:
//
//   1. FASE INICIAL. Los 8 entregables no tienen fase, así que el SLA no
//      mide nada y el tablero sale vacío. Todos arrancan en `levantamiento`:
//      es la primera etapa del proceso —se agenda y se tiene la reunión con
//      el cliente— y es donde está el trabajo hoy, con sus tickets todavía
//      en backlog.
//
//      Al asignarla, el trigger de 00077 abre el primer tramo y el reloj
//      empieza a correr a cargo del cliente.
//
//   2. CAPACIDAD. Emma con 4 horas diarias repartidas entre soporte y
//      desarrollo. La tabla ya modela esa distinción: `hours_per_day` son
//      las horas dedicadas a ESTE ciclo y `overhead_hours` las que no son
//      desarrollo. Sin esto, la pestaña de Capacidad sale vacía.
//
// No se inventa capacidad para los demás: solo el equipo sabe su
// disponibilidad real, y un medidor con horas supuestas es peor que uno
// vacío.
// ---------------------------------------------------------------------------

import pg from 'pg';
import { readFileSync } from 'node:fs';

const APLICAR = process.argv.includes('--aplicar');

function conexion() {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;
  try {
    for (const l of readFileSync('../../.claude/SUPABASE-CREDENTIALS.md', 'utf8').split('\n')) {
      const m = l.match(/postgresql:\/\/[^\s`|]+/);
      if (m) return m[0];
    }
  } catch {
    /* sin archivo */
  }
  return null;
}

const CS = conexion();
if (!CS) {
  console.error('Falta SUPABASE_DB_URL o .claude/SUPABASE-CREDENTIALS.md');
  process.exit(2);
}

const CICLO = 'a8d29f74-826b-4e11-9152-2af7cd9de800';

/**
 * Emma reparte su jornada entre soporte y desarrollo.
 *
 * ⚠ OJO CON LAS UNIDADES, porque no son las mismas:
 *   · hours_per_day  es POR DÍA
 *   · overhead_hours es DEL CICLO ENTERO (agent_capacity_status lo resta
 *     una sola vez de las horas brutas, no cada día)
 *
 * Así que "2 horas diarias de soporte" son 2 × 21 días hábiles = 42 horas
 * de overhead en el ciclo. Ponerle 2 diría que dedica 2 horas a soporte en
 * todo el mes, y el medidor daría 82h disponibles en vez de 42.
 */
const DIAS_HABILES_CICLO = 21;

const CAPACIDAD = [
  { email: 'emma.castillo@tdxcore.com',
    horas: 4,
    overhead: 2 * DIAS_HABILES_CICLO,
    nota: 'Reparte su jornada entre soporte y desarrollo: 4h diarias al ciclo, de las que 2h/día (42h en el ciclo) son soporte y levantamiento.' },
];

const c = new pg.Client({ connectionString: CS, ssl: { rejectUnauthorized: false } });
await c.connect();

let fallos = 0;
const ok = (l, cond, extra = '') => {
  console.log(`  ${cond ? '\x1b[32mOK\x1b[0m   ' : '\x1b[31mFALLA\x1b[0m'} ${l}${extra ? '  ' + extra : ''}`);
  if (!cond) fallos++;
};

console.log(`\n\x1b[1mARRANCAR EL CICLO 1\x1b[0m  ${APLICAR ? '\x1b[31m(APLICANDO)\x1b[0m' : '(ensayo: revierte al final)'}`);
console.log('='.repeat(68));

try {
  await c.query('BEGIN');

  const ten = (await c.query('SELECT id FROM tenants LIMIT 1')).rows[0].id;
  const con = (await c.query('SELECT id FROM organization_support_contracts LIMIT 1')).rows[0].id;
  const antes = {
    comp: (await c.query('SELECT * FROM support_cycle_compliance($1)', [con])).rows[0],
    uso: (await c.query('SELECT * FROM support_cycle_usage($1)', [con])).rows[0],
  };

  console.log('\n\x1b[1m1. Fase inicial: levantamiento\x1b[0m');

  // Solo los ENTREGABLES: un miembro de un grupo no lleva fase, su plazo es
  // el del padre.
  const entregables = (await c.query(
    `SELECT t.id, t.ticket_number, left(t.title, 44) AS ti, t.effort_size::text AS sz
       FROM tickets t
      WHERE t.delivery_cycle_id = $1
        AND t.deleted_at IS NULL
        AND t.requirement_phase IS NULL
        AND t.status NOT IN ('proposed','cancelled')
        AND NOT EXISTS (
          SELECT 1 FROM ticket_relations r
           WHERE r.related_ticket_id = t.id AND r.relation_type = 'child')
      ORDER BY t.effort_points DESC`, [CICLO])).rows;

  ok(`${entregables.length} entregables sin fase`, entregables.length === 8, String(entregables.length));

  for (const e of entregables) {
    await c.query(`UPDATE tickets SET requirement_phase='levantamiento' WHERE id=$1`, [e.id]);
    console.log(`  \x1b[32mOK\x1b[0m    ${e.ticket_number}  ${e.sz}  ${e.ti}`);
  }

  console.log('\n\x1b[1m2. Capacidad del ciclo\x1b[0m');

  for (const cap of CAPACIDAD) {
    const ag = (await c.query(
      `SELECT id, name FROM agents WHERE email=$1 AND is_active`, [cap.email])).rows[0];
    if (!ag) {
      ok(`${cap.email}`, false, 'no existe o está inactivo');
      continue;
    }
    await c.query(
      `INSERT INTO agent_capacity (tenant_id, cycle_id, agent_id, hours_per_day, overhead_hours, notes)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (cycle_id, agent_id) DO UPDATE
         SET hours_per_day = excluded.hours_per_day,
             overhead_hours = excluded.overhead_hours,
             notes = excluded.notes`,
      [ten, CICLO, ag.id, cap.horas, cap.overhead, cap.nota]);
    ok(`${ag.name}`, true,
       `${cap.horas}h/día · ${cap.overhead}h de soporte en el ciclo = ${cap.horas - cap.overhead / DIAS_HABILES_CICLO}h netas al día`);
  }

  console.log('\n\x1b[1m3. Verificación\x1b[0m');

  const conFase = (await c.query(
    `SELECT count(*) AS n FROM tickets
      WHERE delivery_cycle_id=$1 AND requirement_phase='levantamiento'`, [CICLO])).rows[0].n;
  ok('los 8 en levantamiento', conFase === '8', conFase);

  const tramos = (await c.query(
    `SELECT count(*) AS n FROM ticket_phase_log l
      JOIN tickets t ON t.id = l.ticket_id
     WHERE t.delivery_cycle_id=$1 AND l.exited_at IS NULL`, [CICLO])).rows[0].n;
  ok('8 tramos abiertos (los abrió el trigger)', tramos === '8', tramos);

  const dueno = (await c.query(
    `SELECT DISTINCT l.owner FROM ticket_phase_log l
       JOIN tickets t ON t.id = l.ticket_id
      WHERE t.delivery_cycle_id=$1`, [CICLO])).rows.map((r) => r.owner);
  ok('el reloj corre a cargo del cliente', dueno.length === 1 && dueno[0] === 'cliente',
     dueno.join(','));

  // El plazo sale del catálogo: levantamiento son 2 días hábiles.
  const sla = (await c.query(
    `SELECT target_days FROM ticket_phase_sla($1) WHERE is_open`,
    [entregables[0].id])).rows[0];
  ok('plazo de 2 días hábiles', Number(sla?.target_days) === 2, String(sla?.target_days));

  const cap = (await c.query('SELECT * FROM agent_capacity_status($1)', [CICLO])).rows;
  ok('la capacidad ya calcula', cap.length === CAPACIDAD.length, `${cap.length} fila(s)`);
  for (const x of cap) {
    console.log(`        ${x.agent_name}: ${x.gross_hours}h brutas − ${x.overhead_hours}h de soporte = ${x.available_hours}h de desarrollo en ${x.working_days} días`);
    console.log(`        (${Number(x.available_hours) / Number(x.working_days)}h netas al día)`);
  }

  console.log('\n\x1b[1m4. Soporte intacto\x1b[0m');
  const desp = {
    comp: (await c.query('SELECT * FROM support_cycle_compliance($1)', [con])).rows[0],
    uso: (await c.query('SELECT * FROM support_cycle_usage($1)', [con])).rows[0],
  };
  ok(`measurable ${desp.comp.measurable}`, desp.comp.measurable === antes.comp.measurable);
  ok(`credit_cop ${desp.comp.credit_cop}`,
     String(desp.comp.credit_cop) === String(antes.comp.credit_cop));
  ok(`consumed ${desp.uso.consumed}`, desp.uso.consumed === antes.uso.consumed);

  if (fallos) {
    await c.query('ROLLBACK');
    console.log(`\n\x1b[31m${fallos} FALLO(S) — revertido.\x1b[0m`);
    process.exit(1);
  }

  if (APLICAR) {
    await c.query('COMMIT');
    console.log('\n' + '='.repeat(68));
    console.log('\x1b[32mAPLICADO.\x1b[0m El ciclo 1 ya mide plazos.');
    console.log('\n  Para revertir:');
    console.log(`    UPDATE tickets SET requirement_phase=NULL WHERE delivery_cycle_id='${CICLO}';`);
    console.log(`    DELETE FROM ticket_phase_log WHERE ticket_id IN (SELECT id FROM tickets WHERE delivery_cycle_id='${CICLO}');`);
    console.log(`    DELETE FROM agent_capacity WHERE cycle_id='${CICLO}';`);
  } else {
    await c.query('ROLLBACK');
    console.log('\n' + '='.repeat(68));
    console.log('\x1b[32mEnsayo limpio.\x1b[0m Para aplicar:');
    console.log('    node scripts/arrancar-ciclo1.mjs --aplicar');
  }
} catch (e) {
  try { await c.query('ROLLBACK'); } catch { /* ya cerrada */ }
  console.log(`\n\x1b[31mERROR:\x1b[0m ${e.message}`);
  process.exit(1);
} finally {
  await c.end();
}
