// ---------------------------------------------------------------------------
// El historial real del ciclo 1
// ---------------------------------------------------------------------------
//   node scripts/cargar-historial-ciclo1.mjs            ensayo
//   node scripts/cargar-historial-ciclo1.mjs --aplicar  de verdad
//
// Los tramos de fase que hay hoy los inventó arrancar-ciclo1.mjs el 16 de
// octubre, cuando en realidad las reuniones fueron el 13 y el 14 y los
// documentos salieron después. Aquí se escribe lo que pasó de verdad, con las
// horas que Freddy sacó de las grabaciones de Teams.
//
// TRES COSAS QUE HAY QUE HACER BIEN, APRENDIDAS PROBANDO:
//
//   1. Desactivar el trigger mientras se escribe. Si no, cada UPDATE de
//      requirement_phase abre un tramo nuevo con fecha de hoy y acaban
//      sobrando filas.
//   2. Rellenar business_minutes en los tramos cerrados. ticket_phase_sla
//      hace coalesce(business_minutes, ...hasta ahora), así que un tramo
//      cerrado sin ese dato se sigue midiendo hasta hoy.
//   3. Escribirlos en orden y dejar abierto solo el último.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync } from 'node:fs';
import pg from 'pg';

const APLICAR = process.argv.includes('--aplicar');

// Lo que pasó, según las grabaciones de Teams.
const HISTORIAL = [
  {
    ticket: 'TKT-2610-00733',
    nombre: 'R1 · Capa de filtros',
    tramos: [
      // La reunión: martes 13 a las 12:00. Agendar y reunirse no tiene plazo,
      // y el tramo se cierra cuando la reunión acaba.
      ['levantamiento', 'tdx', null, '2026-10-13 12:00', '2026-10-13 13:00'],
      // Desde que acaba la reunión hasta que sale la HU, esa misma noche.
      ['documentacion', 'tdx', 480, '2026-10-13 13:00', '2026-10-14 00:25'],
      // El cliente tiene la HU desde el 14 y aún no la aprueba.
      ['aprobacion', 'cliente', 480, '2026-10-14 00:25', null],
    ],
  },
  {
    ticket: 'TKT-2610-00738',
    nombre: 'R2 · Captura por WhatsApp y QR',
    tramos: [
      ['levantamiento', 'tdx', null, '2026-10-14 14:43', '2026-10-14 15:43'],
      // La ronda de revisión interna con Emma, más el fin de semana.
      ['documentacion', 'tdx', 480, '2026-10-14 15:43', '2026-10-19 15:52'],
      ['aprobacion', 'cliente', 480, '2026-10-19 15:52', null],
    ],
  },
  {
    // Mismo levantamiento y misma HU que el anterior.
    ticket: 'TKT-2610-00741',
    nombre: 'R2 · Validación y enrutamiento WhatsApp',
    tramos: [
      ['levantamiento', 'tdx', null, '2026-10-14 14:43', '2026-10-14 15:43'],
      ['documentacion', 'tdx', 480, '2026-10-14 15:43', '2026-10-19 15:52'],
      ['aprobacion', 'cliente', 480, '2026-10-19 15:52', null],
    ],
  },
];

const CLAVES = [
  'committed_credits', 'delivered_credits', 'pending_credits', 'items_total',
  'exposed_credits', 'discount_cop', 'breached_items',
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
  statement_timeout: 60000,
});
await c.connect();

let fallos = 0;
const ok = (l, cond, extra = '') => {
  console.log(`  ${cond ? '\x1b[32mOK\x1b[0m   ' : '\x1b[31mFALLA\x1b[0m'} ${l}${extra ? '  ' + extra : ''}`);
  if (!cond) fallos++;
};
const horas = (m) => (m / 60).toFixed(1) + 'h';

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
    o.tdx = String(k.tdx_delay_minutes);
    o.cliente = String(k.client_delay_minutes);
    return o;
  };

  console.log(`\n\x1b[1mHISTORIAL REAL DEL CICLO 1\x1b[0m   ${APLICAR ? '\x1b[31mAPLICANDO\x1b[0m' : 'ensayo'}`);
  console.log('='.repeat(70));

  // Respaldo antes de tocar nada.
  const numeros = HISTORIAL.map((h) => h.ticket);
  const { rows: previo } = await c.query(
    `SELECT l.*, t.ticket_number FROM ticket_phase_log l
       JOIN tickets t ON t.id = l.ticket_id
      WHERE t.ticket_number = ANY($1)`,
    [numeros],
  );
  const ruta = `../../.claude/backup-historial-ciclo1-${new Date().toISOString().slice(0, 10)}.json`;
  writeFileSync(ruta, JSON.stringify(previo, null, 2), 'utf8');
  console.log(`\nrespaldo: ${ruta}  (${previo.length} tramos)`);

  await c.query('BEGIN');
  const antes = await foto();

  // El trigger abriría un tramo nuevo por cada cambio de fase.
  await c.query('ALTER TABLE tickets DISABLE TRIGGER trg_log_ticket_phase_change');

  for (const req of HISTORIAL) {
    const t = (
      await c.query(
        'SELECT id, tenant_id FROM tickets WHERE ticket_number = $1 AND delivery_cycle_id = $2',
        [req.ticket, cy],
      )
    ).rows[0];

    if (!t) {
      ok(`${req.ticket} existe en el ciclo`, false);
      continue;
    }

    await c.query('DELETE FROM ticket_phase_log WHERE ticket_id = $1', [t.id]);

    console.log(`\n\x1b[1m${req.nombre}\x1b[0m`);

    let ultima = null;
    for (const [fase, duenio, plazo, desde, hasta] of req.tramos) {
      const d1 = `${desde}-05`;
      const d2 = hasta ? `${hasta}-05` : null;

      // Los minutos hábiles del tramo cerrado, congelados como haría el
      // trigger. Sin esto se mediría hasta hoy.
      const mins = d2
        ? Number(
            (
              await c.query('SELECT project_business_minutes($1, $2::timestamptz, $3::timestamptz) m', [
                t.tenant_id, d1, d2,
              ])
            ).rows[0].m,
          )
        : null;

      await c.query(
        `INSERT INTO ticket_phase_log
           (tenant_id, ticket_id, phase, owner, target_minutes, target_days,
            entered_at, exited_at, business_minutes)
         VALUES ($1, $2, $3::requirement_phase, $4, $5, $6, $7::timestamptz, $8::timestamptz, $9)`,
        [t.tenant_id, t.id, fase, duenio, plazo, plazo ? plazo / 480 : null, d1, d2, mins],
      );

      const vivo = d2 === null;
      const medido = vivo
        ? Number(
            (
              await c.query('SELECT project_business_minutes($1, $2::timestamptz, now()) m', [
                t.tenant_id, d1,
              ])
            ).rows[0].m,
          )
        : mins;

      const sobra = plazo && medido > plazo ? medido - plazo : 0;
      console.log(
        `  ${fase.padEnd(14)}${duenio.padEnd(9)}${horas(medido).padStart(7)}` +
          `${plazo ? ' / ' + horas(plazo) : '  sin plazo'}` +
          `${sobra ? `  \x1b[31m+${horas(sobra)}\x1b[0m` : ''}${vivo ? '  (abierto)' : ''}`,
      );
      ultima = fase;
    }

    await c.query('UPDATE tickets SET requirement_phase = $1::requirement_phase WHERE id = $2', [
      ultima, t.id,
    ]);
  }

  await c.query('ALTER TABLE tickets ENABLE TRIGGER trg_log_ticket_phase_change');

  const despues = await foto();

  console.log(`\n\x1b[1mLas cifras del contrato\x1b[0m\n`);
  for (const k of CLAVES) {
    ok(`${k.padEnd(20)} ${antes[k]}`, antes[k] === despues[k], antes[k] === despues[k] ? '' : `→ ${despues[k]}`);
  }

  console.log(`\n\x1b[1mEl reloj\x1b[0m\n`);
  console.log(`  TDX:     ${horas(Number(antes.tdx)).padStart(7)}  →  ${horas(Number(despues.tdx))}`);
  console.log(`  cliente: ${horas(Number(antes.cliente)).padStart(7)}  →  ${horas(Number(despues.cliente))}`);

  // Los tramos de un requerimiento son SECUENCIALES: si dos se solapan, el
  // mismo tiempo se cuenta dos veces y el reloj se dispara. Pasó en el primer
  // ensayo —111 h de TDX— por poner levantamiento y documentación en el mismo
  // rango de fechas.
  const { rows: solapes } = await c.query(
    `SELECT t.ticket_number, count(*) n
       FROM ticket_phase_log a
       JOIN ticket_phase_log b ON b.ticket_id = a.ticket_id AND b.id <> a.id
       JOIN tickets t ON t.id = a.ticket_id
      WHERE t.ticket_number = ANY($1)
        AND a.entered_at < coalesce(b.exited_at, now())
        AND b.entered_at < coalesce(a.exited_at, now())
      GROUP BY 1`,
    [numeros],
  );
  ok('ningún tramo se solapa con otro', solapes.length === 0,
     solapes.map((x) => x.ticket_number).join(' '));

  // Un tramo cerrado sin business_minutes se mediría hasta hoy.
  const { rows: huecos } = await c.query(
    `SELECT count(*) n FROM ticket_phase_log l JOIN tickets t ON t.id = l.ticket_id
      WHERE t.ticket_number = ANY($1) AND l.exited_at IS NOT NULL AND l.business_minutes IS NULL`,
    [numeros],
  );
  ok('todos los tramos cerrados tienen sus minutos', huecos[0].n === '0');

  // Uno abierto por requerimiento, ni cero ni dos.
  const { rows: abiertos } = await c.query(
    `SELECT t.ticket_number, count(*) FILTER (WHERE l.exited_at IS NULL) n
       FROM tickets t JOIN ticket_phase_log l ON l.ticket_id = t.id
      WHERE t.ticket_number = ANY($1) GROUP BY 1`,
    [numeros],
  );
  ok(
    'un tramo abierto por requerimiento',
    abiertos.length === HISTORIAL.length && abiertos.every((a) => a.n === '1'),
    abiertos.map((a) => `${a.ticket_number}:${a.n}`).join(' '),
  );

  if (fallos || !APLICAR) {
    await c.query('ROLLBACK');
    console.log(
      fallos
        ? `\n\x1b[31m${fallos} fallo(s): ROLLBACK.\x1b[0m`
        : '\n\x1b[33mEnsayo: ROLLBACK. Añade --aplicar para escribirlo.\x1b[0m',
    );
  } else {
    await c.query('COMMIT');
    console.log('\n\x1b[32mCOMMIT. El tablero ya cuenta lo que pasó de verdad.\x1b[0m');
  }
} catch (e) {
  console.error('\x1b[31mERROR:\x1b[0m', e.message);
  try {
    await c.query('ALTER TABLE tickets ENABLE TRIGGER trg_log_ticket_phase_change');
    await c.query('ROLLBACK');
  } catch {
    /* ya cerrada */
  }
  fallos++;
} finally {
  await c.end();
}

process.exit(fallos ? 1 : 0);
