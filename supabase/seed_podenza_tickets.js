/**
 * Seed script: Import Podenza SOPORTE V1 tickets from Excel into Supabase
 *
 * Usage: cd /tmp && node c:/Users/freddyrs/Desktop/ITSM/ITSM/supabase/seed_podenza_tickets.js
 */

const XLSX = require('xlsx');
const { Client } = require('pg');

const DB_CONFIG = {
  host: 'aws-1-us-east-2.pooler.supabase.com',
  port: 5432,
  user: 'postgres.cocfiotnnyrsymytsuxh',
  password: 'ITSM*.2026*.',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
};

const TENANT_ID = '8be06573-2e43-4d8f-b81d-48b9cddb060d';
const PODENZA_ORG_ID = '7336ab13-209c-4fc5-922f-dff97897fdc2';

// Agent mapping (owner name → agent_id)
const AGENT_MAP = {
  'emma': '2c38f449-ec8d-4e99-882a-78602ae47b0d',
  'freddy': '9f44a9cf-a058-4adc-af6b-b351e66ff25d',
  'bibiana': 'e484f91e-3c6d-47ba-9cbb-68570d06e775',
  'camilo': '44b48491-544b-4046-9533-20d6d6a0f3d4',
};

// Category mapping (module name → category_id) — will be populated from DB
let CATEGORY_MAP = {};

// Status mapping
function mapStatus(estado) {
  if (!estado) return 'new';
  const s = estado.toString().trim().toLowerCase();
  if (s === 'cerrado') return 'closed';
  if (s === 'pendiente') return 'pending';
  if (s === 'detenido') return 'pending';
  if (s === 'en progreso') return 'in_progress';
  if (s.includes('listo para testing')) return 'testing';
  if (s === 'backlog' || s === 'backlog ') return 'new';
  return 'new';
}

// Type mapping
function mapType(tipo, estado) {
  if (!tipo || tipo === 'N/A') {
    // Infer from estado
    const s = (estado || '').toString().trim().toLowerCase();
    if (s === 'backlog' || s === 'backlog ') return 'backlog';
    return 'support';
  }
  const t = tipo.toString().trim().toLowerCase();
  if (t === 'bug' || t === 'bugs' || t === 'bugs') return 'incident';
  if (t.includes('mejora')) return 'backlog';
  if (t === 'soporte') return 'support';
  if (t.includes('desarrollo')) return 'backlog';
  if (t === 'no prioritario') return 'support';
  if (t === 'prioritario') return 'incident';
  if (t === 'test' || t === 'proceso') return 'support';
  return 'support';
}

// Urgency from Prioridad
function mapUrgency(prioridad) {
  if (!prioridad) return 'medium';
  const p = Number(prioridad);
  if (p === 1) return 'critical';
  if (p === 2) return 'high';
  if (p === 3) return 'medium';
  if (p === 4) return 'low';
  return 'medium';
}

// Parse dates — handles DD/MM/YYYY, Excel serial numbers, N/A
function parseDate(raw) {
  if (!raw || raw === 'N/A') return null;

  // Excel serial number
  if (typeof raw === 'number' && raw > 40000) {
    const d = new Date((raw - 25569) * 86400 * 1000);
    return d.toISOString();
  }

  // DD/MM/YYYY string
  const str = raw.toString().trim();
  const match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const [, day, month, year] = match;
    const d = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T12:00:00Z`);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  return null;
}

// Resolve owner to agent_id
function resolveAgent(owner) {
  if (!owner) return null;
  const name = owner.toString().trim().toLowerCase();
  // Skip non-person values
  if (['n/a', 'repetido', 'si', 'no'].includes(name)) return null;
  return AGENT_MAP[name] || null;
}

// Resolve module to category_id
function resolveCategory(modulo) {
  if (!modulo) return null;
  const m = modulo.toString().trim();

  // Normalize common variations
  const normalizations = {
    'acceso': 'Accesos',
    'accesos': 'Accesos',
    'lead': 'Leads',
    'leads': 'Leads',
    'clientes': 'Clientes',
    'cliente': 'Clientes',
    'cliente ': 'Clientes',
    'clientes': 'Clientes',
    'notificacion': 'Notificaciones',
    'notificaciones': 'Notificaciones',
    'afiliado': 'Afiliados',
    'afiliados': 'Afiliados',
    'fifo': 'FIFO',
    'whatsapp': 'Whatsapp',
    'qr': 'QR',
    'bancos': 'Bancos',
    'reportes': 'Reportes',
    'general': 'General',
    'datos': 'Datos',
    'validacion': 'Validacion',
    'desarrollo pendiente': 'Desarrollo Pendiente',
    'ejecutivos': 'General',
    'sufi': 'Bancos',
  };

  const normalized = normalizations[m.toLowerCase()] || null;
  if (normalized && CATEGORY_MAP[normalized]) return CATEGORY_MAP[normalized];

  // Try direct match
  if (CATEGORY_MAP[m]) return CATEGORY_MAP[m];

  // Multi-module (e.g., "Leads - Clientes")
  if (m.includes('-')) {
    const first = m.split('-')[0].trim();
    const n2 = normalizations[first.toLowerCase()];
    if (n2 && CATEGORY_MAP[n2]) return CATEGORY_MAP[n2];
  }

  return null;
}

// Build title from description (first meaningful line, max 100 chars)
function buildTitle(desc) {
  if (!desc) return 'Ticket sin descripción';
  const clean = desc.toString().replace(/\r\n/g, '\n').split('\n')[0].trim();
  if (clean.length <= 100) return clean;
  return clean.slice(0, 97) + '...';
}

// Build tags from Soporte/Garantia column
function buildTags(soporteGarantia, noStopper) {
  const tags = [];
  if (soporteGarantia) {
    const sg = soporteGarantia.toString().trim();
    if (sg && sg !== 'N/A') tags.push(sg);
  }
  if (noStopper) {
    const ns = noStopper.toString().trim();
    if (ns === 'Hypercare') tags.push('Hypercare');
    if (ns === 'Si') tags.push('Stopper');
    if (ns === 'No') tags.push('No Stopper');
  }
  return tags;
}

async function main() {
  // Read Excel
  const wb = XLSX.readFile('C:/Users/freddyrs/Desktop/ITSM/ITSM/Contexto/Master Testing Podenza App.xlsx');
  const ws = wb.Sheets['SOPORTE V1'];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

  console.log(`Read ${data.length - 1} rows from Excel`);

  const client = new Client(DB_CONFIG);
  await client.connect();

  // Load categories
  const { rows: cats } = await client.query(
    'SELECT id, name FROM categories WHERE tenant_id = $1', [TENANT_ID]
  );
  cats.forEach(c => { CATEGORY_MAP[c.name] = c.id; });
  console.log(`Loaded ${cats.length} categories`);

  // Delete existing Podenza tickets (fresh seed)
  const { rowCount: deleted } = await client.query(
    'DELETE FROM tickets WHERE tenant_id = $1 AND organization_id = $2',
    [TENANT_ID, PODENZA_ORG_ID]
  );
  console.log(`Deleted ${deleted} existing Podenza tickets`);

  // Headers: [0]Tickete [1]Soporte/Garantia [2]MODULO [3]HU [4]Descripcion [5]Fecha Creacion
  //          [6]Fecha Entrega [7]Prioridad [8]Tipo [9]Estado [10]No Stopper [11]Owner
  //          [12]Evidencia [13]Comentarios

  let inserted = 0;
  let followupsInserted = 0;
  let errors = 0;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || !row.some(c => c !== undefined && c !== null && c !== '')) continue;

    const ticketNum = row[0]; // Ticket number from Excel
    const soporteGarantia = row[1];
    const modulo = row[2];
    const hu = row[3];
    const descripcion = row[4];
    const fechaCreacion = row[5];
    const fechaEntrega = row[6];
    const prioridad = row[7];
    const tipo = row[8];
    const estado = row[9];
    const noStopper = row[10];
    const owner = row[11];
    const evidencia = row[12];
    const comentarios = row[13];

    const title = buildTitle(descripcion);
    const description = descripcion ? descripcion.toString().replace(/\r\n/g, '\n') : '';
    const status = mapStatus(estado);
    const type = mapType(tipo, estado);
    const urgency = mapUrgency(prioridad);
    const categoryId = resolveCategory(modulo);
    const agentId = resolveAgent(owner);
    const tags = buildTags(soporteGarantia, noStopper);
    const createdAt = parseDate(fechaCreacion) || new Date('2026-01-15T12:00:00Z').toISOString();
    const slaDueDate = parseDate(fechaEntrega);

    // Build ticket_number: PDZ-YYMM-NNNNN
    const createdDate = new Date(createdAt);
    const yymm = `${createdDate.getFullYear().toString().slice(2)}${(createdDate.getMonth() + 1).toString().padStart(2, '0')}`;
    const ticketNumber = `PDZ-${yymm}-${String(ticketNum || i).padStart(5, '0')}`;

    const resolvedAt = status === 'closed' ? createdAt : null;
    const closedAt = status === 'closed' ? createdAt : null;

    try {
      const { rows: [ticket] } = await client.query(`
        INSERT INTO tickets (
          tenant_id, organization_id, ticket_number, title, description,
          status, type, urgency, priority, channel,
          category_id, assigned_agent_id, tags,
          sla_due_date, resolved_at, closed_at,
          internal_notes, created_at, updated_at,
          requester_email
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, 'portal',
          $10, $11, $12,
          $13, $14, $15,
          $16, $17, $17,
          'bibiana@podenza.com'
        ) RETURNING id
      `, [
        TENANT_ID, PODENZA_ORG_ID, ticketNumber, title, description,
        status, type, urgency, prioridad ? Number(prioridad) : 3,
        categoryId, agentId, tags.length ? `{${tags.join(',')}}` : '{}',
        slaDueDate, resolvedAt, closedAt,
        hu ? `HU: ${hu}` : null, createdAt,
      ]);

      inserted++;

      // Insert followup from Comentarios if exists
      if (comentarios && comentarios.toString().trim()) {
        try {
          await client.query(`
            INSERT INTO ticket_followups (
              tenant_id, ticket_id, content, is_private, author_type, created_at
            ) VALUES ($1, $2, $3, true, 'agent', $4)
          `, [TENANT_ID, ticket.id, comentarios.toString().trim(), createdAt]);
          followupsInserted++;
        } catch { /* skip followup errors */ }
      }

      // Insert followup from Evidencia if exists
      if (evidencia && evidencia.toString().trim()) {
        try {
          await client.query(`
            INSERT INTO ticket_followups (
              tenant_id, ticket_id, content, is_private, author_type, created_at
            ) VALUES ($1, $2, $3, true, 'agent', $4)
          `, [TENANT_ID, ticket.id, `[Evidencia] ${evidencia.toString().trim()}`, createdAt]);
          followupsInserted++;
        } catch { /* skip */ }
      }

    } catch (err) {
      errors++;
      if (errors <= 5) console.error(`Error row ${i} (ticket ${ticketNum}):`, err.message);
    }
  }

  console.log(`\n=== SEED COMPLETE ===`);
  console.log(`Tickets inserted: ${inserted}`);
  console.log(`Followups inserted: ${followupsInserted}`);
  console.log(`Errors: ${errors}`);

  // Verify counts by status
  const { rows: statusCounts } = await client.query(
    "SELECT status, count(*) as cnt FROM tickets WHERE organization_id = $1 GROUP BY status ORDER BY cnt DESC",
    [PODENZA_ORG_ID]
  );
  console.log('\nTickets by status:');
  statusCounts.forEach(r => console.log(`  ${r.status}: ${r.cnt}`));

  // Verify counts by type
  const { rows: typeCounts } = await client.query(
    "SELECT type, count(*) as cnt FROM tickets WHERE organization_id = $1 GROUP BY type ORDER BY cnt DESC",
    [PODENZA_ORG_ID]
  );
  console.log('\nTickets by type:');
  typeCounts.forEach(r => console.log(`  ${r.type}: ${r.cnt}`));

  await client.end();
}

main().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
