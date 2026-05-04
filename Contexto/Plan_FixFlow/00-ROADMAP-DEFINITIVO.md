# 🚀 NOVAdesk OS — Roadmap Definitivo Q2 2026

> **Plataforma multi-vertical voice-first para pymes LATAM. Web + Mobile. Operada por agentes de voz/chat. CRM transversal + módulos verticales. Multi-tenant white-label.**
>
> **Fuente:** Llamada con Emma Castillo (29 abril 2026, 37 min) + 9 fases prompt YC PM.
> **Autores:** Freddy Rincones (CEO) + Emma Castillo (CTO) + Agente Arquitecto.

---

## 🎯 LA VISIÓN CRISTALIZADA (lo que dijiste con Emma)

```
┌──────────────────────────────────────────────────────────────────┐
│  NOVAdesk OS — "El asistente que controla tu negocio"            │
│                                                                   │
│  DUEÑO DEL NEGOCIO interactúa con NOVA (agente voz/chat) que:    │
│    ✅ Crea tickets, responde tickets, ve tickets                  │
│    ✅ Configura WhatsApp del negocio                              │
│    ✅ Configura email, agente de voz web                          │
│    ✅ Crea cuentas para empleados con niveles de acceso           │
│    ✅ Conecta cliente final con empleados (llamadas en vivo)      │
│    ✅ Hace onboarding por voz (8 minutos)                         │
│    ✅ Asesora "mejor práctica para agendar X"                     │
│    ✅ Razona, aprende, usa RAG con contexto del negocio          │
│    ✅ Funciona en WEB y MOBILE con dual UI (voz + texto)         │
│                                                                   │
│  CLIENTE FINAL del negocio interactúa por:                        │
│    ✅ WhatsApp (canal principal LATAM)                            │
│    ✅ Email                                                       │
│    ✅ Agente de voz web (PWA opcional)                            │
│    ✅ Multi-canal con trazabilidad unificada                      │
│                                                                   │
│  VERTICALES PLANEADAS (según llamada):                            │
│    🥇 ITSM (la que ya casi tenemos lista) → MVP                   │
│    🦷 Dental                                                       │
│    💆 Estética y belleza                                          │
│    🐶 Veterinarias                                                │
│    🏠 Inmobiliarias                                               │
│    🍽️ Restaurantes (descartado por baja WTP/competencia alta)    │
│                                                                   │
│  COMPONENTE TRANSVERSAL:                                          │
│    🗄️ CRM compartido entre TODAS las verticales                  │
│    🛠️ Panel administración multi-tenant + membresías + pagos    │
│    💳 Pasarela de pagos + recurrencias                            │
│    🌐 Multi-tenant con datos aislados por cliente (RLS)           │
│                                                                   │
│  STACK CONFIRMADO:                                                │
│    🗄️ Supabase (DB + auth + RLS)                                  │
│    🚆 Railway (capa IA backend)                                   │
│    ▲ Vercel (despliegue web)                                      │
│    🍎 Apple + Google (mobile Fase 2)                              │
│                                                                   │
│  WOW FACTOR:                                                      │
│    "Que el dueño DELEGUE procesos en el agente y logre           │
│     CONTROLAR y HACER CRECER su negocio"                          │
│                                                                   │
│  PRINCIPIO RECTOR:                                                │
│    Human-in-the-loop SIEMPRE. NOVA propone, dueño aprueba.       │
└──────────────────────────────────────────────────────────────────┘
```

---

## 📋 1. EXECUTIVE SUMMARY (1 página)

| Campo | Valor |
|---|---|
| **Producto** | NOVAdesk OS — Voice-first Operations OS multi-vertical |
| **Wedge inicial (MVP)** | Vertical **ITSM** (ya 70% construido) — empresas tecnología LATAM |
| **Expansión 6 meses** | Dental + Estética + Veterinarias + Inmobiliarias |
| **Cliente primario** | Pymes LATAM 1-25 empleados con cliente final por WhatsApp |
| **Insight central** | "El dueño NO necesita aprender otro SaaS. NECESITA UN ASISTENTE QUE OPERE EL SaaS POR ÉL — por voz, en mobile, conectado al CRM y los canales del cliente." |
| **MVP Sprint** | Completar ITSM + agregar capa NOVA voice + CRM transversal + admin panel multi-tenant |
| **Wow moment (90s)** | "Hablo con NOVA en mi celu, le digo 'creame un ticket urgente para el server caído' y NOVA crea + asigna + notifica al cliente. Sin tocar ninguna pantalla." |
| **Pricing** | Por vertical pack: $49 Starter / $149 Growth / $499 Scale + Outcome add-ons |
| **TAM LATAM** | 🔶 ITSM LATAM ~$650M + 5 verticales más = ~$3.5B SOM bottom-up |
| **Inversión MVP** | $13K / 8 semanas (Freddy + Emma + 1 dev voice) |
| **Inversión a PMF** | $103K / 6 meses (incluye 2 verticales más + admin panel + mobile) |
| **North Star Metric** | **Acciones del Agente por Tenant/Mes (AAT)** |
| **Riesgo principal** | Scope creep — querer construir 6 verticales antes de validar 1 |

---

## 🧬 2. PROBLEM DECONSTRUCTION

### Reformulación (lenguaje del dueño de pyme)

> *"Quiero MANEJAR mi negocio, no aprender un software. Necesito un ASISTENTE que entienda mi industria, atienda mis clientes por WhatsApp, organice mi CRM, me responda preguntas por voz mientras manejo, y delegue todo lo repetitivo. Como tener un gerente operativo, pero por $150 al mes."*

### JTBD Canvas

| Tipo | Job |
|---|---|
| **Functional** | Operar mi negocio sin estar atado al escritorio: crear tickets/citas/cobros, atender clientes WhatsApp, gestionar empleados, todo desde voz o chat en cualquier momento |
| **Emotional** | Sentirme **en control** de mi negocio sin estar abrumado. Liberarme de tareas repetitivas para enfocarme en estrategia y crecimiento |
| **Social** | Que mi equipo y mis clientes vean mi negocio como **profesional, ágil y moderno** — "siempre responden, siempre saben de mí" |

### 5 Whys (causa raíz)

1. **¿Por qué los dueños sufren?** — Tienen que aprender 5 herramientas distintas (CRM + WhatsApp Manager + Calendly + Stripe + helpdesk)
2. **¿Por qué cinco?** — Cada vertical tiene su SaaS y ninguno habla con los otros
3. **¿Por qué no hablan?** — Construidos por equipos distintos, integraciones frágiles
4. **¿Por qué siguen así?** — Ningún player tiene incentivo de unificar: cada uno cobra su seat
5. **¿Por qué no hay un OS unificado?** — Hasta 2026, los LLMs no eran lo suficientemente buenos para REEMPLAZAR la UI con voz natural

**Causa raíz:** Hasta ahora, el dueño tenía que **APRENDER el software**. Con LLMs 2026 + voice realtime + function calling, el software puede APRENDER LA INTENCIÓN del dueño y ejecutar.

### Working Backwards — Press release ficticio

> **Bogotá, 1 sept 2026** — *NOVAdesk lanza el primer Sistema Operativo Voice-First para pymes LATAM*
>
> "Antes manejaba mi consultorio dental con WhatsApp en el celu, agenda en Google, cobros en Daviplata y un Excel para inventario. Tres horas diarias en admin. Hoy le digo a NOVA por el celu 'agendá la limpieza de María mañana 3pm, mandale el link de pago y confirmá que el lunes pasamos pedido de anestesia' — y todo se hace. Mi consultorio creció 40% sin contratar nadie." — *Dra. Patricia García, Medellín*
>
> NOVAdesk activa cualquier vertical en 8 minutos por voz. Funciona web + mobile. $149 USD/mes.

✅ **Verdict: PAINKILLER, no vitamin.**

### Pain quantification (LATAM pyme típica)

| Dolor | Valor mensual estimado |
|---|---|
| 3 horas/día de admin operativo del dueño (oportunidad perdida) | $1,500-3,000 |
| Stack de 5 SaaS separados | $250-600 |
| Leads/clientes perdidos por respuesta lenta | $1,000-5,000 |
| Tiempo entrenando empleados nuevos en herramientas | $500/empleado |
| **TOTAL dolor mensual pyme LATAM** | **$3,250-9,100** |

**WTP NOVAdesk razonable:** $99-499/mes (3-10% del dolor recuperado). ✅ Sostenible.

---

## 🏟️ 3. COMPETITIVE INTELLIGENCE

### Matriz de competidores (12 players verificados)

| # | Empresa | Categoría | Pricing | Wedge potencial NOVAdesk |
|---|---|---|---|---|
| 1 | **ServiceNow** | ITSM enterprise (44.4% mkt share) | $160+/seat/mo | ❌ Demasiado enterprise para pyme |
| 2 | **Jira Service Management** | ITSM mid-market | $20-85/agent/mo | 🎯 NOVAdesk: voice-first + multi-vertical + LATAM |
| 3 | **Freshservice** | ITSM mid-market | $29-99/agent/mo | 🎯 NOVAdesk: 1/5 del precio + voice |
| 4 | **HubSpot CRM** | CRM horizontal | $50-1,500/mo | 🎯 NOVAdesk: vertical-specific + voice |
| 5 | **Vambe** (Chile) | WhatsApp AI agents LATAM | Custom seed | 🎯 NOVAdesk: + CRM + multi-vertical + admin OS |
| 6 | **Mercately** (Ecuador) | WhatsApp + AI LATAM | Custom seed | 🎯 Misma tesis, NOVAdesk + voice + mobile |
| 7 | **Capim** (Brasil) | Vertical SaaS dental + BNPL | Custom A | 🎯 NOVAdesk: voice-first + multi-vertical |
| 8 | **Wati / Respond.io** | WhatsApp BSP | $40-500/mo | ❌ Sin voice nativo, sin verticalización |
| 9 | **Toma** (USA YC) | Voice agent automotive | a16z $25M+ enterprise | 🎯 LATAM gap |
| 10 | **Avoca** (USA YC) | Voice agent trades | $125M / unicorn abril 2026 | 🎯 LATAM gap |
| 11 | **Synthflow** | Voice AI builder no-code | $99-450/mo | ❌ Sin verticales, sin CRM, sin multi-tenant white-label |
| 12 | **Voiceflow** | Voice agent no-code | $50-700/mo | ❌ Builder, no producto vertical |

### 🔥 Heatmap de debilidades (la mina de oro)

| Debilidad recurrente | # players con esta debilidad | Wedge NOVAdesk |
|---|---|---|
| Sin voice-first nativo | 9/12 | ✅ NOVA es voice-first by design |
| Solo USA, no LATAM | 7/12 | ✅ NOVAdesk LATAM-first |
| CRM separado del helpdesk | 8/12 | ✅ CRM transversal compartido |
| Sin admin panel multi-tenant out-of-the-box | 11/12 | ✅ NOVAdesk admin como feature core |
| Sin WhatsApp embebido nativo | 8/12 | ✅ WhatsApp es canal primario |
| Cada vertical tiene su SaaS | 12/12 | ✅ NOVAdesk multi-vertical en 1 plataforma |
| Mobile pobre (web-only o app pesada) | 9/12 | ✅ Mobile-first voice control (Fase 2) |

### 5 Insights no obvios

1. **Nadie en LATAM combina ITSM + multi-vertical + voice + WhatsApp + multi-tenant.** Cada player ataca 1-2 dimensiones. NOVAdesk ataca las 5.

2. **Empezar por ITSM es CONTRAINTUITIVO pero brillante.** ITSM tiene flujos más estructurados (tickets, SLA, estados) → ideal para validar el motor NOVA antes de meterse a verticales emocionales (dental, estética).

3. **El "asistente operativo del dueño" es una categoría nueva.** No es CRM. No es ITSM. No es agente de soporte. Es **"el chief of staff por voz para pymes"**.

4. **El admin panel multi-tenant NO es backoffice — es PRODUCTO.** Capim demostró que vender la operación + el cobro juntos crea lock-in brutal. Stripe Connect + MercadoPago son tan importantes como NOVA.

5. **Mobile-first voice es el diferenciador 2026.** Apple Intelligence + Google Assistant están entrenando a usuarios a hablarle al celu. NOVAdesk surfea esa ola con app nativa.

### Mercado y tendencias

| Métrica | Valor | Fuente |
|---|---|---|
| ITSM global market 2026 | $4.53B → $9.58B (2035) CAGR 8.7% | businessresearchinsights.com |
| ITSM apps top 500 | $11.4B (2024), CAGR 6.2% | appsruntheworld.com |
| ServiceNow market share | 44.4% (líder absoluto) | Mismo |
| LATAM SaaS 2030 | $45B (CAGR 12.5%) | grandviewresearch.com |
| Voice AI market 2026 | $2.4B → $47.5B (2034) CAGR 35% | famulor.io |
| Vambe (LATAM) | ARR skyrocketed post WhatsApp AI agent pivot | TechCrunch |
| Avoca (USA voice trades) | Unicornio $1B abril 2026 | Fortune |
| Capim (Brasil dental) | ONEVC portfolio, dental + BNPL embebido | ONEVC blog |

---

## 🛰️ 4. STATE OF THE ART 2026

### Patrones state-of-the-art aplicables

| # | Patrón 2026 | Aplicación NOVAdesk |
|---|---|---|
| 1 | OpenAI Realtime API + cedar voice | Core de NOVA + Sofía |
| 2 | Function calling con tool routing (Claude Sonnet 4.5) | NOVA invoca tools del CRM, ITSM, WhatsApp |
| 3 | Multi-tenant Postgres + RLS | Supabase con tenant_id en JWT |
| 4 | RAG con pgvector por tenant | NOVA aprende del negocio del dueño |
| 5 | Edge deployment (Vercel + Railway LATAM) | Latencia <100ms |
| 6 | React Native (Expo) cross-platform | App mobile para Apple + Google |
| 7 | PWA + push web (iOS 16.4+) | Web app installable también |
| 8 | Outcome-based pricing | Add-on por ticket resuelto, cita confirmada |
| 9 | White-label config layer | Tenants premium tienen su marca |
| 10 | Embedded fintech (BNPL/payments) | Año 2: Stripe Connect + MercadoPago |

### Referentes (qué copiar / qué evitar)

#### 🟢 ServiceNow (líder ITSM)
- **Copiar:** workflow engine robusto, ITIL alignment, marca de "platform"
- **Evitar:** complejidad enterprise, $160/seat, 6-9 meses implementación

#### 🟢 Freshservice
- **Copiar:** ease of use score 9.2/10, AI Freddy embebido, time-to-value <1 mes
- **Evitar:** sin voice nativo, sin multi-vertical real, sin LATAM focus

#### 🟢 Vambe (LATAM hermano)
- **Copiar:** WhatsApp-first, AI agents para SMB, español nativo
- **Evitar:** solo chat, no tienen el "OS operacional" del dueño

#### 🟢 Capim (LATAM dental)
- **Copiar:** vertical pack profundo, BNPL embebido para dental
- **Evitar:** mono-vertical (limita TAM)

#### 🟢 OpenAI ChatGPT
- **Copiar:** UI dual voz+texto, "siempre disponible", cedar voice quality
- **Evitar:** horizontal genérico — NOVAdesk gana siendo vertical-specific

---

## 🪜 5. VERTICALIZACIÓN — Beachhead Selection

### Scoring matrix completa

| Criterio | Peso | 🎯 ITSM | 🦷 Dental | 💆 Estética | 🐶 Vet | 🏠 Inmob | 🍽️ Resto |
|---|---|---|---|---|---|---|---|
| Dolor cuantificado | 25% | 5 | 5 | 4 | 4 | 4 | 3 |
| WTP USD/mo | 20% | 5 ($199-799) | 5 ($199-499) | 4 ($99-349) | 4 ($99-399) | 4 ($149-599) | 3 ($49-199) |
| Tamaño accesible LATAM | 15% | 4 (50K empresas tech) | 5 (450K) | 5 (520K) | 4 (220K) | 4 (180K) | 5 (1.2M) |
| Distribución eficiente | 15% | 5 (TDX ya tiene leads) | 5 (gremios) | 4 (Instagram) | 4 (asociaciones) | 4 (portales) | 3 (saturado) |
| Competencia débil | 15% | 4 (Freshservice fuerte) | 5 (cero LATAM voice) | 5 (cero voice) | 5 (cero voice) | 4 | 2 (Toast/iFood) |
| Defensibilidad | 10% | 4 (lock-in con SLA) | 5 (BNPL embebido) | 4 (loyalty) | 4 (recurrente) | 4 (CRM lock) | 2 |
| **TOTAL** | | **🥇 4.50** | **4.95** | 4.45 | 4.20 | 4.10 | 2.85 |

### 🎯 Decisión final: **MVP = ITSM, expansion order = Dental → Estética → Vet → Inmob**

**Por qué ITSM primero (decisión estratégica del CEO):**
- ✅ TDX ya tiene el código 70% construido
- ✅ TDX tiene la red comercial (otras empresas tech LATAM)
- ✅ Flujos más estructurados (tickets, SLA, estados) → más fácil validar NOVA
- ✅ WTP más alto que pyme genérica ($199-799/mo)
- ✅ Resultados medibles (tiempo resolución, FCR, MTTR)

**Por qué dental segundo:**
- ✅ Score más alto (4.95) — el ganador puro
- ✅ Mercado LATAM 450K consultorios
- ✅ Sin competencia voice-first en español
- ✅ Use case probado (POC actual con TDX)

**Restaurantes descartado** (score 2.85): Toast/iFood/Rappi dominan, WTP bajo, margen low → no soporta voice cost.

---

## 🎯 6. SOLUTION DESIGN — Insight no obvio

### 🥇 Solución única: **NOVAdesk OS — "Voice-first Operations OS multi-vertical"**

```
INSIGHT CONTRARIAN (no obvio):
"En lugar de construir UN MEJOR helpdesk para empresas IT (Freshservice gana),
o UN MEJOR CRM dental (Capim gana), NOVAdesk construye UN ASISTENTE
QUE OPERA CUALQUIER vertical desde voz/chat. Los datos viven en un CRM
transversal único. La INTERFAZ es NOVA, no las pantallas. El dueño DELEGA,
no aprende. Las verticales son packs de 'qué tools puede usar NOVA'."

JOB QUE RESUELVE:
"Operar mi negocio sin aprender otro software" (functional)
"Sentirme en control sin estar abrumado" (emotional)
"Verme profesional como una empresa grande" (social)

WEDGE COMPETITIVO (las 6 dimensiones):
1. Voice-first nativo (vs Freshservice/Jira que son mouse-first)
2. Multi-vertical desde día 1 (vs Capim mono-vertical)
3. LATAM + WhatsApp (vs Toma/Avoca solo USA + phone)
4. Mobile-first con app nativa (vs todos solo web)
5. CRM transversal (vs todos CRM separado)
6. Admin multi-tenant out-of-the-box (vs todos requieren setup)

10x TEST:
- 10x más rápido onboarding (8 min voz vs 4 horas formularios)
- 10x menos clicks (delegás vs configurás)
- 10x más barato que stack tradicional ($149 vs $1,500 stack)

WOW MOMENT (90s):
Día 1: dueño descarga app, abre, NOVA dice "Hola, soy NOVA. Contame
qué hace tu negocio." En 8 min NOVA configura WhatsApp, agenda,
cobros, primer ticket de prueba.

DEFENSIBILIDAD:
- Data moat: cada conversación enriquece el RAG por tenant
- Network effect (futuro): marketplace de vertical packs comunitarios
- Switching cost ALTO: integraciones + RAG + workflows custom
- Brand: primero en categorizar "voice-first OS para pymes LATAM"

RIESGO PRINCIPAL:
Scope creep — querer 6 verticales en 6 meses. MITIGACIÓN: ITSM
sólido primero, después 1 vertical/mes.
```

---

## 📦 7. MVP, BUNDLES & MONETIZACIÓN

### 🧪 MVP Sprint actual (según llamada con Emma)

#### ✅ EN scope MVP — Fase 1 (Sprint 1-3, 6-8 semanas)

**Capa 1: ITSM completo (lo que ya casi tenemos)**
- Completar todos los módulos de gestión de tickets
- Pipeline tipo CRM para tickets (estados propios ITSM)
- Integración SLA + assets
- Reportes básicos

**Capa 2: NOVA Voice Agent (la novedad)**
- Web app con widget de chat dual (voz + texto, estilo OpenAI)
- "Hola, ¿en qué te ayudo?" con opción de hablar O escribir
- 12 tools básicos: create_ticket, update_ticket, search_tickets, send_notification, configure_sla, configure_user, etc.
- RAG con docs del tenant (KB ITSM)
- Backend Python en Railway

**Capa 3: CRM transversal (NUEVO según llamada)**
- Spine compartida: customers, interactions, contacts
- Pipeline básico (lead → cliente → activo → churned)
- Notas + tareas + actividad timeline

**Capa 4: Admin panel multi-tenant (NUEVO según llamada)**
- Gestión de tenants (registro, activación, suspensión)
- Membresías + planes + asignación verticales
- Pasarela pagos Stripe + MercadoPago
- Recurrencias + cobros automáticos
- Indicadores básicos por tenant

**Capa 5: Customer support para nosotros (insight de Emma)**
- Tixflow as-a-service: clientes pueden crear tickets a NOVAdesk
- Self-service docs

#### ❌ NO en MVP (anti-MVP explícito)

- ❌ Mobile app nativa (Fase 2, mes 5)
- ❌ Verticales dental/estética/vet/inmob (Fase 2-3)
- ❌ Voice agent embebido en WhatsApp IAB (defer)
- ❌ Push notifications PWA estilo CallKit (defer)
- ❌ Llamadas en vivo cliente↔empleado WebRTC (Fase 2)
- ❌ Marketplace de vertical packs (Fase 4)
- ❌ White-label profundo (themes, dominios custom) (Fase 3)
- ❌ Embedded BNPL (Año 2)
- ❌ Voice cloning (premium tier después de PMF)

#### 🎯 PMF signals a perseguir (Sprint 1-3)

| Métrica | Target Sprint 1 | Target Sprint 3 |
|---|---|---|
| Empresas tech onboarded ITSM | 3 (concierge) | 8-10 |
| Sean Ellis 40% test | n/a | 35% |
| North Star (AAT — acciones agente/tenant/mes) | 50 | 200+ |
| MRR | $0 (concierge) | $4K |
| Tickets creados via NOVA / total | 30% | 60%+ |

### 📦 BUNDLES (Vertical Packs framework)

**El modelo de pricing es POR VERTICAL PACK + USAGE.**

| Tier | Persona | Precio | Job | Incluye |
|---|---|---|---|---|
| **Starter** | Pyme 1-5 empleados | **$49/mo** | "Probar NOVA con 1 vertical" | 1 vertical, 1 user, 200 acciones NOVA, 500 WhatsApp, CRM básico |
| **Growth** ⭐ | Pyme 5-15 empleados | **$149/mo** | "Operar negocio completo" | 1 vertical, 5 users, 1500 acciones NOVA, 3000 WhatsApp, CRM completo, voice web, multi-canal, dashboard |
| **Scale** | Pyme/cadena 15-50 empleados | **$499/mo** | "Multi-vertical o multi-sede" | 3 vertical packs, 25 users, 5000 acciones NOVA, multi-tenant interno, app móvil, voice cloning, white-label |

#### 💰 Add-ons (NRR > 130%)

| Add-on | Precio |
|---|---|
| Vertical pack adicional | +$79/mo |
| Voice cloning del dueño | +$99/mo |
| Integración custom (Salesforce, SAP) | +$199/mo |
| Compliance pack (Habeas Data) | +$79/mo |
| Multi-language (en + pt) | +$99/mo |
| App móvil white-label propia | +$499/mo |

#### Outcome-based (Año 2)
- +$1 por ticket resuelto >SLA
- +$2 por cita confirmada y atendida
- +3% por cobranza efectiva BNPL embebido

---

## ✨ 8. WOW FACTOR — el momento mágico

### Activation moment (<90 segundos)

**Día 1, dueño nuevo de empresa IT:**

| Tiempo | Evento |
|---|---|
| 0s | Abre web/app, ve esfera NOVA pulsando + "Hola, soy NOVA" |
| 5s | NOVA: "¿En qué industria está tu negocio?" |
| 10s | Dueño: "Empresa de soporte IT" |
| 15s | NOVA: "Perfecto. Te activé el pack ITSM. ¿Cómo se llama tu empresa?" |
| 30s | NOVA: "¿Querés conectar el WhatsApp del negocio ahora?" |
| 60s | Dueño escanea QR, WhatsApp conectado |
| 80s | NOVA: "Listo. Cuando llegue el primer ticket por WhatsApp, te aviso." |
| 90s | Ticket de prueba creado, asignado, notificación enviada |

**El "wow":** En 90s, un dueño que NUNCA usó un helpdesk tiene su negocio configurado, conectado a WhatsApp, y atendiendo clientes. Sin tutoriales. Sin formularios.

### 3 Magic features

#### 🪄 Magic 1: NOVA Operator dual UI (voice + text)
Inspirado en ChatGPT Voice mode:
- Una caja de chat donde podés escribir O tocar mic
- NOVA responde por voz + texto simultáneamente
- "Si preferís escribir, puedes hacerlo en cualquier momento. Yo me adapto."

#### ⚡ Magic 2: Onboarding por voz en 8 minutos
- Sin formularios. Sin tutoriales. Solo conversación.
- NOVA detecta intent → llama tools → configura el negocio
- Comparado con Freshservice (4 horas setup) o ServiceNow (6 meses) → **30x más rápido**

#### 🎨 Magic 3: "Delegá tareas como a un humano"
- "NOVA, llamá al cliente del ticket #1234 y preguntale si está OK"
- "NOVA, mandá recordatorio a los 5 que no respondieron hoy"
- "NOVA, generame el reporte de SLA del mes y mandalo por mail al dueño"
- NOVA ejecuta, reporta back

### Demo de 2 minutos (guion para inversor)

```
[0:00-0:20] Setup
"Carlos tiene una empresa de soporte IT en Bogotá. 8 empleados.
Maneja 200 tickets/mes en planillas + WhatsApp + 1000 emails.
Pierde 3h/día solo en admin. Probó Freshservice — abandonó en 60 días.
Mira lo que hace con NOVA."

[0:20-0:50] Demo en vivo
[Mostrar móvil]
Carlos: "NOVA, dame status de hoy"
NOVA (voz): "Tenés 12 tickets abiertos, 3 vencidos. Cliente Banco
Caribe escaló por su servidor. ¿Querés que escale a Mariana?"
Carlos: "Sí, y mandale notificación al cliente"
NOVA: "Hecho. Mariana asignada, cliente notificado."

[0:50-1:30] El wow
[Mostrar WhatsApp del cliente]
Cliente: "Hola, mi servidor está caído"
[Sofía agente del cliente responde]
Sofía: "Hola Pedro. Voy a crear un ticket urgente. ¿Podés decirme
qué error estás viendo?"
[En la pantalla de Carlos, aparece el ticket con NOVA preguntando]
NOVA: "Carlos, nuevo ticket urgente de Pedro. ¿Asigno a Mariana?"
Carlos: "Sí"
[Todo el loop: <30 segundos, sin abrir ninguna pantalla más]

[1:30-2:00] El insight + cierre
"NO es CRM. NO es helpdesk. NO es chatbot. Es un OS DE OPERACIONES
controlado por voz, multi-vertical, mobile-first, LATAM-first.

Empezamos con ITSM. Plan: Q3 dental, Q4 estética + vet.

TAM LATAM: $3.5B. Inversión a PMF: $103K. Buscamos seed $1M."
```

### Tweetable moment

> *"Hablo con NOVA en mi celu y maneja toda mi empresa. Tickets, citas, cobros, WhatsApp. Sin abrir ni una pantalla. Esto cambió todo. @novadeskos"*

---

## 🧱 9. ARQUITECTURA TÉCNICA

### Diagrama de capas

```
┌────────────────────────────────────────────────────────────────────┐
│ CAPA 1: CLIENTES NOVAdesk                                           │
│                                                                     │
│   Web App (Next.js)        Mobile App (React Native, Fase 2)       │
│   - Dashboard tradicional   - Voice-first NOVA Operator            │
│   - Widget NOVA (voz+texto) - CallKit-like incoming notifications  │
│   - Admin panel             - Push proactivo                        │
└────────────────────────────────────────────────────────────────────┘
                              ↕ tRPC + WebRTC ↕
┌────────────────────────────────────────────────────────────────────┐
│ CAPA 2: NOVA CORE (Railway, FastAPI Python)                         │
│                                                                     │
│   ┌─────────────────────────────────────────────────────┐          │
│   │ NOVA Operator Agent (dueño del negocio)             │          │
│   │  Tools generales:                                    │          │
│   │   - configure_business                               │          │
│   │   - integrate_whatsapp                               │          │
│   │   - integrate_email                                  │          │
│   │   - create_user / configure_role                     │          │
│   │   - generate_report                                  │          │
│   │   - call_customer (WebRTC)                           │          │
│   │   - send_notification                                │          │
│   │  Tools por vertical (loaded por pack):               │          │
│   │   ITSM: create_ticket, assign, update_sla, etc.     │          │
│   │   Dental: schedule_appointment, send_quote, etc.    │          │
│   │   ...                                                │          │
│   └─────────────────────────────────────────────────────┘          │
│                                                                     │
│   ┌─────────────────────────────────────────────────────┐          │
│   │ Sofía Agent (cliente final del negocio)             │          │
│   │  Per-vertical prompts + RAG                         │          │
│   │  Canales: WhatsApp, Email, Voice web                │          │
│   └─────────────────────────────────────────────────────┘          │
│                                                                     │
│   - OpenAI Realtime API (gpt-realtime cedar)                       │
│   - Anthropic Claude (chat agent + reasoning)                       │
│   - Whisper (transcription fallback)                                │
│   - Eval harness (Langfuse)                                         │
└────────────────────────────────────────────────────────────────────┘
                              ↕ multi-tenant aware ↕
┌────────────────────────────────────────────────────────────────────┐
│ CAPA 3: DATA (Supabase Postgres + pgvector)                         │
│                                                                     │
│   • CRM SPINE (transversal todas verticales)                        │
│     - tenants, users, customers, contacts                           │
│     - interactions, notes, tasks                                    │
│     - lifecycle_stages                                              │
│                                                                     │
│   • VERTICAL TABLES (por vertical activa)                           │
│     - itsm: tickets, slas, assets, changes                          │
│     - dental: appointments, treatments, patients_dental             │
│     - estetica: services, products, loyalty_points                  │
│     - vet: pets, vaccinations, plans                                │
│     - inmob: properties, listings, visits                           │
│                                                                     │
│   • RAG (per tenant pgvector)                                       │
│     - knowledge_base (docs uploaded by tenant)                      │
│     - conversation_embeddings                                       │
│                                                                     │
│   • OPS (admin panel)                                               │
│     - subscriptions, payments, usage_metrics                        │
│     - vertical_packs (catalog), tenant_packs (assignments)          │
│                                                                     │
│   Row-Level Security por tenant_id en JWT                           │
└────────────────────────────────────────────────────────────────────┘
                              ↕ integrations ↕
┌────────────────────────────────────────────────────────────────────┐
│ CAPA 4: CHANNELS (cliente final del negocio)                        │
│                                                                     │
│   📱 WhatsApp Cloud API (chat + IAB voice)                         │
│   📧 Email (Resend)                                                │
│   🌐 Voice agent web (PWA)                                         │
│   📞 WebRTC live calls (cliente ↔ empleado)                        │
└────────────────────────────────────────────────────────────────────┘
                              ↕ third-party ↕
┌────────────────────────────────────────────────────────────────────┐
│ CAPA 5: INTEGRATIONS                                                │
│                                                                     │
│   - Google Calendar / Outlook                                       │
│   - Stripe + MercadoPago (subscriptions + outcome)                  │
│   - Meta WhatsApp Cloud API                                         │
│   - Background jobs: Inngest                                        │
│   - Observability: Sentry + Posthog + Langfuse                     │
└────────────────────────────────────────────────────────────────────┘
```

### Stack decisions (confirmadas con Emma)

| Capa | Stack | Justificación |
|---|---|---|
| Frontend web | Next.js 15 + RSC + Tailwind + shadcn | Velocidad iteración, SEO, edge deploy |
| Mobile (Fase 2) | React Native (Expo) | 1 codebase iOS+Android, react-native-callkeep |
| Backend NOVA Core | FastAPI Python en Railway | Reusa POC actual, async-native, latencia LATAM |
| DB + Auth | Supabase Postgres + RLS | Multi-tenant nativo, pgvector, branching |
| AI primary | OpenAI Realtime + Claude (reasoning) | Voice cedar + tool use Claude superior |
| Observability | Sentry + Posthog + Langfuse | Errores + funnels + AI evals |
| Payments | Stripe + MercadoPago | LATAM coverage |
| Background jobs | Inngest | Reliability sin K8s |
| Hosting | Vercel (web) + Railway (backend) + Apple/Google (mobile) | Confirmado por Freddy en llamada |

### Unit economics — Plan Growth $149/mo

| Concepto | Mensual |
|---|---|
| Revenue | $149 |
| OpenAI Realtime + tools (~600 acciones × $0.05 promedio) | $30 |
| Anthropic Claude (chat agent) | $8 |
| WhatsApp messages (3K × $0.005) | $15 |
| Supabase + Vercel + Railway prorated | $12 |
| Stripe fees (3%) | $4.50 |
| **COGS total** | **$69.50** |
| **Gross profit** | **$79.50** |
| **Gross margin** | **53%** |
| Target Q4 2026 (con caching + optimization) | **70%** |

### Breaking points

| # tenants | Lo que se rompe | Plan |
|---|---|---|
| 100 | OK single Railway | — |
| 500 | OpenAI rate limits | Multi-region OpenAI tier |
| 2K | Postgres single instance | Read replicas, sharding por país |
| 10K | Costo OpenAI | Negociar enterprise tier OpenAI + cache aggressive |
| 50K+ | Reescribir partial | Voice infra propia |

---

## 🏆 10. ROADMAP 30/60/90 DETALLADO + PLAN COMPLETO

### 🥇 Decisión final

> **Construir NOVAdesk OS empezando por completar ITSM como vertical MVP, sumar capa NOVA voice agent, CRM transversal, admin panel multi-tenant. Salir a vender ITSM mientras se construyen los siguientes verticales.**

**North Star Metric:** **Acciones del Agente por Tenant/Mes (AAT)**

**Leading indicators:**
1. % tickets/citas/operaciones creadas vía NOVA (vs UI tradicional)
2. Tasa de adopción voz vs texto en NOVA Operator

### 🗓️ Roadmap 9 fases × 2 meses = 18 meses a Series Seed

| Fase | Mes | Hito principal | Output medible |
|---|---|---|---|
| **F0 Setup** | M0 (1 sem) | Stack deployado staging | API responde, frontend compila |
| **F1 NOVA + ITSM** | M1-2 | NOVA Operator + ITSM completo + 12 tools | 3 clientes concierge, AAT >150 |
| **F2 Multi-canal + Admin** | M3-4 | WhatsApp + Email + Admin panel + 5 verticales speced | 10 piloto MSPs, $3K MRR |
| **F3 Mobile + Onboarding voz** | M5-6 | App React Native + Stripe billing + onboarding 8min voz | 30 tenants, $12K MRR |
| **F4 Vertical 2-3 (Dental + Estética)** | M7-8 | Pack YAML engine + 2 verticales pack + 60 tenants | $25K MRR, Sean Ellis 50%+ |
| **F5 Vertical 4-6 (Vet + Inmob + Trades)** | M9-10 | 6 verticales activas + white-label + reseller | 100+ tenants, $50K MRR |
| **F6 Expansión MX + AR** | M11-12 | Localización + GTM México + Argentina | 250 tenants, $100K MRR (Series Seed) |
| **F7 Embedded fintech (BNPL)** | M13-15 | Stripe Connect + cobranza outcome-based | $200K MRR, NRR 140% |
| **F8 Marketplace packs** | M16-18 | Vertical packs 3rd-party + reseller program escala | 1500 tenants, $600K MRR (Series A) |

---

### ⚠️ Top 3 riesgos y mitigación

| # | Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|---|
| 1 | **Scope creep** — querer 6 verticales antes de validar ITSM | Alta | Alto | Disciplina: 1 vertical/mes después de ITSM PMF, NO antes |
| 2 | OpenAI Realtime cost escalando >70% margin | Media | Medio | Cache aggressive + Anthropic alternative + outcome-based pricing |
| 3 | Competidor LATAM (Vambe/Mercately) escala más rápido | Media | Medio | Velocity de ejecución TDX + ITSM wedge único + lock-in vía CRM |

### 💸 Inversión

#### MVP (Sprint 0-3, 8 semanas)
| Concepto | $ |
|---|---|
| Freddy + Emma full-time (ya invertidos) | $0 |
| 1 dev voice/AI part-time | $8K |
| OpenAI + infra | $1.5K |
| Marketing inicial | $2K |
| Legal + payment setup | $1.5K |
| **TOTAL MVP** | **$13K** |

#### A PMF (6 meses)
| Concepto | $ |
|---|---|
| MVP cost | $13K |
| 1 dev senior LATAM full-time × 5 meses | $25K |
| 1 GTM operator part-time × 4 meses | $6K |
| 1 mobile dev × 2 meses | $10K |
| OpenAI + infra escalando | $12K |
| Meta ads + content | $15K |
| Legal + accounting | $5K |
| Buffer 20% | $17K |
| **TOTAL A PMF** | **$103K** |

**Hito que justifica seed $1-1.5M:** $25K MRR + 80 tenants + 50% Sean Ellis + NPS 50+ → seed para escalar GTM México + Argentina.

---

## 📚 11. APÉNDICES

### Hipótesis pendientes de validar (🔶)

1. 🔶 ¿La capa NOVA Operator funciona TAN BIEN para el dueño que justifica $149/mo? → Validar en concierge MVP
2. 🔶 ¿Los dueños ITSM realmente delegan acciones críticas a NOVA o quieren seguir clickeando? → Métrica: % acciones via NOVA
3. 🔶 ¿La transición ITSM → dental es smooth en arquitectura? → Validar Sprint 4
4. 🔶 ¿$149/mo es WTP correcto para Growth tier ITSM LATAM? → A/B test pricing
5. 🔶 ¿La app móvil mueve la aguja de adoption vs solo web? → Validar con beta users

### Preguntas para discovery (próximos clientes ITSM)

1. ¿Cuántos tickets/mes manejás hoy?
2. ¿Qué herramientas usás (Freshservice, Jira, planillas)?
3. ¿Cuánto tiempo del dueño/manager en admin operativa?
4. ¿Probarías delegar 60% de la gestión a un agente de voz?
5. ¿Qué pagarías por "operar el helpdesk hablándole al celu"?
6. ¿Cuál es tu ticket promedio resuelto y target SLA?
7. ¿Cuántos clientes finales atendés? ¿Por qué canales?

### Action Items inmediatos (esta semana)

- [ ] **Freddy:** Setup capa IA backend en Railway, complementar con info verticales + CRM + visión NOVA
- [ ] **Emma:** Finalizar validación módulos ITSM faltantes
- [ ] **Ambos:** Definir tools_spec.md con 12 tools v1 NOVA Operator
- [ ] **Ambos:** Definir alcance módulos para verticales 2-5 (no construir, solo specear)
- [ ] **Ambos:** Investigar competencia por vertical (CRM dental, vet, etc.)
- [ ] **Freddy:** Diseñar admin panel principal (membresías + tenants + verticales + pagos)
- [ ] **Emma:** Diseñar el chat de portal estilo OpenAI (dual voz+texto)

---

**FIN DEL ROADMAP DEFINITIVO — NOVAdesk OS Q2 2026**

> Construido sobre la llamada con Emma Castillo + 9 fases YC PM. Honestidad brutal: si Sprint 1-3 no entrega 3 clientes ITSM con 35% Sean Ellis, no agregar verticales — pivotar el approach NOVA.
