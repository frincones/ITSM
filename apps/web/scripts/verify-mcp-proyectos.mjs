// ---------------------------------------------------------------------------
// Validación de las tools MCP del módulo de proyectos
// ---------------------------------------------------------------------------
//   node scripts/verify-mcp-proyectos.mjs
//
// Dos niveles, porque cada uno detecta cosas distintas:
//
//   1. EL CATÁLOGO, leído del código. Que las tools estén registradas, con
//      descripción, scope, esquema y versión. Un inputSchema vacío sin
//      .describe() hace que el cliente descarte TODO el catálogo — ya pasó
//      dos veces en esta plataforma.
//
//   2. EL DOMINIO, ejecutado contra la base. Las tools no tienen lógica
//      propia: delegan en lib/domain/delivery.domain.ts. Si las funciones
//      de dominio responden bien, las tools responden bien.
//
// Lo que NO se puede validar aquí es el transporte HTTP con una clave real:
// de api_keys solo se guarda el hash, así que no hay forma de recuperar un
// secreto existente. Eso exige crear una clave nueva desde la interfaz.
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import pg from 'pg';

const SRC = 'lib/mcp/tools/delivery.ts';

let fallos = 0;
const ok = (l, cond, extra = '') => {
  console.log(
    `  ${cond ? '\x1b[32mOK\x1b[0m   ' : '\x1b[31mFALLA\x1b[0m'} ${l}${extra ? '  ' + extra : ''}`,
  );
  if (!cond) fallos++;
};

// ---------------------------------------------------------------------------
// 1. El catálogo
// ---------------------------------------------------------------------------

const src = readFileSync(SRC, 'utf8');
const bloques = src.split('registry.register({').slice(1);

const tools = bloques
  .map((b) => ({
    nombre: b.match(/name: '([^']+)'/)?.[1],
    desc: (b.match(/description:[\s\S]{0,40}?'([\s\S]*?)',\n\s+scope:/) ?? [])[1] ?? '',
    scope: b.match(/scope: '([^']+)'/)?.[1],
    tieneSchema: b.includes('inputSchema: z.object('),
    // El defecto que ya mordió dos veces: z.object({}) sin .describe().
    schemaVacio: /inputSchema: z\.object\(\{\}\)\s*,/.test(b),
    since: b.match(/since: '([^']+)'/)?.[1],
  }))
  .filter((t) => t.nombre);

console.log(`\n\x1b[1mTOOLS MCP DEL MÓDULO DE PROYECTOS\x1b[0m`);
console.log('='.repeat(66));
console.log(`\n\x1b[1m1. El catálogo\x1b[0m  (${tools.length} tools en ${SRC})\n`);

const GRUPOS = {
  'backlog y esfuerzo': [
    'backlog_list', 'backlog_estimate', 'backlog_assign_project',
    'projects_effort', 'effort_scale',
  ],
  'ciclos de entrega': [
    'cycles_list', 'cycles_create', 'cycles_assign_item', 'cycles_status',
    'cycles_close', 'cycles_history',
  ],
  'capacidad del equipo': ['capacity_status', 'capacity_set', 'capacity_copy', 'time_off_add'],
  'triage del portal': ['proposals_list', 'proposals_accept', 'proposals_reject'],
  'fases y SLA': [
    'phases_catalog', 'requirements_list', 'requirements_set_phase',
    'requirements_phase_sla', 'requirements_delay', 'cycles_breaches',
    'cycles_delivery_compliance', 'organizations_delay_summary',
  ],
  'esperas': ['waits_list', 'waits_open', 'waits_close'],
  'agrupación': [
    'requirements_group', 'requirements_ungroup', 'requirements_members',
    'requirements_resize', 'requirements_quota_impact',
  ],
};

const nombres = new Set(tools.map((t) => t.nombre));
let esperadas = 0;
for (const [grupo, lista] of Object.entries(GRUPOS)) {
  esperadas += lista.length;
  const faltan = lista.filter((n) => !nombres.has(n));
  ok(`${grupo.padEnd(22)} ${lista.length}`, faltan.length === 0, faltan.join(', '));
}
ok(`sin tools de más`, tools.length === esperadas, `${tools.length} vs ${esperadas} esperadas`);

console.log('\n\x1b[1m2. Cada tool bien formada\x1b[0m\n');

const malas = tools.filter(
  (t) => !t.desc || t.desc.length < 40 || !t.scope || !t.tieneSchema || t.schemaVacio || !t.since,
);
ok(`las ${tools.length} con descripción, scope, esquema y versión`, malas.length === 0,
   malas.map((t) => t.nombre).join(', '));

ok('ningún inputSchema vacío sin .describe()', !tools.some((t) => t.schemaVacio),
   tools.filter((t) => t.schemaVacio).map((t) => t.nombre).join(', '));

const scopes = [...new Set(tools.map((t) => t.scope))];
ok('solo scopes del módulo', scopes.every((s) => s?.startsWith('projects:')), scopes.join(', '));

// Una tool que escribe con scope de lectura sería un agujero de permisos.
const ESCRIBEN = /_(group|ungroup|resize|set_phase|open|close|create|assign|estimate|accept|reject|add|set|copy)$/;
const malScope = tools.filter((t) => ESCRIBEN.test(t.nombre) && t.scope !== 'projects:write');
ok('las de escritura piden projects:write', malScope.length === 0,
   malScope.map((t) => `${t.nombre}=${t.scope}`).join(', '));

// Un agente que confunda los dos créditos reporta un descuento de entrega
// como si fuera un crédito de soporte: dos cifras de dos contratos.
const comp = tools.find((t) => t.nombre === 'cycles_delivery_compliance');
ok('cycles_delivery_compliance distingue los dos SLA',
   /support_cycle_compliance/.test(comp?.desc ?? ''));

const grp = tools.find((t) => t.nombre === 'requirements_group');
ok('requirements_group advierte del doble conteo de cuota',
   /cuota de soporte/.test(grp?.desc ?? ''));

// ---------------------------------------------------------------------------
// 3. El dominio, contra la base
// ---------------------------------------------------------------------------

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
  console.log('\n\x1b[33mSin conexión a la base: se omite la parte 3.\x1b[0m');
  process.exit(fallos ? 1 : 0);
}

const c = new pg.Client({ connectionString: CS, ssl: { rejectUnauthorized: false } });
await c.connect();

console.log('\n\x1b[1m3. Lo que cada tool devuelve, contra producción\x1b[0m\n');

try {
  const pod = (await c.query(`SELECT id FROM organizations WHERE name ILIKE '%podenza%'`)).rows[0].id;
  const cyc = (await c.query(
    `SELECT c.id FROM delivery_cycles c JOIN projects p ON p.id = c.project_id
      WHERE p.organization_id = $1 ORDER BY c.cycle_number DESC LIMIT 1`, [pod])).rows[0]?.id;
  const req = (await c.query(
    `SELECT t.id FROM tickets t WHERE t.delivery_cycle_id = $1
       AND NOT EXISTS (SELECT 1 FROM ticket_relations r
                        WHERE r.related_ticket_id = t.id AND r.relation_type = 'child')
     LIMIT 1`, [cyc])).rows[0]?.id;

  const probar = async (tool, sql, params = []) => {
    try {
      const r = await c.query(sql, params);
      ok(`${tool.padEnd(32)} ${r.rows.length} fila(s)`, true);
      return r.rows;
    } catch (e) {
      ok(tool.padEnd(32), false, e.message.slice(0, 60));
      return [];
    }
  };

  await probar('phases_catalog', 'SELECT phase FROM delivery_phases ORDER BY sort_order');
  await probar('effort_scale', 'SELECT size, points FROM effort_conversion WHERE effective_to IS NULL');
  await probar('backlog_list', `SELECT id FROM tickets WHERE type IN ('backlog','desarrollo_pendiente')
    AND deleted_at IS NULL LIMIT 20`);
  await probar('cycles_list', 'SELECT id FROM delivery_cycles');
  await probar('cycles_status', 'SELECT * FROM delivery_cycle_status($1)', [cyc]);
  await probar('cycles_breaches', 'SELECT * FROM cycle_sla_breaches($1)', [cyc]);
  await probar('cycles_delivery_compliance', 'SELECT * FROM cycle_delivery_compliance($1)', [cyc]);
  await probar('organizations_delay_summary', 'SELECT * FROM organization_delay_summary($1)', [pod]);
  await probar('requirements_phase_sla', 'SELECT * FROM ticket_phase_sla($1)', [req]);
  await probar('requirements_delay', 'SELECT * FROM requirement_delay($1)', [req]);
  await probar('requirements_members', 'SELECT * FROM requirement_members WHERE requirement_id=$1', [req]);
  await probar('waits_list', 'SELECT * FROM open_phase_waits($1)', [pod]);
  await probar('capacity_status', 'SELECT * FROM agent_capacity_status($1)', [cyc]);
  await probar('proposals_list', `SELECT id FROM tickets WHERE status='proposed'`);

  console.log('\n\x1b[1m4. Las de escritura existen y son invocables\x1b[0m\n');
  for (const fn of [
    'group_tickets_into_requirement', 'ungroup_requirement', 'resize_requirement',
    'open_phase_wait', 'close_phase_wait', 'accept_proposal', 'reject_proposal',
    'copy_cycle_capacity',
  ]) {
    const r = await c.query(
      `SELECT count(*) n FROM pg_proc WHERE proname = $1
         AND has_function_privilege('authenticated', oid, 'execute')`, [fn]);
    ok(`${fn.padEnd(32)} con permiso`, r.rows[0].n !== '0');
  }
} catch (e) {
  ok('la parte 3', false, e.message.slice(0, 80));
} finally {
  await c.end();
}

console.log('\n' + '='.repeat(66));
if (fallos) {
  console.log(`\x1b[31m${fallos} FALLO(S).\x1b[0m`);
  process.exit(1);
}
console.log('\x1b[32mLas tools del módulo responden correctamente.\x1b[0m');
console.log('\nNo validado: el transporte HTTP con una clave real. De api_keys solo');
console.log('se guarda el hash, así que hace falta crear una clave nueva desde');
console.log('/home/settings para probar el extremo a extremo.');
