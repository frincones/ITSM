# PLAN DE IMPLEMENTACIÓN — Portal AI-First (Chat-Centric)

> **Fecha:** 2026-03-27
> **Status:** PLAN — No implementar hasta aprobación
> **Principio:** ZERO REGRESIÓN

---

## 1. OBJETIVO

Rediseñar el portal del cliente como una experiencia AI-first donde:
- El chat AI es el elemento central (no formularios ni navegación compleja)
- El AI busca en KB, sugiere soluciones, y crea tickets automáticamente
- Cada cliente ve su branding (logo, colores) basado en su organización
- Los tickets creados por el AI aparecen en /home/tickets para los admins TDX

---

## 2. ANÁLISIS DE REGRESIÓN

### Archivos que SE CREAN (100% nuevos — 0 riesgo):

| Archivo | Descripción |
|---------|-------------|
| `portal/_components/portal-chat.tsx` | Widget de chat AI principal |
| `portal/_components/portal-header.tsx` | Header con branding de la org |
| `portal/_components/quick-categories.tsx` | 4 botones de categorías rápidas |
| `portal/_components/popular-articles.tsx` | Artículos populares del KB |
| `portal/_components/ticket-created-card.tsx` | Card que muestra ticket recién creado |
| `portal/_components/status-bar.tsx` | Barra de estado del servicio |

### Archivos que SE MODIFICAN (riesgo controlado):

| Archivo | Cambio | Riesgo | Mitigación |
|---------|--------|--------|------------|
| `portal/page.tsx` | Reemplazar contenido con chat-centric | **BAJO** | El portal actual ya fue rediseñado varias veces. Solo afecta /portal |
| `portal/layout.tsx` | Resolver org por slug para branding | **BAJO** | Solo agrega query de org. Layout structure no cambia |
| `portal/chat/page.tsx` | Ya no necesario como página separada — redirect a /portal | **BAJO** | Se mantiene como redirect, no se elimina |
| `api/ai/chat/route.ts` | Agregar modo "portal" con tools reales (searchKB, createTicket) | **MEDIO** | Se agrega un IF para modo portal, no se cambia la lógica existente |

### Archivos que NO SE TOCAN (garantía):

```
❌ app/home/* (NADA de la app interna de agentes)
❌ lib/actions/tickets.ts (server actions de tickets)
❌ lib/actions/problems.ts
❌ lib/actions/changes.ts
❌ lib/actions/kb.ts
❌ lib/actions/inbox.ts
❌ lib/actions/workflows.ts
❌ lib/actions/reports.ts
❌ lib/actions/organizations.ts
❌ lib/actions/user-permissions.ts
❌ lib/services/sla.service.ts
❌ lib/services/rules.service.ts
❌ lib/services/workflow.service.ts
❌ lib/services/notification.service.ts
❌ lib/services/metrics.service.ts
❌ lib/services/webhook.service.ts
❌ lib/services/rbac.service.ts
❌ lib/services/organization.service.ts
❌ lib/services/user-permissions.service.ts
❌ lib/services/tenant.service.ts
❌ lib/services/inbox.service.ts
❌ lib/ai/agents/* (agents no se modifican, solo se usan)
❌ lib/ai/rag/* (RAG pipeline no cambia)
❌ lib/ai/tools/* (se usan pero no se modifican)
❌ lib/schemas/* (schemas no cambian)
❌ app/api/v1/* (REST API no cambia)
❌ app/api/cron/* (Cron jobs no cambian)
❌ app/api/ai/classify/* (no cambia)
❌ app/api/ai/suggest/* (no cambia)
❌ app/api/ai/summarize/* (no cambia)
❌ middleware.ts (no cambia)
❌ Todas las migraciones SQL existentes
❌ RLS policies
❌ Supabase schema
```

### Análisis detallado del cambio en `api/ai/chat/route.ts`:

```
ACTUAL:
  POST /api/ai/chat
  → Recibe messages[]
  → Genera respuesta con GPT-4o-mini
  → Retorna texto plano

DESPUÉS:
  POST /api/ai/chat
  → Recibe messages[] + portalContext? (nuevo campo opcional)
  → SI portalContext:
      → Agrega contexto de org y tools (searchKB, createTicket)
      → Usa generateText con tool calling
      → Retorna JSON con text + actions[]
  → SI NO portalContext:
      → Comportamiento IDÉNTICO al actual (texto plano)
      → ZERO cambio para la app interna

PROTECCIÓN:
  if (body.portalContext) {
    // NUEVO: modo portal con tools
  } else {
    // EXISTENTE: modo interno sin cambios
  }
```

---

## 3. DISEÑO DE COMPONENTES

### Portal Page (`/portal`) — Chat-Centric

```
┌──────────────────────────────────────────────────┐
│ PortalHeader (branding de la org)                 │
├──────────────────────────────────────────────────┤
│                                                    │
│   ┌──────────────────────────────────────┐        │
│   │ PortalChat (componente principal)     │        │
│   │                                        │        │
│   │ ESTADO INICIAL (sin mensajes):         │        │
│   │   AI avatar + saludo personalizado     │        │
│   │   QuickCategories (4 botones)          │        │
│   │   PopularArticles (5 artículos)        │        │
│   │   ChatInput (textarea + send)          │        │
│   │                                        │        │
│   │ ESTADO CON MENSAJES:                   │        │
│   │   ScrollArea con message bubbles       │        │
│   │   User messages (derecha, indigo bg)   │        │
│   │   AI messages (izquierda, white bg)    │        │
│   │   Action buttons (resolver/escalar)    │        │
│   │   TicketCreatedCard (si AI creó tkt)   │        │
│   │   ChatInput (siempre visible al fondo) │        │
│   └──────────────────────────────────────┘        │
│                                                    │
│ StatusBar (estado del servicio + tickets abiertos)│
└──────────────────────────────────────────────────┘
```

### Flujo de Datos

```
Usuario escribe mensaje
  ↓
POST /api/ai/chat (con portalContext: { orgId, orgName, userId })
  ↓
AI genera respuesta CON tool calling:
  - tool: searchKB → busca artículos en knowledge_documents
  - tool: createTicket → crea ticket via Supabase service_role
  ↓
Retorna: { text, articles[], ticketCreated? }
  ↓
PortalChat renderiza:
  - Texto de respuesta
  - Artículos citados (con links)
  - Card de ticket creado (si aplica)
  - Botones de acción (resolvió / no resolvió)
```

---

## 4. PLAN DE EJECUCIÓN

### Paso 1: Nuevos componentes del portal (6 archivos, 0 riesgo)

```
portal/_components/portal-header.tsx
  - Logo de la org (de organizations.logo_url o fallback)
  - Nombre de la org
  - Nav: [Base de Conocimiento] [Mis Tickets] [Avatar usuario]
  - Branding colors de la org

portal/_components/portal-chat.tsx
  - Estado inicial: saludo + categories + articles + input
  - Estado con mensajes: scroll de bubbles + input fijo al fondo
  - Message bubbles: user (derecha, indigo) + AI (izquierda, white)
  - Loading state: dots animados cuando AI piensa
  - Action buttons después de cada respuesta AI
  - Maneja el fetch a /api/ai/chat con portalContext

portal/_components/quick-categories.tsx
  - 4 botones: Problema técnico, Accesos, Solicitud, Base de conocimiento
  - Click → setea texto predefinido en el chat input
  - Iconos: Lucide (Monitor, Key, FileText, BookOpen)

portal/_components/popular-articles.tsx
  - Lista de 5 artículos más vistos de la org (+ globales)
  - Cada artículo: título, category badge, view count
  - Click → link a /portal/kb/[id] o abre en chat

portal/_components/ticket-created-card.tsx
  - Card que muestra cuando el AI creó un ticket
  - Ticket number, título, tipo, urgencia, org
  - Botón "Ver mi ticket" → /portal/tickets/[id]

portal/_components/status-bar.tsx
  - "Todo operativo" o "Incidente activo: [título]"
  - Count de tickets abiertos para esta org
  - Colores: verde (ok), amarillo (warning), rojo (incidente)
```

### Paso 2: Rediseñar portal page (1 archivo, riesgo BAJO)

```
portal/page.tsx (Server Component)
  - Resolver organización por slug o URL
  - Fetch KB articles populares de la org
  - Fetch status/incidentes activos
  - Fetch ticket count del usuario
  - Pasar todo a PortalChat

  NOTA: El contenido actual de portal/page.tsx se REEMPLAZA
  completamente. Esto es seguro porque /portal es una ruta
  independiente que no es importada por ningún otro archivo.
```

### Paso 3: Actualizar portal layout (1 archivo, riesgo BAJO)

```
portal/layout.tsx
  - Agregar resolución de org por slug
  - Pasar org data (name, logo, colors) al header
  - Mantener estructura: header + main + footer

  CAMBIO MÍNIMO: Solo agrega query de org al layout existente.
  El layout actual ya tiene header/footer, solo se personaliza.
```

### Paso 4: Agregar modo portal a AI chat (1 archivo, riesgo MEDIO)

```
api/ai/chat/route.ts
  - Agregar detección de body.portalContext
  - SI portal: usar generateText con tools (searchKB, createTicket)
  - SI NO portal: IDÉNTICO al actual (backwards compatible)

  ESTRUCTURA:
  if (body.portalContext) {
    // Portal mode: tools + org context
    const result = await generateText({
      model: openai('gpt-4o-mini'),
      system: portalSystemPrompt,
      messages,
      tools: {
        searchKB: { ... },
        createTicket: { ... },
      },
      maxSteps: 3,
    });
    return Response.json({ text: result.text, ... });
  } else {
    // Internal mode: unchanged
    const result = await generateText({ ... });
    return new Response(result.text, { ... });
  }
```

### Paso 5: Redirect portal/chat a /portal (1 archivo, riesgo BAJO)

```
portal/chat/page.tsx
  - Cambiar a redirect: redirect('/portal')
  - O mantener como alias que renderiza PortalChat
```

---

## 5. DEPENDENCIAS VERIFICADAS

### ¿Qué importa portal/page.tsx?
```
ACTUAL:
  - portal/_components/portal-client.tsx (SE REEMPLAZA)

NINGÚN otro archivo importa de portal/page.tsx.
NINGÚN otro archivo importa de portal/_components/.
/portal es una ruta LEAF — no es padre de nada que no sean sus propios sub-routes.
```

### ¿Qué importa api/ai/chat/route.ts?
```
ACTUAL:
  - openai from '@ai-sdk/openai'
  - getSupabaseServerClient from '@kit/supabase/server-client'

SE IMPORTA DESDE: Ningún archivo (es un API route, solo se llama via fetch)
CONSUMIDO POR:
  - portal/chat/page.tsx (fetch('/api/ai/chat'))
  - home/tickets/[id]/_components/ai-chat-panel.tsx (lazy loaded, ssr:false)

CAMBIO: Solo agrega un IF branch. El else mantiene comportamiento idéntico.
```

### ¿Qué importa portal/layout.tsx?
```
ACTUAL:
  - Ningún componente externo específico (layout simple)

SE IMPORTA DESDE: Ningún archivo (es un layout, Next.js lo usa automáticamente)
```

---

## 6. ORDEN DE EJECUCIÓN

```
Paso 1: Crear 6 componentes nuevos ─── 0 riesgo
           ↓
Paso 2: Rediseñar portal/page.tsx ──── riesgo BAJO (ruta leaf)
           ↓
Paso 3: Actualizar portal/layout.tsx ── riesgo BAJO (solo agrega query)
           ↓
Paso 4: Agregar modo portal a chat ─── riesgo MEDIO (IF branch)
           ↓
Paso 5: Redirect portal/chat ────────── riesgo BAJO
           ↓
Testing con Playwright ──────────────── verificación
```

---

## 7. TESTING PLAN

| Test | Acción | Resultado Esperado |
|------|--------|-------------------|
| T1 | Abrir /portal como usuario Podenza | Ver chat AI con branding Podenza |
| T2 | Click en "Problema técnico" | Chat input se llena con texto predefinido |
| T3 | Enviar "No puedo acceder al servidor" | AI responde con sugerencias + artículos KB |
| T4 | Click "No resolvió, crear ticket" | AI crea ticket con org=Podenza, tipo, urgencia |
| T5 | Verificar ticket en /home/tickets como Admin TDX | Ticket visible con toda la info del chat |
| T6 | Abrir /portal como usuario ACME | Ver chat con branding ACME (no Podenza) |
| T7 | Verificar /home/* sigue funcionando | Dashboard, tickets, settings sin cambios |
| T8 | Verificar /api/ai/chat sin portalContext | Respuesta texto plano (sin cambios) |

---

## 8. ESTIMACIÓN

| Paso | Archivos | Tiempo |
|------|----------|--------|
| Componentes nuevos | 6 nuevos | 1 hora |
| Portal page + layout | 2 modificados | 30 min |
| AI chat portal mode | 1 modificado | 30 min |
| Redirect | 1 modificado | 5 min |
| Testing | 0 | 30 min |
| **Total** | **10 archivos** | **~2.5 horas** |

---

## 9. RESUMEN DE GARANTÍAS

```
✅ CERO cambios en /home/* (app interna de agentes TDX)
✅ CERO cambios en Server Actions (tickets, problems, changes, etc.)
✅ CERO cambios en servicios (SLA, Rules, Workflow, etc.)
✅ CERO cambios en AI agents (triage, support, resolution, etc.)
✅ CERO cambios en RAG pipeline (embeddings, chunker, indexer, search)
✅ CERO cambios en API routes existentes (REST, cron, webhooks)
✅ CERO cambios en middleware
✅ CERO cambios en base de datos (no hay migration nueva)
✅ CERO cambios en RLS policies
✅ CERO cambios en Zod schemas
✅ /api/ai/chat backwards compatible (IF branch para portal mode)
✅ /portal es ruta leaf — no afecta ninguna otra ruta
```

---

*Plan pendiente de aprobación. ZERO regresión garantizada.*
