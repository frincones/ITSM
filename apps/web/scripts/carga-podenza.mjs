// ---------------------------------------------------------------------------
// Carga inicial del cronograma de Podenza
// ---------------------------------------------------------------------------
//   node scripts/carga-podenza.mjs            # ENSAYO, revierte al final
//   node scripts/carga-podenza.mjs --aplicar  # aplica de verdad
//
// Convierte el Excel Cronograma_Podenza_5Meses en datos del módulo:
//
//   · 1 proyecto de Podenza (hoy ninguno tiene organización asignada)
//   · 1 ciclo con 14 créditos comprometidos (el cupo Enterprise)
//   · 8 entregables, 17 créditos — R1+R2+R3 del Mes 1
//   · 35 ítems de backlog para ciclos futuros
//   · 5 tickets support reclasificados a backlog
//
// Por defecto ENSAYA: hace todo dentro de BEGIN ... ROLLBACK y verifica el
// resultado antes de deshacerlo. Solo con --aplicar hace COMMIT.
//
// Lo que NO debe moverse, y se comprueba al final: las cifras de soporte
// (measurable 15, consumed 15 de 30, credit_cop 0).
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

// ---------------------------------------------------------------------------
// EL CRONOGRAMA
// ---------------------------------------------------------------------------
// `reusa` = número de ticket existente que ya describe ese trabajo. El cruce
// se hizo por texto y lo confirmó el equipo el 16-oct-2026.
//
// `reclasificar` = ese ticket es de tipo support y pasa a backlog. En los
// ciclos solo va garantía y backlog; el soporte corriente se gestiona fuera.

const CICLO = [
  {
    titulo: 'R1 · Capa de filtros',
    size: 'M',
    miembros: [
      { t: 'Filtro de QR' },
      { t: 'Filtrar por banco en parrilla de Clientes', reusa: 'TKT-2605-00560' },
      { t: 'Filtro de aprobados (Gestor de Aprobaciones)' },
      { t: 'Ver por cuál banco vino el cambio no-viable / negado' },
      { t: 'Filtro múltiple estados + establecimientos (multiselección)',
        reusa: 'PDZ-2602-00155', reclasificar: true },
      { t: 'Filtro por Dinateam', reusa: 'PDZ-2601-00037', reclasificar: true },
      { t: 'Alcance de filtro de ejecutivo (establecimientos)', reusa: 'PDZ-2609-00157' },
    ],
  },
  {
    titulo: 'R2 · Captura por WhatsApp y QR',
    size: 'L',
    miembros: [
      // Movido de R1: comparte el grupo de créditos D15:D18 con los de
      // WhatsApp, y está bajo el encabezado de R2 en la hoja.
      { t: 'Link de WhatsApp demasiado largo' },
      { t: 'Alimentar formulario del lead desde WhatsApp' },
      { t: 'Texto inicial QR con nombre de asesor/marca + varios QR' },
      { t: 'Insertar contacto de WhatsApp a Leads (track QR)' },
    ],
  },
  {
    titulo: 'R2 · Validación y enrutamiento WhatsApp',
    size: 'M',
    miembros: [
      { t: 'Validación automática de número entrante en WhatsApp' },
      { t: 'Enrutamiento inteligente hacia el asesor correspondiente' },
    ],
  },
  // Individuales: un ticket sin padre es su propio entregable.
  { titulo: 'Reasignación automática por inactivación de usuario', size: 'S',
    solo: true, reusa: 'TKT-2605-00594', reclasificar: true },
  { titulo: 'Desistimiento general + retomar TODOS los bancos', size: 'M',
    solo: true, reusa: 'PDZ-2602-00153', reclasificar: true },
  { titulo: 'Duplicar una solicitud (sin duplicar el lead)', size: 'M', solo: true },
  { titulo: 'Modal de visualización para rol Seguros', size: 'M', solo: true },
  { titulo: 'Asociar un codeudor a una solicitud existente', size: 'M', solo: true },
];

/** Al backlog: sin ciclo, sin fase y sin estimar hasta que se comprometan. */
const BACKLOG = [
  // Sacado del ciclo 1 por decisión del equipo.
  { t: 'Editar tipo de Producto de Interés (Leads/Clientes)', b: 'Mes 1 · R2',
    reusa: 'TKT-2604-00526', reclasificar: true },

  // Mes 1 · R4 y Mes 2
  { t: 'Crear Leads como Persona Jurídica', b: 'Mes 1 · R4' },
  { t: 'Trazabilidad de qué aux. comercial envió el lead', b: 'Mes 1 · R4' },
  { t: 'Leads creados por un gestor no entran a FIFO (los gestiona él)', b: 'Mes 1 · R4' },
  { t: 'Validación: matrícula como documento mandatorio', b: 'Mes 1 · R4' },
  { t: 'Envío de peritaje para bancos específicos', b: 'Mes 1 · R4' },
  { t: 'Delegación de funciones entre usuarios de distinto rol', b: 'Mes 2' },

  // Integraciones: entran a un ciclo cuando el banco responda. El módulo ya
  // modela esa espera como dependencia_tercero.
  { t: 'Sufi / Bancolombia — finalizar y certificar', b: 'Track · espera banco' },
  { t: 'Vehigrupo — 2 endpoints', b: 'Track · espera banco' },
  { t: 'Santander — consulta de aprobación', b: 'Track · espera banco' },

  // Bloque 2 · Comisiones. Las 15 comparten XL y 14 créditos entre TODAS
  // (celdas E4:E18 y F4:F18 combinadas), así que se cargan sin estimar y se
  // agruparán en un requerimiento XL al comprometerlas.
  { t: 'HU-0067 — Generación de Desembolso a partir del Módulo de Solicitudes', b: 'Bloque 2 · Comisiones' },
  { t: 'Enrolamiento de nuevos afiliados (contrato, firma AUCO)', b: 'Bloque 2 · Comisiones' },
  { t: 'HU-0068 — Cálculo automático de comisión por crédito', b: 'Bloque 2 · Comisiones' },
  { t: 'HU-0069 — Registro y liquidación obligatoria de pólizas asociadas a créditos', b: 'Bloque 2 · Comisiones' },
  { t: 'HU-0070 — Registro y gestión detallada de pagos múltiples de comisiones', b: 'Bloque 2 · Comisiones' },
  { t: 'HU-0071 — Cálculo automático y acumulativo de seguridad social', b: 'Bloque 2 · Comisiones' },
  { t: 'HU-0072 — Gestión manual de novedades de seguridad social', b: 'Bloque 2 · Comisiones' },
  { t: 'HU-0073 — Cálculo, control y validación de comisión bancaria por escalas', b: 'Bloque 2 · Comisiones' },
  { t: 'HU-0074 — Control, conciliación y cierre mensual de comisiones', b: 'Bloque 2 · Comisiones' },
  { t: 'HU-0075 — Administración de promotores por establecimiento', b: 'Bloque 2 · Comisiones' },
  { t: 'HU-0076 — Reapertura controlada de mes de comisiones', b: 'Bloque 2 · Comisiones' },
  { t: 'HU-0077 — Perfil de afiliado para asignar pago de comisión a otro usuario', b: 'Bloque 2 · Comisiones' },
  { t: 'HU — Exportación de reportes y pagos de comisiones', b: 'Bloque 2 · Comisiones' },
  { t: 'HU — Visual del afiliado para ver comisiones, pagos e históricos', b: 'Bloque 2 · Comisiones' },
  { t: 'Envío de documentos electrónicos (crear HU con Yuli)', b: 'Bloque 2 · Comisiones' },

  // Bloque 3 · septiembre
  { t: 'Cambio de estado para reconsiderar ofertas en todas las etapas', b: 'Bloque 3' },
  { t: 'HU — Simulación de cuotas previo al preaprobado', b: 'Bloque 3' },
  { t: 'HU — Segmentación dinámica de documentos por tipo de solicitante', b: 'Bloque 3' },
  { t: 'HU — Modal de visualización para rol Promotor (sin permisos de edición)', b: 'Bloque 3' },
  { t: 'Reportería de gestión y tiempos de usuarios (CMG)', b: 'Bloque 3' },
  { t: 'HU — Generación automática de resumen descriptivo del cliente con IA', b: 'Bloque 3' },

  // Bloques 4 y 5
  { t: 'Delegación de funciones entre roles (si no entró en Mes 1/2)', b: 'Bloque 4-5' },
  { t: 'Envío de peritaje para bancos en específico (¿garantía o backlog?)', b: 'Bloque 4-5' },
  { t: 'Permitir etiquetar notas externas a los asesores de establecimientos', b: 'Bloque 4-5' },
  { t: 'Registro de leads con formulario manual (Sol. Corta) — pendiente de cobro', b: 'Bloque 4-5' },
];

// ---------------------------------------------------------------------------

const c = new pg.Client({ connectionString: CS, ssl: { rejectUnauthorized: false } });
await c.connect();

let fallos = 0;
const ok = (l, cond, extra = '') => {
  console.log(`  ${cond ? '\x1b[32mOK\x1b[0m   ' : '\x1b[31mFALLA\x1b[0m'} ${l}${extra ? '  ' + extra : ''}`);
  if (!cond) fallos++;
};

console.log(`\n\x1b[1mCARGA DEL CRONOGRAMA DE PODENZA\x1b[0m  ${APLICAR ? '\x1b[31m(APLICANDO)\x1b[0m' : '(ensayo: revierte al final)'}`);
console.log('='.repeat(70));

try {
  await c.query('BEGIN');

  const ten = (await c.query('SELECT id FROM tenants LIMIT 1')).rows[0].id;
  const pod = (await c.query(`SELECT id FROM organizations WHERE name ILIKE '%podenza%'`)).rows[0].id;
  const adm = (await c.query(`SELECT id, email FROM agents WHERE is_active AND role='admin' ORDER BY name LIMIT 1`)).rows[0];

  // Las cifras de soporte ANTES, para comparar al final.
  const con = (await c.query('SELECT id FROM organization_support_contracts LIMIT 1')).rows[0].id;
  const antes = {
    comp: (await c.query('SELECT * FROM support_cycle_compliance($1)', [con])).rows[0],
    uso: (await c.query('SELECT * FROM support_cycle_usage($1)', [con])).rows[0],
  };

  console.log('\n\x1b[1m1. Proyecto y ciclo\x1b[0m');

  const proj = (await c.query(
    `INSERT INTO projects (tenant_id, organization_id, name, description, status)
     VALUES ($1,$2,'Podenza · AI Pods 2026',
             'Proyecto de desarrollo bajo el contrato AI Pods 2026 (Anexo C). Cargado desde el cronograma de 5 meses.',
             'in_progress')
     RETURNING id, name`, [ten, pod])).rows[0];
  ok('proyecto creado', !!proj.id, proj.name);

  const cyc = (await c.query(
    `INSERT INTO delivery_cycles (tenant_id, project_id, cycle_number, name,
       starts_on, ends_on, status, committed_points)
     VALUES ($1,$2,1,'Ciclo 1 · octubre 2026','2026-10-01','2026-10-31','active',14)
     RETURNING id, name, committed_points`, [ten, proj.id])).rows[0];
  ok('ciclo creado', !!cyc.id, `${cyc.name} · ${cyc.committed_points} créditos comprometidos`);

  console.log('\n\x1b[1m2. Reclasificar support → backlog\x1b[0m');
  console.log('   En los ciclos solo va garantía y backlog; el soporte se gestiona fuera.\n');

  const aReclasificar = [
    ...CICLO.flatMap((e) => (e.solo ? [e] : e.miembros)).filter((x) => x.reclasificar),
    ...BACKLOG.filter((x) => x.reclasificar),
  ].map((x) => x.reusa);

  for (const num of aReclasificar) {
    const r = await c.query(
      `UPDATE tickets SET type='backlog' WHERE ticket_number=$1 AND type='support'
       RETURNING ticket_number`, [num]);
    ok(`${num} → backlog`, r.rowCount === 1, r.rowCount ? '' : 'no era support o no existe');
  }

  console.log('\n\x1b[1m3. Entregables del ciclo 1\x1b[0m');

  // Crea un ticket de backlog, o toma el existente si se reusa.
  //
  // El título viene en `t` para los miembros de un grupo y en `titulo` para
  // los entregables individuales, porque un individual ES el entregable.
  async function ticketPara(item, aCiclo) {
    const titulo = item.t ?? item.titulo;
    if (!titulo) throw new Error(`Ítem sin título: ${JSON.stringify(item)}`);
    if (item.reusa) {
      const r = await c.query(
        `UPDATE tickets SET project_id=$2, delivery_cycle_id=$3
          WHERE ticket_number=$1 AND deleted_at IS NULL
         RETURNING id, ticket_number`,
        [item.reusa, proj.id, aCiclo ? cyc.id : null]);
      if (!r.rowCount) throw new Error(`No se encontró ${item.reusa}`);
      return { ...r.rows[0], nuevo: false };
    }
    const r = await c.query(
      `INSERT INTO tickets (tenant_id, organization_id, title, description, type, status,
         urgency, impact, requester_email, project_id, delivery_cycle_id, channel)
       VALUES ($1,$2,$3,$4,'backlog','backlog','medium','medium',$5,$6,$7,'portal')
       RETURNING id, ticket_number`,
      [ten, pod, titulo,
       `Ítem del cronograma Podenza 5 meses. Cargado el ${new Date().toISOString().slice(0, 10)}.`,
       adm.email ?? 'equipo@tdxcore.com', proj.id, aCiclo ? cyc.id : null]);
    return { ...r.rows[0], nuevo: true };
  }

  let creditos = 0;
  for (const e of CICLO) {
    if (e.solo) {
      const t = await ticketPara(e, true);
      const pts = (await c.query('SELECT effort_points_for($1,$2,$3) AS n', [ten, pod, e.size])).rows[0].n;
      await c.query('UPDATE tickets SET effort_size=$2, effort_points=$3 WHERE id=$1',
        [t.id, e.size, pts]);
      creditos += Number(pts);
      ok(`${e.titulo.slice(0, 48).padEnd(48)} ${e.size} · ${pts} cr`, true,
         t.nuevo ? 'nuevo' : `reusa ${t.ticket_number}`);
    } else {
      const hijos = [];
      for (const m of e.miembros) hijos.push(await ticketPara(m, true));
      const p = (await c.query(
        `SELECT * FROM group_tickets_into_requirement($1::uuid[],$2,$3,$4,$5,$6)`,
        [hijos.map((h) => h.id), e.titulo, e.size, cyc.id, proj.id, adm.id])).rows[0];
      creditos += Number(p.effort_points);
      ok(`${e.titulo.slice(0, 48).padEnd(48)} ${e.size} · ${p.effort_points} cr`,
         Number(p.effort_points) > 0, `${hijos.length} tickets · ${p.ticket_number}`);
    }
  }

  console.log('\n\x1b[1m4. Backlog\x1b[0m');
  const porBloque = {};
  for (const b of BACKLOG) {
    await ticketPara(b, false);
    porBloque[b.b] = (porBloque[b.b] ?? 0) + 1;
  }
  for (const [bloque, n] of Object.entries(porBloque)) {
    console.log(`  \x1b[32mOK\x1b[0m    ${bloque.padEnd(26)} ${n} ítem(s)`);
  }

  console.log('\n\x1b[1m5. Verificación\x1b[0m');

  const st = (await c.query('SELECT * FROM delivery_cycle_status($1)', [cyc.id])).rows[0];
  ok('8 entregables en el ciclo', st.items_total === 8, String(st.items_total));
  ok('17 créditos', st.assigned_points === 17, String(st.assigned_points));
  ok('sobre-compromiso marcado (17 > 14)', st.over_commitment === true);
  ok(`suma esperada = ${creditos}`, creditos === 17, String(creditos));

  const nBacklog = (await c.query(
    `SELECT count(*) AS n FROM tickets
      WHERE project_id=$1 AND delivery_cycle_id IS NULL AND deleted_at IS NULL`, [proj.id])).rows[0].n;
  // 35, no 38: la propuesta inicial contaba mal. Desglose por bloque:
  // R2 sacado 1, R4 5, Mes 2 1, Track 3, Comisiones 15, Bloque 3 6, B4-5 4.
  ok(`${BACKLOG.length} ítems en el backlog`, nBacklog === String(BACKLOG.length), nBacklog);

  const sinFase = (await c.query(
    `SELECT count(*) AS n FROM tickets WHERE project_id=$1 AND requirement_phase IS NOT NULL`,
    [proj.id])).rows[0].n;
  ok('nada arranca con fase (la asigna el PM)', sinFase === '0', sinFase);

  const miembros = (await c.query(
    `SELECT count(*) AS n FROM requirement_members WHERE organization_id=$1`, [pod])).rows[0].n;
  ok('13 tickets dentro de los 3 grupos', miembros === '13', miembros);

  console.log('\n\x1b[1m6. Soporte intacto — lo que no debe moverse\x1b[0m');
  const desp = {
    comp: (await c.query('SELECT * FROM support_cycle_compliance($1)', [con])).rows[0],
    uso: (await c.query('SELECT * FROM support_cycle_usage($1)', [con])).rows[0],
  };
  ok(`measurable ${desp.comp.measurable}`, desp.comp.measurable === antes.comp.measurable,
     `antes ${antes.comp.measurable}`);
  ok(`met ${desp.comp.met}`, desp.comp.met === antes.comp.met, `antes ${antes.comp.met}`);
  ok(`credit_cop ${desp.comp.credit_cop}`,
     String(desp.comp.credit_cop) === String(antes.comp.credit_cop), `antes ${antes.comp.credit_cop}`);
  ok(`consumed ${desp.uso.consumed}`, desp.uso.consumed === antes.uso.consumed,
     `antes ${antes.uso.consumed}`);
  ok(`quota ${desp.uso.quota}`, desp.uso.quota === antes.uso.quota);

  if (fallos) {
    await c.query('ROLLBACK');
    console.log(`\n\x1b[31m${fallos} FALLO(S) — revertido, no se cargó nada.\x1b[0m`);
    process.exit(1);
  }

  if (APLICAR) {
    await c.query('COMMIT');
    console.log('\n' + '='.repeat(70));
    console.log('\x1b[32mCARGADO.\x1b[0m El ciclo 1 y el backlog están en producción.');
    console.log(`\n  proyecto: ${proj.id}`);
    console.log(`  ciclo:    ${cyc.id}`);
    console.log('\n  Para revertir:');
    console.log(`    DELETE FROM tickets WHERE project_id='${proj.id}' AND created_at >= now() - interval '1 hour';`);
    console.log(`    DELETE FROM delivery_cycles WHERE id='${cyc.id}';`);
    console.log(`    DELETE FROM projects WHERE id='${proj.id}';`);
    console.log('    -- y devolver a support los 6 reclasificados:');
    console.log(`    UPDATE tickets SET type='support' WHERE ticket_number IN (${aReclasificar.map((x) => `'${x}'`).join(', ')});`);
  } else {
    await c.query('ROLLBACK');
    console.log('\n' + '='.repeat(70));
    console.log('\x1b[32mEnsayo limpio.\x1b[0m Nada se cargó. Para aplicar de verdad:');
    console.log('    node scripts/carga-podenza.mjs --aplicar');
  }
} catch (e) {
  try { await c.query('ROLLBACK'); } catch { /* ya cerrada */ }
  console.log(`\n\x1b[31mERROR:\x1b[0m ${e.message}`);
  console.log('Revertido: no se cargó nada.');
  process.exit(1);
} finally {
  await c.end();
}
