// ---------------------------------------------------------------------------
// El reloj del contrato no se reparte entre los miembros de un grupo
// ---------------------------------------------------------------------------
//   node scripts/verify-reloj-miembros.mjs
//
// El tablero muestra los 21 tickets del ciclo, no los 8 entregables, porque
// un entregable se reparte entre varios desarrolladores y cada uno mueve lo
// suyo. Eso obliga a que un MIEMBRO tenga fase propia, y abre el riesgo que
// importa: que sus días entren en el descuento y se cobren dos veces.
//
// El Anexo C pacta plazos POR ENTREGABLE. Así que la regla es:
//
//   miembro de un grupo  → fase y responsable propios, SIN plazo
//   entregable suelto    → fase, responsable y plazo propios
//   padre de un grupo    → el único plazo del grupo
//
// Esta prueba mete el caso extremo —los 13 miembros en una fase de TDX con
// 90 días acumulados— y exige que las 15 cifras del contrato no se muevan.
// Todo dentro de BEGIN/ROLLBACK: no toca producción.
//
// Si algún día falla, lo que se rompió es el aislamiento entre la gestión
// del tablero y la facturación, y hay dinero de por medio.
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import pg from 'pg';

const CLAVES = [
  'committed_credits', 'delivered_credits', 'pending_credits',
  'items_total', 'items_delivered', 'delivery_pct', 'below_threshold',
  'breached_items', 'exposed_credits', 'discount_cop', 'discount_capped',
  'tdx_delay_days', 'client_delay_days', 'third_party_days',
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

const c = new pg.Client({ connectionString: CS, ssl: { rejectUnauthorized: false } });
await c.connect();

let fallos = 0;

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

  if (!cy) {
    console.error('No hay ciclo de Podenza contra el que probar.');
    process.exit(1);
  }

  const foto = async () => {
    const comp = (await c.query('SELECT * FROM cycle_delivery_compliance($1)', [cy])).rows[0];
    const st = (await c.query('SELECT * FROM delivery_cycle_status($1)', [cy])).rows[0];
    const o = {};
    for (const k of CLAVES) o[k] = String(comp[k]);
    o.assigned_points = String(st.assigned_points);
    return o;
  };

  await c.query('BEGIN');

  const antes = await foto();

  const miembros = (
    await c.query(
      `SELECT t.id FROM tickets t
         JOIN ticket_relations r
           ON r.related_ticket_id = t.id AND r.relation_type = 'child'
        WHERE t.delivery_cycle_id = $1 AND t.deleted_at IS NULL`,
      [cy],
    )
  ).rows;

  if (!miembros.length) {
    console.log('\x1b[33mEl ciclo no tiene miembros agrupados: nada que probar.\x1b[0m');
    await c.query('ROLLBACK');
    process.exit(0);
  }

  // 'desarrollo' es una fase de TDX: si los días se contaran, saldrían en
  // tdx_delay_days y en el descuento.
  for (const m of miembros) {
    await c.query(`UPDATE tickets SET requirement_phase = 'desarrollo' WHERE id = $1`, [m.id]);
    await c.query(
      `UPDATE ticket_phase_log SET entered_at = now() - interval '90 days'
        WHERE ticket_id = $1 AND exited_at IS NULL`,
      [m.id],
    );
  }

  const despues = await foto();
  const movidos = Object.keys(antes).filter((k) => antes[k] !== despues[k]);

  console.log(`\n\x1b[1mEL RELOJ NO SE REPARTE\x1b[0m`);
  console.log('='.repeat(62));
  console.log(`\n${miembros.length} miembros puestos en 'desarrollo' con 90 días acumulados\n`);

  for (const k of Object.keys(antes)) {
    const igual = antes[k] === despues[k];
    if (!igual) fallos++;
    console.log(
      `  ${igual ? '\x1b[32mOK\x1b[0m   ' : '\x1b[31mFALLA\x1b[0m'} ${k.padEnd(20)} ${antes[k]}${
        igual ? '' : ` → ${despues[k]}`
      }`,
    );
  }

  console.log();
  if (movidos.length) {
    console.log(`\x1b[31mSe movieron ${movidos.length} cifra(s): ${movidos.join(', ')}\x1b[0m`);
    console.log('Los días de un miembro están entrando en la facturación.');
  } else {
    console.log(`\x1b[32mLas ${Object.keys(antes).length} cifras del contrato, idénticas.\x1b[0m`);
  }

  await c.query('ROLLBACK');
  console.log('\nROLLBACK: producción sin tocar.');
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
