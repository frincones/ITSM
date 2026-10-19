// ---------------------------------------------------------------------------
// Reset de las fases falsas del ciclo 1
// ---------------------------------------------------------------------------
//   node scripts/reset-fases-ciclo1.mjs            ensayo (BEGIN/ROLLBACK)
//   node scripts/reset-fases-ciclo1.mjs --aplicar  de verdad
//
// El script arrancar-ciclo1.mjs puso los ocho entregables en `levantamiento`
// el 16 de octubre, en bloque, para que el tablero no saliera vacío. Era una
// suposición: solo cuatro habían empezado de verdad.
//
// Los otros cinco llevan desde entonces acumulando días de un plazo de 2 días
// que nunca debió abrirse — 10 de los 17 días del reloj del cliente son
// falsos, y los cinco están al borde de incumplir.
//
// EL ORDEN IMPORTA. Medido: poner `propuesto` sin borrar antes el tramo falso
// lo CIERRA conservando sus días y abre uno nuevo, así que el reloj SUBE de
// 17 a 22. Hay que borrar primero y poner la fase después:
//
//   solo propuesto            17 -> 22   ✗
//   borrar tramo + propuesto  17 -> 12   ✓
//
// Los 12 que quedan son los días reales de los cuatro que sí arrancaron.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync } from 'node:fs';
import pg from 'pg';

const APLICAR = process.argv.includes('--aplicar');

// Confirmados por Freddy: estos cuatro SÍ están en levantamiento.
const EN_MARCHA = [
  'R1 · Capa de filtros',
  'R2 · Captura por WhatsApp y QR',
  'R2 · Validación y enrutamiento WhatsApp',
  'Trabajo paralelo · Santander',
];

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
  console.error('Sin cadena de conexión: define SUPABASE_DB_URL.');
  process.exit(1);
}

const c = new pg.Client({
  connectionString: CS,
  ssl: { rejectUnauthorized: false },
  statement_timeout: 30000,
});
await c.connect();

const CLAVES = [
  'committed_credits', 'delivered_credits', 'pending_credits', 'items_total',
  'items_delivered', 'delivery_pct', 'below_threshold', 'breached_items',
  'exposed_credits', 'discount_cop', 'discount_capped', 'tdx_delay_days',
  'client_delay_days', 'third_party_days',
];

let fallos = 0;
const ok = (l, cond, extra = '') => {
  console.log(`  ${cond ? '\x1b[32mOK\x1b[0m   ' : '\x1b[31mFALLA\x1b[0m'} ${l}${extra ? '  ' + extra : ''}`);
  if (!cond) fallos++;
};

try {
  const cy = (
    await c.query(
      `SELECT c.id FROM delivery_cycles c
         JOIN projects p ON p.id = c.project_id
         JOIN organizations o ON o.id = p.organization_id
        WHERE o.name ILIKE '%podenza%'
        ORDER BY c.cycle_number DESC LIMIT 1`,
    )
  ).rows[0]?.id;

  if (!cy) throw new Error('No hay ciclo de Podenza.');

  const foto = async () => {
    const k = (await c.query('SELECT * FROM cycle_delivery_compliance($1)', [cy])).rows[0];
    const o = {};
    for (const x of CLAVES) o[x] = String(k[x]);
    return o;
  };

  // Los entregables que NO están en marcha.
  const { rows: entregables } = await c.query(
    `SELECT t.id, t.ticket_number, t.title, t.requirement_phase
       FROM tickets t
      WHERE t.delivery_cycle_id = $1
        AND t.deleted_at IS NULL
        AND t.status NOT IN ('proposed','cancelled')
        AND NOT EXISTS (SELECT 1 FROM ticket_relations r
                         WHERE r.related_ticket_id = t.id AND r.relation_type = 'child')
      ORDER BY t.title`,
    [cy],
  );

  const sinIniciar = entregables.filter(
    (e) => !EN_MARCHA.some((m) => e.title.startsWith(m.slice(0, 22))),
  );

  console.log(`\n\x1b[1mRESET DE FASES — CICLO 1\x1b[0m   ${APLICAR ? '\x1b[31mAPLICANDO\x1b[0m' : 'ensayo'}`);
  console.log('='.repeat(66));
  console.log(`\n${entregables.length} entregables · ${sinIniciar.length} sin iniciar\n`);

  for (const e of entregables) {
    const mueve = sinIniciar.some((s) => s.id === e.id);
    console.log(
      `  ${mueve ? '\x1b[33m→ propuesto\x1b[0m' : '\x1b[32m  se queda \x1b[0m'}  ${e.title.slice(0, 48)}`,
    );
  }

  if (!sinIniciar.length) {
    console.log('\nNada que mover.');
    process.exit(0);
  }

  const ids = sinIniciar.map((s) => s.id);

  // RESPALDO antes de tocar nada.
  const { rows: tramos } = await c.query(
    `SELECT l.*, t.ticket_number FROM ticket_phase_log l
       JOIN tickets t ON t.id = l.ticket_id
      WHERE l.ticket_id = ANY($1)`,
    [ids],
  );
  const ruta = `../../.claude/backup-fases-ciclo1-${new Date().toISOString().slice(0, 10)}.json`;
  writeFileSync(
    ruta,
    JSON.stringify({ tickets: sinIniciar, tramos }, null, 2),
    'utf8',
  );
  console.log(`\nrespaldo: ${ruta}  (${tramos.length} tramos)`);

  await c.query('BEGIN');
  const antes = await foto();

  // 1. Borrar el tramo falso. Antes de poner la fase, no después.
  const del = await c.query(
    `DELETE FROM ticket_phase_log
      WHERE ticket_id = ANY($1) AND phase = 'levantamiento' RETURNING id`,
    [ids],
  );

  // 2. Ahora sí la fase. Sin tramo previo, el trigger no arrastra días.
  const upd = await c.query(
    `UPDATE tickets SET requirement_phase = 'propuesto', updated_at = now()
      WHERE id = ANY($1) RETURNING ticket_number`,
    [ids],
  );

  const despues = await foto();

  console.log(`\n\x1b[1mLo que cambió\x1b[0m\n`);
  ok(`tramos falsos borrados: ${del.rowCount}`, del.rowCount === sinIniciar.length);
  ok(`tickets en propuesto: ${upd.rowCount}`, upd.rowCount === sinIniciar.length);

  for (const k of CLAVES) {
    const igual = antes[k] === despues[k];
    // client_delay_days TIENE que bajar: es el objetivo. Si no cambia, el
    // borrado no se aplicó.
    if (k === 'client_delay_days') {
      ok(
        `client_delay_days baja  ${antes[k]} → ${despues[k]}`,
        Number(despues[k]) < Number(antes[k]),
      );
    } else {
      ok(`${k.padEnd(20)} ${antes[k]}`, igual, igual ? '' : `→ ${despues[k]}`);
    }
  }

  // Ningún tramo nuevo puede tener plazo: propuesto no lo tiene.
  const { rows: nuevos } = await c.query(
    `SELECT count(*) n, count(*) FILTER (WHERE target_days IS NOT NULL) con_plazo
       FROM ticket_phase_log WHERE ticket_id = ANY($1)`,
    [ids],
  );
  ok(`los ${nuevos[0].n} tramos nuevos no tienen plazo`, nuevos[0].con_plazo === '0');

  if (fallos || !APLICAR) {
    await c.query('ROLLBACK');
    console.log(
      fallos
        ? `\n\x1b[31m${fallos} fallo(s): ROLLBACK.\x1b[0m`
        : '\n\x1b[33mEnsayo: ROLLBACK. Añade --aplicar para escribirlo.\x1b[0m',
    );
  } else {
    await c.query('COMMIT');
    console.log('\n\x1b[32mCOMMIT. El reloj del cliente ya no cuenta lo que no empezó.\x1b[0m');
  }
} catch (e) {
  console.error('\x1b[31mERROR:\x1b[0m', e.message);
  try {
    await c.query('ROLLBACK');
  } catch {
    /* ya cerrada */
  }
  fallos++;
} finally {
  await c.end();
}

process.exit(fallos ? 1 : 0);
