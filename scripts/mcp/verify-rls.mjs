// ---------------------------------------------------------------------------
// Verificación del aislamiento entre clientes
// ---------------------------------------------------------------------------
//   node scripts/mcp/verify-rls.mjs            # estado actual
//   node scripts/mcp/verify-rls.mjs --esperado # exige el estado YA corregido
//
// Comprueba, simulando la sesión real de cada usuario, cuántas filas ve en
// cada tabla sensible. Es la única prueba que importa aquí: el RLS no se
// puede verificar leyendo el SQL, solo midiendo lo que devuelve.
//
// Requiere SBP (token de Management API), porque hay que usar SET LOCAL ROLE
// y request.jwt.claims para suplantar a cada usuario — con la clave anónima
// o la de servicio no se puede.
//
// Solo lee. Cada consulta va dentro de BEGIN ... ROLLBACK.
// ---------------------------------------------------------------------------

const SBP = process.env.SBP;
const REF = process.env.SB_PROJECT_REF ?? 'cocfiotnnyrsymytsuxh';

if (!SBP) {
  console.error('Falta SBP (token sbp_... de Management API).');
  process.exit(2);
}

const MODO_ESPERADO = process.argv.includes('--esperado');

/**
 * Lo que cada usuario DEBE ver una vez corregido el aislamiento.
 *
 * Los admin conservan todo: restringirlos por agent_organizations les quitaría
 * acceso a tickets que atienden (medido: Admin NovaDesk perdería 244).
 *
 * `null` = no se comprueba todavía, porque esa tabla se corrige en 00070.
 */
const ESPERADO = {
  'Admin NovaDesk':   { rol: 'admin',    tickets: 714, followups: 1273, contacts: 6, nps: 188 },
  'Freddy Rincones':  { rol: 'admin',    tickets: 714, followups: 1273, contacts: 6, nps: 188 },
  'Emma Castillo':    { rol: 'admin',    tickets: 714, followups: 1273, contacts: 6, nps: 188 },
  'Camilo Mayorga':   { rol: 'readonly', tickets: 470, followups: 893,  contacts: 1, nps: 93 },
  'Bibiana Carvajal': { rol: 'readonly', tickets: 470, followups: 893,  contacts: 1, nps: 93 },
  'Daniel Valbuena':  { rol: 'readonly', tickets: 240, followups: 367,  contacts: 2, nps: 94 },
  'Andres Valbuena':  { rol: 'readonly', tickets: 240, followups: 367,  contacts: 2, nps: 94 },
};

/** Estado medido ANTES de corregir nada, para detectar lo que cambió. */
const ANTES = {
  tickets: 714, followups: 1273, contacts: 6, nps: 188,
};

let fallos = 0;

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SBP}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) return { error: (await res.text()).slice(0, 220) };
  return { data: await res.json() };
}

/** Cuenta filas visibles para un usuario concreto, sin dejar rastro. */
async function comoUsuario(userId, consultas) {
  const selects = Object.entries(consultas)
    .map(([k, q]) => `(${q}) AS ${k}`)
    .join(',\n    ');
  const r = await sql(
    `BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '${JSON.stringify({ sub: userId, role: 'authenticated' })}';
SELECT
    ${selects};
ROLLBACK;`,
  );
  if (r.error) return { error: r.error };
  return r.data?.[0] ?? {};
}

function linea(etiqueta, obtenido, esperado) {
  if (esperado === undefined || esperado === null) {
    console.log(`    ${etiqueta.padEnd(12)} ${String(obtenido).padStart(6)}`);
    return;
  }
  const bien = Number(obtenido) === Number(esperado);
  if (!bien) fallos += 1;
  const marca = bien ? '\x1b[32mOK\x1b[0m   ' : '\x1b[31mFALLA\x1b[0m';
  const nota = bien ? '' : `  <- esperado ${esperado}`;
  console.log(`    ${marca} ${etiqueta.padEnd(12)} ${String(obtenido).padStart(6)}${nota}`);
}

async function main() {
  const usuarios = await sql(
    `SELECT a.name, a.role::text AS rol, a.user_id
       FROM agents a WHERE a.is_active = true ORDER BY a.role, a.name;`,
  );
  if (usuarios.error) {
    console.error('No se pudo listar usuarios:', usuarios.error);
    process.exit(2);
  }

  console.log(
    `\n\x1b[1mAislamiento por organización\x1b[0m  (${MODO_ESPERADO ? 'exigiendo estado corregido' : 'estado actual'})\n`,
  );

  const CONSULTAS = {
    tickets:   'SELECT count(*) FROM tickets WHERE deleted_at IS NULL',
    followups: 'SELECT count(*) FROM ticket_followups',
    contacts:  'SELECT count(*) FROM contacts',
    nps:       'SELECT count(*) FROM nps_surveys',
  };

  for (const u of usuarios.data) {
    const visto = await comoUsuario(u.user_id, CONSULTAS);
    if (visto.error) {
      console.log(`  ${u.name} (${u.rol})\n    \x1b[31mERROR\x1b[0m ${visto.error}`);
      fallos += 1;
      continue;
    }

    const esp = MODO_ESPERADO ? ESPERADO[u.name] : null;
    console.log(`  ${u.name} \x1b[2m(${u.rol})\x1b[0m`);
    for (const k of Object.keys(CONSULTAS)) {
      linea(k, visto[k], esp ? esp[k] : null);
    }

    // Sin modo --esperado, señalar lo que todavía está expuesto.
    if (!MODO_ESPERADO && u.rol === 'readonly') {
      const fugas = Object.keys(CONSULTAS).filter(
        (k) => Number(visto[k]) === ANTES[k] && ESPERADO[u.name] && ESPERADO[u.name][k] !== ANTES[k],
      );
      if (fugas.length) {
        console.log(`    \x1b[33m^ sigue viendo todo en: ${fugas.join(', ')}\x1b[0m`);
      }
    }
    console.log('');
  }

  // La base de conocimiento es el caso que más fácil se rompe: sus 6 filas
  // tienen organization_id NULL, así que una política por organización se la
  // quitaría entera a los clientes.
  const kb = await sql(
    `SELECT count(*) FILTER (WHERE is_public) AS publicos, count(*) AS total FROM kb_articles;`,
  );
  if (!kb.error) {
    const { publicos, total } = kb.data[0];
    console.log(`  \x1b[1mBase de conocimiento\x1b[0m  ${publicos} públicos de ${total}`);
    const cam = usuarios.data.find((u) => u.name.startsWith('Camilo'));
    if (cam) {
      const v = await comoUsuario(cam.user_id, { kb: 'SELECT count(*) FROM kb_articles' });
      linea('kb (Camilo)', v.kb, MODO_ESPERADO ? Number(publicos) : null);
    }
    console.log('');
  }

  console.log(
    fallos === 0
      ? '\x1b[1mResumen\x1b[0m  \x1b[32msin diferencias\x1b[0m\n'
      : `\x1b[1mResumen\x1b[0m  \x1b[31m${fallos} diferencia(s)\x1b[0m\n`,
  );
  process.exit(fallos ? 1 : 0);
}

main().catch((err) => {
  console.error('verificación fallida:', err);
  process.exit(2);
});
