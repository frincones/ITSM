// ---------------------------------------------------------------------------
// Aislamiento entre clientes — la comprobación que NO caduca
// ---------------------------------------------------------------------------
//   node scripts/mcp/verify-aislamiento.mjs
//
// verify-rls.mjs compara conteos exactos (714, 470, 240), y esos números
// caducan: el portal crea tickets a diario, así que fallan por tráfico normal
// y no por una fuga. El 16-oct-2026 un ticket real movió Prosuministros de
// 240 a 241 y la guardia saltó sin que nada estuviera mal.
//
// Esto comprueba lo que de verdad importa y no depende del volumen:
//
//   1. Un usuario de cliente ve EXCLUSIVAMENTE tickets de su organización.
//      Cero de otra. Si ve uno ajeno, hay fuga, haya 240 o 2400.
//   2. El personal ve todo el tenant.
//   3. La clave anónima no ve nada.
//
// Simula la sesión real de cada usuario con SET LOCAL ROLE y
// request.jwt.claims: es la única forma de medir lo que el RLS deja pasar.
// Solo lee, dentro de BEGIN ... ROLLBACK.
// ---------------------------------------------------------------------------

import pg from 'pg';
import { readFileSync } from 'node:fs';

function connectionString() {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;
  try {
    for (const line of readFileSync('.claude/SUPABASE-CREDENTIALS.md', 'utf8').split('\n')) {
      const m = line.match(/postgresql:\/\/[^\s`|]+/);
      if (m) return m[0];
    }
  } catch {
    /* sin archivo local */
  }
  return null;
}

const CS = connectionString();
if (!CS) {
  console.error(
    'Falta la cadena de conexión. Define SUPABASE_DB_URL o deja\n' +
      '.claude/SUPABASE-CREDENTIALS.md con la conexión directa.',
  );
  process.exit(2);
}

const c = new pg.Client({ connectionString: CS, ssl: { rejectUnauthorized: false } });
await c.connect();

let fallos = 0;
const ok = (etiqueta, condicion, extra = '') => {
  console.log(`  ${condicion ? '\x1b[32mOK\x1b[0m   ' : '\x1b[31mFALLA\x1b[0m'} ${etiqueta}${extra ? '  ' + extra : ''}`);
  if (!condicion) fallos++;
};

/** Lo que ve un usuario, midiendo con SU sesión. */
async function comoUsuario(userId, consulta) {
  await c.query('BEGIN');
  try {
    await c.query('SET LOCAL ROLE authenticated');
    await c.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: userId, role: 'authenticated' }),
    ]);
    const { rows } = await c.query(consulta);
    return rows;
  } finally {
    await c.query('ROLLBACK');
  }
}

console.log('\n\x1b[1mAISLAMIENTO ENTRE CLIENTES\x1b[0m');
console.log('='.repeat(64));

const usuarios = (
  await c.query(`
    SELECT a.id, a.name, a.user_id, a.role,
           (SELECT count(*) FROM agent_organizations ao WHERE ao.agent_id = a.id) AS orgs,
           (SELECT array_agg(o.name ORDER BY o.name)
              FROM agent_organizations ao
              JOIN organizations o ON o.id = ao.organization_id
             WHERE ao.agent_id = a.id) AS nombres
      FROM agents a
     WHERE a.user_id IS NOT NULL AND a.is_active = true
     ORDER BY a.role, a.name`)
).rows;

console.log('\n\x1b[1m1. Un cliente solo ve SU organización\x1b[0m');

for (const u of usuarios) {
  // Qué organizaciones aparecen en lo que este usuario alcanza a leer.
  const vistas = await comoUsuario(
    u.user_id,
    `SELECT DISTINCT o.name
       FROM tickets t
       JOIN organizations o ON o.id = t.organization_id
      WHERE t.deleted_at IS NULL
      ORDER BY o.name`,
  );
  const nombres = vistas.map((r) => r.name);

  if (u.role === 'readonly') {
    // Un usuario de cliente no puede ver NINGUNA organización ajena, y eso
    // no depende de cuántos tickets haya.
    const suyas = u.nombres ?? [];
    const ajenas = nombres.filter((n) => !suyas.includes(n));
    ok(
      `${u.name.padEnd(18)} ve ${nombres.length} organización(es)`,
      ajenas.length === 0,
      ajenas.length ? `\x1b[31mFUGA: ve ${ajenas.join(', ')}\x1b[0m` : `(${nombres.join(', ')})`,
    );
  } else {
    // El personal debe ver el tenant completo: si de pronto ve menos
    // organizaciones que las que hay con tickets, algo le quitó acceso.
    const total = (
      await c.query(`SELECT count(DISTINCT organization_id) AS n
                       FROM tickets WHERE deleted_at IS NULL AND organization_id IS NOT NULL`)
    ).rows[0].n;
    ok(
      `${u.name.padEnd(18)} ve ${nombres.length} de ${total} organizaciones`,
      Number(nombres.length) === Number(total),
      nombres.join(', '),
    );
  }
}

console.log('\n\x1b[1m2. Lo mismo en seguimientos y contactos\x1b[0m');

for (const u of usuarios.filter((x) => x.role === 'readonly')) {
  const suyas = u.nombres ?? [];

  const fups = await comoUsuario(
    u.user_id,
    `SELECT DISTINCT o.name
       FROM ticket_followups f
       JOIN tickets t ON t.id = f.ticket_id
       JOIN organizations o ON o.id = t.organization_id`,
  );
  const ajenasF = fups.map((r) => r.name).filter((n) => !suyas.includes(n));
  ok(`${u.name.padEnd(18)} seguimientos`, ajenasF.length === 0,
     ajenasF.length ? `\x1b[31mFUGA: ${ajenasF.join(', ')}\x1b[0m` : 'solo los suyos');

  const cts = await comoUsuario(
    u.user_id,
    `SELECT DISTINCT o.name
       FROM contacts ct
       JOIN organizations o ON o.id = ct.organization_id`,
  );
  const ajenasC = cts.map((r) => r.name).filter((n) => !suyas.includes(n));
  ok(`${u.name.padEnd(18)} contactos   `, ajenasC.length === 0,
     ajenasC.length ? `\x1b[31mFUGA: ${ajenasC.join(', ')}\x1b[0m` : 'solo los suyos');
}

console.log('\n\x1b[1m3. Las tablas del módulo de proyectos\x1b[0m');

const nuevas = ['ticket_phase_log', 'phase_waits', 'delivery_cycles', 'billing_plans'];
for (const u of usuarios.filter((x) => x.role === 'readonly').slice(0, 2)) {
  const suyas = u.nombres ?? [];
  for (const tabla of nuevas) {
    let ajenas = [];
    try {
      const filas = await comoUsuario(
        u.user_id,
        tabla === 'billing_plans'
          ? `SELECT DISTINCT o.name FROM billing_plans b JOIN organizations o ON o.id = b.organization_id`
          : tabla === 'delivery_cycles'
            ? `SELECT DISTINCT o.name FROM delivery_cycles d
                 JOIN projects p ON p.id = d.project_id
                 JOIN organizations o ON o.id = p.organization_id`
            : `SELECT DISTINCT o.name FROM ${tabla} x
                 JOIN tickets t ON t.id = x.ticket_id
                 JOIN organizations o ON o.id = t.organization_id`,
      );
      ajenas = filas.map((r) => r.name).filter((n) => !suyas.includes(n));
    } catch (e) {
      ok(`${u.name.split(' ')[0].padEnd(10)} ${tabla.padEnd(18)}`, false, e.message.slice(0, 50));
      continue;
    }
    ok(`${u.name.split(' ')[0].padEnd(10)} ${tabla.padEnd(18)}`, ajenas.length === 0,
       ajenas.length ? `\x1b[31mFUGA: ${ajenas.join(', ')}\x1b[0m` : 'sin filas ajenas');
  }
}

console.log('\n\x1b[1m4. La clave anónima no ve nada\x1b[0m');

for (const tabla of ['tickets', 'contacts', 'ticket_phase_log', 'phase_waits', 'billing_plans']) {
  await c.query('BEGIN');
  let visto = null;
  try {
    await c.query('SET LOCAL ROLE anon');
    visto = Number((await c.query(`SELECT count(*) AS n FROM ${tabla}`)).rows[0].n);
  } catch {
    visto = 'bloqueado';
  }
  await c.query('ROLLBACK');
  ok(`anon en ${tabla.padEnd(18)}`, visto === 0 || visto === 'bloqueado', String(visto));
}

await c.end();

console.log('\n' + '='.repeat(64));
if (fallos) {
  console.log(`\x1b[31m${fallos} FALLO(S): hay fuga entre clientes.\x1b[0m`);
  process.exit(1);
}
console.log('\x1b[32mAislamiento intacto: nadie ve datos de otro cliente.\x1b[0m');
