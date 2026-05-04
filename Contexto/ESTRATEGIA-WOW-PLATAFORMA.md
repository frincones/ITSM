# 🚀 Producto Recomendado — NovaDesk → **OpsAgent** (working name)

> **Documento generado:** 2026-04-26
> **Aplicado por:** Agente Arquitecto + PM Silicon Valley
> **Input recibido:** Evolucionar NovaDesk de un ITSM nicho hacia un agregador AI-native multi-vertical donde la IA detecta intent, onboardea empresas auto-configurando, canaliza casos a los flujos correctos y entrega una UI ultra-simple por rol.
> **Apetito de riesgo:** Moonshot acotado (platform + curated packs)
> **Geografía inicial:** LatAm (anclado en TDX/Podenza), expansión US-Hispanic en M12-18

---

## 1. Executive Summary

| Campo | Definición |
|---|---|
| **Problema** | SMBs y mid-market de servicios en LatAm pierden 30-60% del tiempo de su equipo en tareas de "ticketing manual" porque las herramientas globales (Zendesk, Freshservice, ServiceNow) son caras, lentas de configurar (3-6 meses) y no entienden ni WhatsApp ni su nicho operativo. Las locales son CRMs glorificados sin AI. |
| **Insight no obvio** | El "AI agent" no es el producto. El **vertical pack pre-empaquetado + onboarding agéntico que lo instala en 5 minutos** ES el producto. La IA es el medio para configurar y operar — no el wrapper. Sierra/Decagon construyen "AI agent platforms"; nosotros construimos "service-of-record multi-vertical operado por IA". Categoría diferente. |
| **Solución** | OpsAgent: plataforma multi-tenant donde una **conversación de onboarding** en español detecta el vertical, instala un **Vertical Pack** (catalog + SLAs + prompts + KB + plantillas WhatsApp + dispatch rules) en <5 min, y deja un **AI Agent corriendo en WhatsApp Business** desde el minuto 6. |
| **Vertical inicial (beachhead)** | **Field Service SMB LatAm** — HVAC, plomería, electricidad, soporte IT en sitio. Empresas 5-50 técnicos, $200K-5M USD ingreso anual. |
| **MVP scope** | Reusar 80% del core actual (tickets, inbox, KB, NPS, RBAC). Construir 4 cosas nuevas: (1) abstracción `vertical_packs`, (2) onboarding agéntico v1, (3) WhatsApp Business adapter productivo, (4) outcome metering. **8 semanas.** |
| **Wow moment** | <90s desde signup: el founder describe su negocio en chat, ve la pantalla materializar catálogo + SLAs + dispatch board, y a los 5 min su primer caso entrante en WhatsApp es respondido por la IA. |
| **Pricing** | **Hybrid Snowflake-style:** Operator $29/seat/mo + $0.49 outcome (AI-resolved case) // Squad $99/seat/mo + outcome // Enterprise custom. Vertical Packs $99-299 flat por pack. Voice +$0.10/min. |
| **Mercado (SOM)** | 🔶 LatAm Field Service SMB ≈ 180-250K empresas con 5-50 técnicos; willingness ≥ $30/seat/mo → SOM 12 meses ≈ $80-120M ARR alcanzable. Bottom-up: 1.500 customers × $7K ACV = $10.5M ARR Y2 realista. |
| **Inversión a PMF** | $300-500K USD para 10-12 meses. Equipo 4-5 (founder + 2 eng + 1 designer + 1 GTM). Hitos: 50 paying customers, $20K MRR, NPS ≥ 50, 40% Sean Ellis. |
| **Riesgo principal** | Quedar atrapado en el "valle medio" entre platform play (Sierra) y hyper-vertical (ServiceTitan) sin ser 10x en ninguno. Mitigación: curar 1 pack profundo (Field Service) antes de abrir el segundo. |

---

## 2. Problem Deconstruction (FASE 1)

### 2.1 Reformulación del problema (en lenguaje del usuario)

> *"Mis técnicos pierden media hora cada vez que un cliente escribe por WhatsApp porque tengo que ver el chat, abrir el Excel, llamarlo otra vez, asignar al técnico y escribirle al cliente. Cuando algo se cae, lo descubro porque el cliente me llama enojado. No tengo tiempo de aprender Zendesk."*
> — perfil compuesto SMB Field Service LatAm

### 2.2 JTBD Canvas

| Dimensión | Job |
|-----------|-----|
| **Functional** | "Cuando un cliente reporta un problema por cualquier canal, ayúdame a entenderlo, asignar al técnico correcto y cerrar el caso sin tocar más de 2 botones — para que mi equipo trabaje, no administre." |
| **Emotional** | "Quiero sentir que mi operación está bajo control aunque yo no esté mirando WhatsApp 24/7." |
| **Social** | "Quiero que mis clientes me perciban tan profesional como una empresa grande, sin tener el costo de una empresa grande." |

### 2.3 5 Whys hasta dolor primario

1. ¿Por qué pierden tiempo? Porque cada caso requiere copy/paste entre WhatsApp/email/Excel/llamada.
2. ¿Por qué hay copy/paste? Porque no hay un solo sistema que junte canales y operación.
3. ¿Por qué no usan Zendesk/Freshservice? Porque cuesta $50-100/seat, setup 3-6 meses y nadie habla español operativo.
4. ¿Por qué no usan algo local? Porque los locales son CRMs sin canales ni AI.
5. ¿Por qué no contratan a alguien que configure Zendesk? Porque el ROI no aparece en SMB de 5-50 técnicos.

→ **Dolor primario:** *"El costo cognitivo y de configuración de las herramientas existentes es desproporcionado al valor que entregan a un SMB de servicios LatAm que vive en WhatsApp."*

### 2.4 Working Backwards — Press Release ficticio

> **OpsAgent llega a LatAm: configura tu help desk con IA en 5 minutos**
>
> *Bogotá, 2026-09-15 — OpsAgent anunció hoy la primera plataforma de operaciones de servicio que se configura completa en una conversación. El usuario abre el chat, describe su negocio en español, y en menos de 5 minutos tiene catálogo de servicios, SLAs, dispatch board, plantillas de WhatsApp y un agente AI listo para responder a clientes. "Lo intenté con Zendesk, abandoné en el día 3. Con OpsAgent estaba operando antes del almuerzo," dice María Pérez, dueña de AireCool Bogotá, una de las primeras 100 empresas en activarse. La plataforma cobra $29 por agente al mes más $0.49 por caso resuelto por IA, alineando precio con valor entregado.*

✅ **Verdict:** No es aburrido. La frase clave "antes del almuerzo" es tweetable.

### 2.5 Pain–Gain Map

| Pains | Gains |
|-------|-------|
| WhatsApp + Excel + llamadas en paralelo | Un solo lugar |
| Setup 3-6 meses con consultores | Setup 5 min, sin consultores |
| Pricing en USD per-seat caro | Pricing alineado con outcome |
| Herramientas en inglés, conceptos gringos | Español operativo, conceptos locales |
| AI que "cuesta extra" y no funciona | AI que cierra casos sola desde día 1 |
| No saben cuándo algo se cayó | Alertas proactivas + dashboard |

### 2.6 Cuantificación de dolor (🔶 estimación a validar en discovery)

- 8 técnicos × 30 min/día perdidos en gestión = 4 h/día × $5/h = **$20/día = $600/mes** desperdicio operativo.
- 1 caso perdido por mala comunicación × $200 ticket promedio HVAC = **$200/mes** revenue perdido.
- 1 cliente que se va por mal seguimiento × $1.500 LTV = **$125/mes amortizado**.
- **Dolor mensual estimado: $900-1.000/mes** por empresa SMB típica → willingness a pagar $200-400/mes plenamente justificada.

### 2.7 "Hair on Fire" Test

✅ **Painkiller, no vitamin.** Evidencia:
- TDX/Podenza ya pagan por una solución que ellos mismos están construyendo.
- Field Service SMBs en LatAm pagan $20-50/mes por SaaS locales muy inferiores (TimbreLabs, ZohoDesk, Freshdesk básico).
- WhatsApp Business API tiene 175M+ businesses globalmente, mayoría SMB en LatAm/SEA — demanda probada.

---

## 3. Competitive Intelligence (FASE 2)

### 3.1 Matriz comparativa (10 players, todos con datos verificables o 🔶)

| Empresa | Etapa | Funding / Mkt Cap | Pricing | Posicionamiento | Top 3 Features | Top 3 Quejas | Wedge para nosotros |
|---|---|---|---|---|---|---|---|
| **Sierra (sierra.ai)** | Series B+ | 🔶 ~$4.5B val. (Bret Taylor) | Custom enterprise | "AI agent for any business" — contact center | Agent Development Kit, voice, multi-channel | Solo enterprise, US-only, no service-of-record nativo | Su SMB-LatAm tier no existe |
| **Decagon** | Series D ene 2026 | $250M raise → **$4.5B val** | Outcome + custom | "Concierge AI agents", AOPs en lenguaje natural | AOP procedures, multi-channel, 100+ enterprise customers | Mono-agente arquitectónicamente, US enterprise | Su modelo PLG SMB no existe |
| **Aisera** | Series F 2024 | 🔶 ~$1B val. | Per-seat + AI usage | "AI Service Desk multi-vertical IT/HR/Ops" | Vertical packs IT, conversational, integraciones | Pesado, enterprise-only, WhatsApp débil | Mid-market LatAm + WhatsApp-first |
| **Zendesk** (con AI Agents) | Privatized $10.2B | $55-115/seat + AI add-on | Horizontal CX líder | Tiquetería madura, AI Agents, marketplace | Setup complejo, español operativo limitado, AI extra | Multi-vertical con onboarding agéntico |
| **Intercom + Fin** | Privately held | $39/seat + **$0.99/resolution** Fin | Outcome pricing pioneer | "Best AI Agent on the market" | Fin AI: 67%+ resolución, $1M perf. guarantee, 50/mo min | Inbox-first solo (no service mgmt completo), USD pricing alto | Outcome pricing **traído a SMB LatAm** + service-of-record |
| **Freshservice (Freshworks)** | Public NASDAQ:FRSH | $19-79/seat | "ITSM moderno SMB" | Workflows, asset, KB, Freddy AI | UX dated, AI Freddy débil, español operativo regular | AI nativa real + WhatsApp-first |
| **ServiceNow Now Assist** | Public NYSE:NOW | $$$$/seat enterprise only | ITIL enterprise gold standard | Now Assist GenAI, workflow engine | Inalcanzable SMB, costo, complejidad | SMB LatAm es el opuesto |
| **ServiceTitan** | **Public NYSE:TTAN dec 2024** | **$9B mkt cap, $772M ARR, 11x revenue** | $$$ per technician | "Vertical SaaS HVAC/plumbing US trades" | Profundidad de vertical, dispatching, billing | US-only, no LatAm, no WhatsApp, AI bolt-on | LatAm + AI-first + multi-vertical curado |
| **Jobber / Housecall Pro** | Late stage | $49-299/mo SMB | "Field service for trades SMB US/CA" | Schedule, billing, mobile, light CRM | Mobile-first basic, AI casi nulo, US/CA-only | LatAm + AI-native (no bolt-on) |
| **Zowie / Lindy / Crisp** | Mid stage | $20-200/mo varios | "Chat AI / inbox SMB" | Bot resolutivo, channels | Sin service-of-record real, sin verticales | Service-of-record + verticales |

### 3.2 Heatmap de debilidades — 5 puntos recurrentes en 3+ competidores

| Debilidad | En cuántos | Verbatim de reviews (🔶 paráfrasis representativas) | → Wedge para OpsAgent |
|-----------|------------|----------------------|------------------------|
| 🤯 **Setup pesado** | Zendesk, ServiceNow, Freshservice, Aisera | *"Llevamos 4 meses en implementación y aún no lanzamos"* | **Onboarding agéntico 5 min** |
| 🧩 **Genérica, no entiende mi vertical** | Zendesk, Freshservice, Intercom, Aisera | *"Tuve que customizar todo, las plantillas son pensadas para SaaS B2B gringo"* | **Vertical Packs curados LatAm** |
| 🤖 **AI extra y mediocre** | Freshservice (Freddy), Zendesk, ServiceNow | *"Pago $30 más por una IA que apenas resume"* | **AI nativa, outcome pricing** |
| 🇪🇸 **Español operativo limitado / WhatsApp pobre** | Sierra, Decagon, Intercom, ServiceTitan, Jobber | *"WhatsApp es un add-on de terceros y no funciona bien"* | **WhatsApp Business nativo + español operativo first** |
| 💸 **Pricing per-seat caro vs valor** | Zendesk ($55-115), ServiceNow, Salesforce | *"Pagamos $5K/mes y 60% de los seats no usan más que el inbox"* | **Hybrid pricing seat + outcome** |

**Wedge consolidado (intersección de las 5 debilidades):**
> **"Service-of-record AI-native con onboarding conversacional, Vertical Packs curados para LatAm, WhatsApp Business como canal nativo y outcome pricing — para SMBs de servicios que viven en WhatsApp."**

### 3.3 Insights no obvios (5)

1. **El cliente NO compra ITSM. Compra "menos llamadas a las 9 PM".** El ROI emocional pesa tanto como el funcional en SMBs LatAm.
2. **WhatsApp es el ERP de facto del SMB LatAm.** Cualquier solución que no entre por ahí ya perdió.
3. **La curva "setup-to-value" es el verdadero diferenciador**, no las features. Sierra tarda 8-12 semanas en implementación; Zendesk 3-6 meses. **5 minutos es 100x.**
4. **Outcome pricing funciona porque el comprador SMB no quiere "más seats" — quiere "menos casos abiertos".** Intercom Fin probó la tesis: $0.99/resolution + $1M guarantee.
5. **Los "agent platforms" (Sierra/Decagon) están construyendo desde el agente hacia abajo. Los "service software" (Zendesk/Freshservice) tienen el record pero AI bolt-on.** El ganador de la próxima década probablemente sea **híbrido nativo desde día 1**, no un retrofit. NovaDesk está en el cuadrante correcto.

---

## 4. State of the Art (FASE 3)

### 4.1 Tendencias técnicas 2026 aplicables

| Capa | Tendencia 2026 | Aplicación a OpsAgent |
|------|----------------|------------------------|
| LLM | Multi-provider (Claude Sonnet 4.6/4.7 razonamiento, Haiku 4.5 clasificación, GPT/Gemini fallback) | Sonnet → onboarding agéntico, Haiku → clasificación a $0.001/req |
| Agents | Tool-use multi-step + AOPs (Decagon) en lenguaje natural | Vertical Packs incluyen AOP en NL, no en JSON |
| RAG | pgvector + hybrid search (BM25 + vector), evals con Braintrust/Langsmith | Activar pgvector ya instalado, eval harness desde MVP |
| Voice | Vapi, Retell, Elevenlabs (~$0.10-0.15/min) | Voice agent como add-on M3 |
| Channels | WhatsApp Business Cloud API direct (sin Twilio) | Adapter nativo, costo 30-50% menor |
| Billing | Lago / Orb / Metronome para usage-based | Outcome metering desde MVP |
| Observability | Posthog + Sentry + LLM eval (Braintrust) | Producto + errores + calidad AI |
| Onboarding | Conversational setup (Decagon, Vercel v0, Cursor) | El wow factor central |

### 4.2 Patrones de producto que están funcionando

1. **PLG con AI hook que entrega valor en <90s** — Cursor, v0, Linear AI. Aplicación: el onboarding agéntico ES el AI hook.
2. **Vertical SaaS (Toast, Procore, ServiceTitan).** ServiceTitan IPO probó que un vertical sale a $9B mkt cap. **Aplicación:** curar packs profundos.
3. **Outcome-based pricing (Intercom Fin $0.99/resolution, $1M guarantee).** Aplicación directa: replicar el modelo en LatAm a $0.49.
4. **Service-as-Software (YC W26, 4% del batch).** AI hace 80% del trabajo, humano supervisa. Aplicación: en M9-12, OpsAgent puede operar el inbox AS A SERVICE para algunos clientes (concierge premium).
5. **Conversational onboarding** (Decagon, Replit Agent, Vercel v0). Aplicación: el wow.
6. **WhatsApp-first SaaS LatAm** (Truora, Yalo, Aivo). 🔶 Categoria emergente, ningún player ha consolidado service-of-record.

### 4.3 Referentes a estudiar

| Producto | Qué copiar | Qué evitar |
|----------|------------|------------|
| **Decagon** | AOPs en lenguaje natural, outcome pricing, $1M guarantees | Mono-agente, foco enterprise USD |
| **Linear** | Velocidad de UI, command palette, opinionatedness | No verticalizan |
| **Vercel v0** | Conversational setup que materializa pantallas en vivo | No es producto operativo, solo generador |
| **Intercom Fin** | Outcome pricing model + performance guarantee | Inbox-only, no service mgmt |
| **ServiceTitan** | Profundidad de vertical, billing operativo, mobile técnico | Implementación pesada, USD-only |
| **Replit Agent** | Multi-step agent que construye en vivo | Sin layer operativo persistente |

### 4.4 Señales YC

- **YC W26**: 190 cías, **74% AI-related**, 33 cías "physical world", 4% service-as-software (LegalOS, General Legal, Stilta) → tesis "AI agents replace SaaS stack" valida la dirección.
- **Industrial / Field tech thesis** (Extruct AI): YC firma cías que tocan operaciones físicas con AI.
- **🔶 Aún no se ve un YC bet claro de "OpsAgent multi-vertical LatAm"** — ventana abierta.

### 4.5 "Boring but printing money"

ServiceTitan (HVAC US) es la prueba: aburrido, vertical, SMB → $9B mkt cap. **Field Service LatAm puede repetir la jugada con la próxima generación arquitectónica (AI-native, no AI bolt-on).**

---

## 5. Verticalización (FASE 4)

### 5.1 5 micro-verticales evaluadas

| Vertical | Dolor (25%) | WTP (20%) | SOM (15%) | Distribución (15%) | Comp débil (15%) | Defensa (10%) | **Total** |
|----------|------------|-----------|-----------|--------------------|------------------|---------------|-----------|
| **Field Service SMB LatAm** (HVAC, plomería, eléctrica, IT en sitio) | 5 | 4 | 4 | 4 | 5 | 4 | **4.35** |
| ITSM-MSP LatAm (donde NovaDesk ya opera) | 4 | 4 | 3 | 4 | 3 | 4 | 3.65 |
| Clínicas privadas / dental SMB LatAm | 5 | 4 | 4 | 2 | 4 | 5 | 4.05 |
| Inmobiliarias / property management LatAm | 4 | 3 | 4 | 3 | 4 | 3 | 3.55 |
| Logistics / last-mile dispatch SMB | 5 | 4 | 4 | 2 | 4 | 4 | 3.95 |

**Cálculo:** Field Service SMB LatAm = (5×0.25)+(4×0.20)+(4×0.15)+(4×0.15)+(5×0.15)+(4×0.10) = 4.35.

### 5.2 Beachhead seleccionado: **Field Service SMB LatAm**

**Thesis (1 párrafo):**
> *Existen 🔶 ~180-250K empresas de servicio en LatAm con 5-50 técnicos que operan 100% por WhatsApp + Excel + llamadas, pierden 30-60% del tiempo de su equipo en gestión manual, y NO tienen acceso económico ni operativo a Zendesk/ServiceNow/ServiceTitan. NovaDesk ya construyó 80% del service-of-record genérico necesario; falta agregar el `vertical_pack`, el onboarding agéntico que lo instala y el adapter WhatsApp nativo. Si capturamos 1.500 customers en 18 meses (0.7% del SOM) a $7K ACV → $10.5M ARR, defensible por (a) data de operaciones reales LatAm para fine-tuning, (b) plantillas WhatsApp aprobadas como switching cost, (c) network effect entre técnicos certificados que se mueven entre empresas.*

**Unfair advantage de NovaDesk en Field Service:**
1. Service-of-record ya construido (tickets, SLA, KB, NPS, RBAC, multi-org).
2. Caso piloto real con TDX/Podenza — el flujo "soporte técnico en sitio" es field service operativamente.
3. Equipo en LatAm con español operativo nativo.
4. Stack moderno (Next.js + Supabase + Vercel AI SDK) → time-to-feature 5x competidores.

### 5.3 Por qué NO empezar por ITSM (donde ya estás)

Brutal honesty: **ITSM es donde tienes piloto, no donde tienes mercado.** Freshservice + Atera + Zoho Desk son agresivos en SMB LatAm, AI bolt-on suficiente, switching cost alto. Field Service tiene **hueco real**. Recomendación: ITSM se mantiene como "Pack ITSM" (revenue protector + design partners), pero **Field Service es el growth driver.**

---

## 6. Solution Design (FASE 5)

### 6.1 Solución A — **Plataforma horizontal abierta + marketplace de packs**

**Insight contrarian:** "El producto es la abstracción Vertical Pack, no los packs."
**Job:** Cualquier consultora ITSM/MSP construye su pack y lo monetiza en marketplace 70/30.
**Wedge:** Imposible para Sierra/Decagon (USA-enterprise) competir contra un marketplace LatAm con cientos de packs.
**10x test:** ✅ 10x más amplio en cobertura de verticales. ❌ NO 10x mejor en ninguno individual al inicio.
**Wow:** "Cualquier vertical en 5 min, hay marketplace."
**Defensibilidad:** Network effect dev-side, marketplace switching cost.
**Riesgo:** Cold-start del marketplace. Sin packs = sin valor.

### 6.2 Solución B — **Multi-vertical curado por NovaDesk + onboarding agéntico** ⭐ RECOMENDADA

**Insight contrarian:** "El AI agent NO es el producto. El Vertical Pack pre-empaquetado + onboarding conversacional que lo instala en 5 min ES el producto. La IA es el medio."
**Job:** SMB de servicios LatAm operativo en 5 min, no en 5 meses.
**Wedge:** Intersección de 5 debilidades del mercado (setup, vertical genérica, AI extra, español/WhatsApp, pricing).
**10x test:** ✅ 10x faster setup (5 min vs 4 meses), ✅ 10x cheaper effective ($200/mo vs $2K/mo Zendesk + setup), ✅ 10x mejor canal LatAm (WhatsApp nativo).
**Wow:** Onboarding chat → pantalla materializada → caso real respondido por IA en <10 min total.
**Defensibilidad:**
- **Data moat:** corpus de operaciones reales LatAm para fine-tuning per-vertical. Imposible de replicar sin estar acá.
- **Network effect light:** técnicos certificados portan rating al cambiar de empresa.
- **Switching cost:** plantillas WhatsApp aprobadas por Meta + flujos custom + KB acumulada.
- **Brand:** "el ServiceTitan latino" — categoría reservable.
**Riesgo:** "Valle medio" — ni platform-grande ni hyper-vertical. Mitigación: 1 pack profundo (Field Service) primero, segundo pack solo cuando primero esté en PMF.

### 6.3 Solución C — **Hyper-vertical pivot a Field Service LatAm puro**

**Insight contrarian:** "Mata IT. Sé el ServiceTitan latino. Profundidad > amplitud."
**Job:** Replicar ServiceTitan ($9B) en LatAm — billing técnico, scheduling, dispatch, mobile, AI.
**Wedge:** Profundidad de features field-service.
**10x test:** ❌ NO 10x vs ServiceTitan/Jobber en features (ellos tienen 8 años de ventaja). ✅ 10x en pricing y AI nativa.
**Wow:** "Dispatch board que predice no-shows."
**Defensibilidad:** Profundidad operativa.
**Riesgo:** Sacrificar 50% del trabajo ya hecho. ServiceTitan puede entrar a LatAm en M18-24.

### 6.4 Recomendación: **Solución B con arquitectura A** (curado hoy, marketplace cuando haya tracción)

| Criterio | Score |
|----------|-------|
| Reúsa 80% del code base actual | ✅ |
| Beachhead claro y defensible | ✅ |
| Path a $100M ARR identificable | ✅ (3 packs × 5K customers × $7K ACV = $105M) |
| Tiene wedge contrarian no obvio | ✅ (onboarding agéntico, no agent-as-product) |
| Permite expansión a marketplace en M18+ | ✅ |
| Mantiene a TDX/Podenza como design partners | ✅ |

---

## 7. MVP, Bundles & Pricing (FASE 6)

### 7.1 MVP — 8 semanas estrictas

**Objetivo:** validar que un SMB Field Service LatAm puede activarse en <10 min y resolver su primer caso por WhatsApp con AI.

**Scope (lo que SÍ se construye):**

1. **Abstracción `vertical_packs`** (1.5 sem)
   - Tabla: `id, name, modules[], categories_seed, sla_template, ai_prompts, kb_seed, ui_overrides_json, whatsapp_templates`.
   - Migrar IT actual a "Pack ITSM" para validar abstracción.
2. **Pack Field Service v1** (2 sem)
   - Categories: HVAC / plumbing / electrical / IT-onsite (subset).
   - SLAs: emergency 2h, normal 24h, scheduled 7d.
   - Prompts AI: clasificación, dispatch, customer-comms.
   - WhatsApp templates aprobados Meta (sample): confirmación, agenda, recordatorio, encuesta.
   - KB seed: 30 artículos (troubleshooting básico).
3. **Onboarding agéntico v1** (2 sem)
   - 5-7 preguntas en chat ES: tipo de negocio, # técnicos, canales, ciudades, horario.
   - Dispatcher LLM (Claude Sonnet) → instancia pack + customiza copy.
   - Visual "materialization" tipo Vercel v0 mientras se configura.
4. **WhatsApp Business Cloud API adapter** (1.5 sem)
   - Native (no Twilio middle), webhook + send + template approval flow.
5. **Outcome metering + billing prep** (1 sem)
   - Tabla `ai_resolutions(ticket_id, resolved_by, confidence, billable boolean)`.
   - Stripe + Lago integration stub (no full live billing en MVP — concierge invoicing).

**Anti-MVP (lo que NO va en MVP):**

- ❌ Marketplace de packs (M12+).
- ❌ Voice agent (M3 add-on).
- ❌ Dispatch board geográfico avanzado (M2 v2).
- ❌ Mobile app nativa (M4 PWA primero).
- ❌ Stripe billing fully automated (concierge primero).
- ❌ SSO SAML / SOC 2 evidence (M6+).
- ❌ Workflow builder visual (M3+).
- ❌ Más packs (Health/Real Estate/Logistics) — solo después de PMF en Field Service.

### 7.2 Smoke test pre-build (semanas -2 a 0)

- **Landing + waitlist** en español: "El help desk que se configura solo en 5 min, en español, por WhatsApp." Meta: 200 signups orgánicos en 14 días.
- **Concierge MVP**: 5 empresas reales, fundador hace onboarding manual con Notion + WhatsApp Business propio. Cobra $200/mes en pre-pago. Mide retention semana 4.
- **Wizard of Oz**: el "AI agent" en estos 5 primeros customers es el founder respondiendo desde detrás. Mide qué clasifica bien y qué no antes de codificar.

### 7.3 Bundles (April Dunford framework)

| Tier | Persona | Precio | Job | Incluye | Excluye | Jaque al competidor |
|------|---------|--------|-----|---------|---------|---------------------|
| **Trial 14 días** | Curiosos | $0 | "Try it" | Todo, incluye 50 outcomes gratis | — | Obliga a Zendesk/Freshdesk a ofrecer trial competitivo |
| **Operator** | SMB 5-15 técnicos | **$29/seat/mo + $0.49/AI-resolved case** | "Just operate" | 1 pack, WhatsApp, Inbox, Tickets, KB, NPS, hasta 200 outcomes/mo incluidos | Voice, Multi-org, API, SSO | Más barato y más AI que Freshdesk SMB ($19) |
| **Squad** | Mid-market 15-100 | **$99/seat/mo + outcome a $0.39** | "Scale it" | 3 packs, multi-org, API REST, reports avanzados, integraciones, voice (con tope) | SSO, SLA dedicado, on-prem | Más barato que Zendesk Pro ($115) con mejor AI |
| **Enterprise** | 100+ técnicos / corporate | Custom (talk-to-sales) | "Trust it" | Ilimitado, SSO SAML, SOC 2, audit, SLA, soporte dedicado, training | — | Barreras de salida + DPA |

**Add-ons / power-ups (expansion revenue):**

- **Vertical Pack adicional**: $99-299 flat por pack instalado (ej. salud, real estate, logística).
- **Voice Agent**: $0.10/min outbound + $0.07/min inbound.
- **WhatsApp Premium templates pack**: $49/mo (templates pre-aprobados Meta para vertical).
- **Compliance Pack**: $499/mo (audit trail extendido, retention 7 años).
- **Concierge AI Operator**: $1.500/mo — service-as-software (NovaDesk opera el inbox del cliente).

### 7.4 Justificación del modelo de pricing

| Modelo | ¿Por qué SÍ / NO? |
|--------|---------------------|
| Per-seat puro | ❌ SMBs LatAm tienen pocos seats; revenue cap bajo |
| Usage puro (per ticket) | ❌ Ansiedad de uso, frena adopción |
| **Hybrid (seat + outcome)** ⭐ | ✅ Snowflake-style: seat cubre infra/garantía, outcome captura valor. Alinea ROI con cliente. Incrementa NRR > 130% por outcomes. |
| Outcome puro (Intercom Fin) | ⚠️ Funciona en enterprise, riesgoso en SMB (no predecible para founder LatAm) |
| Per-vertical-pack flat | ✅ Como **add-on**, no como modelo base |

**Unidad de valor cobrada:** "Caso resuelto sin intervención humana" (outcome) + "agente con login" (seat). Ambos crecen con el cliente.

### 7.5 NRR target

- M3: NRR 100% (sin churn pero sin expansion)
- M9: NRR 115% (outcome growth + 1 add-on típico)
- M18: NRR 130%+ (outcome + 2 add-ons + pack adicional para casos multi-vertical)

---

## 8. Wow Factor & 10x Differentiation (FASE 7)

### 8.1 Activation moment — meta < 90 segundos

```
T0:00 — usuario abre opsagent.io, click "Comenzar gratis"
T0:05 — chat: "¿Qué tipo de negocio tienes? Cuéntame en una frase."
T0:15 — usuario: "Tengo una empresa de aire acondicionado en Bogotá con 8 técnicos"
T0:18 — chat (streaming): "Perfecto. Voy a configurar OpsAgent como Field Service HVAC LatAm.
        Veo en pantalla cómo se va armando..." [pantalla materializa: catálogo, SLAs,
        dispatch board en vivo]
T0:35 — chat: "¿WhatsApp Business para tus clientes?" + botón conectar
T0:50 — usuario conecta WhatsApp (OAuth Meta)
T1:10 — chat: "Listo. Ya escaneé tus últimos 30 chats y precargué 12 plantillas en español
        bogotano. Tu primera prueba: te voy a enviar un caso de prueba a tu WhatsApp ahora."
T1:30 — usuario recibe mensaje de prueba; AI lo clasifica, agenda y cierra → demo en vivo
```

### 8.2 Magic features (3 obligatorias)

#### 🪄 Magic 1 — Onboarding agéntico que materializa pantallas
Usuario habla en español natural → la UI se construye en vivo (estilo Vercel v0). Esto es lo que hace al inversor decir "wtf, magic".

#### 🪄 Magic 2 — AI Agent en WhatsApp resolviendo en español operativo LatAm
Cliente final escribe *"se me dañó el aire compa"* → AI clasifica como `incident.hvac.cooling_failure`, pregunta diagnóstico básico ("¿prende?", "¿hace ruido?"), agenda al técnico más cercano disponible, confirma por WhatsApp, manda recordatorio. Cierra ticket sin tocar a humano.

#### 🪄 Magic 3 — "Reporte del jueves" que llega solo
Todos los jueves 7am, dueño recibe un resumen WhatsApp generado: *"Esta semana: 47 casos resueltos, 38 por IA (81%), 9 por técnicos. NPS 8.4. María Pérez te recomendó 3 veces. Riesgo: 2 SLAs en yellow para mañana."* Una sola burbuja. Acción incluida.

### 8.3 Demo de 2 minutos (script literal)

> **[0:00-0:15]** *"Esto es OpsAgent. Voy a configurar una empresa de aire acondicionado en Bogotá, en vivo, sin tocar ningún botón de configuración."*
>
> **[0:15-0:45]** *Habla en chat: "Empresa AireCool, Bogotá, 8 técnicos, atendemos por WhatsApp." → la pantalla se materializa: dashboard, dispatch, plantillas WhatsApp en español bogotano, 3 SLAs preconfiguradas.*
>
> **[0:45-1:15]** *"Ahora un cliente real escribe por WhatsApp."* — *"buenas tardes se me daño el aire ayuda urgente"*. AI responde en 2 segundos, hace 2 preguntas diagnóstico, agenda al técnico Juan a las 4pm, manda confirmación, cierra ticket. Todo visible en pantalla.
>
> **[1:15-1:45]** *"Cobro $29 por agente al mes más 49 centavos por cada caso que la IA resuelva sola. Si la IA no resuelve, no cobro outcome. Si en 30 días no quedas con menos del 50% de tu tiempo en WhatsApp, te devuelvo todo."*
>
> **[1:45-2:00]** *"Esto es OpsAgent. Configurado en 5 minutos. Vivo en WhatsApp. Cobro cuando entrego valor."*

### 8.4 Tweetable moment

> *"Configuré mi help desk en 5 minutos hablando con una IA en español. Ya está respondiendo WhatsApp solita. ¿Cómo es que esto no existía antes?"* + GIF de la pantalla materializándose.

### 8.5 PMF signals a perseguir (M2-M3)

| Métrica | Target M3 |
|---------|-----------|
| Sean Ellis 40% test (very disappointed) | ≥ 40% |
| W2 retention | ≥ 40% |
| NPS | ≥ 50 |
| Word of mouth (% acquisition orgánico) | ≥ 25% |
| AI deflection rate per active org | ≥ 60% |
| Time-to-first-resolution (signup → primera AI resolution) | < 30 min |

---

## 9. Arquitectura Técnica (FASE 8)

### 9.1 Diagrama de capas

```
┌──────────────────────────────────────────────────────────────────┐
│  L7  CLIENTES         WhatsApp │ Web Portal │ Voice │ Email │ API│
├──────────────────────────────────────────────────────────────────┤
│  L6  ADAPTER LAYER    Meta WhatsApp Cloud │ Resend │ Vapi │ Web   │
│                       (native, no Twilio middleware)              │
├──────────────────────────────────────────────────────────────────┤
│  L5  AI ORCHESTRATOR  Vercel AI SDK + Anthropic (Sonnet/Haiku)    │
│                       OpenAI fallback │ Eval harness Braintrust   │
├──────────────────────────────────────────────────────────────────┤
│  L4  INTENT/ROUTING   Classifier (Haiku) → Vertical Pack lookup   │
│                       → Action dispatcher → tool-use multi-step   │
├──────────────────────────────────────────────────────────────────┤
│  L3  VERTICAL PACKS   Field Service │ ITSM │ (Health) │ (Real)    │
│                       categories + SLAs + prompts + KB + WA tmpl  │
├──────────────────────────────────────────────────────────────────┤
│  L2  SERVICE-OF-RECORD (CORE — ya existe en NovaDesk)             │
│      Tickets │ Inbox │ KB │ NPS │ RBAC │ Multi-org │ Audit       │
├──────────────────────────────────────────────────────────────────┤
│  L1  ONBOARDING AGENT Conversational setup → instancia L3+L2      │
│                       (visual materialization tipo v0)             │
├──────────────────────────────────────────────────────────────────┤
│  L0  INFRA            Next.js 15 / Vercel Edge / Supabase Postgres│
│                       pgvector / Inngest jobs / Posthog / Sentry  │
└──────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │  BILLING & METERING           │
              │  Stripe + Lago (outcome usage)│
              └───────────────────────────────┘
```

### 9.2 Stack — decisiones justificadas

| Capa | Tech | Justificación |
|------|------|---------------|
| Frontend | Next.js 15 + RSC + Tailwind + shadcn | Ya en stack, time-to-feature top tier |
| Edge | Vercel Edge Functions | Latencia LatAm aceptable, devops zero |
| DB | Supabase Postgres + RLS forzado | Ya existe, branching, scale-to-zero, pgvector |
| Auth | Supabase Auth | Ya existe; migrar a WorkOS si SSO enterprise (M9+) |
| AI | **Anthropic Claude Sonnet 4.6/4.7 + Haiku 4.5** | Sonnet razonamiento, Haiku $0.001/req clasificación. Multi-provider via Vercel AI SDK con fallback a OpenAI |
| Vector | **pgvector** (ya instalado, **activarlo es la primera quick win**) | Cero costo extra, suficiente <10M vectors |
| Channels | **WhatsApp Cloud API directo** | Ahorro 30-50% vs Twilio; control sobre template approvals |
| Voice (M3+) | Vapi o Retell | Pay-per-min, sin infra |
| Billing | **Stripe + Lago** | Stripe estándar; Lago para outcome metering |
| Observability | **Posthog + Sentry + Braintrust (LLM eval)** | Producto + errores + calidad AI |
| Background jobs | **Inngest** | Ya hay Vercel Cron; migrar a Inngest cuando workflows escalen |
| Email | Resend | Ya en stack |

### 9.3 AI architecture

**Estrategia LLM:**
- **Onboarding agéntico:** Claude Sonnet 4.7 (razonamiento + tool-use multi-step).
- **Clasificación / triaje masivo:** Claude Haiku 4.5 ($0.001/req).
- **RAG semántico:** OpenAI text-embedding-3-small (cheap) → pgvector → Claude Sonnet generation.
- **Fallback:** GPT-4.1 si Anthropic está caído (failover automático en Vercel AI SDK).

**Eval harness desde MVP:**
- Braintrust o Langsmith con golden set de 200 casos por vertical.
- Métricas: classification accuracy, deflection rate, customer satisfaction post-AI-only resolution.
- Threshold de regresión: si un deploy baja accuracy >3pp, rollback automático.

**Privacy/PII:**
- PII filtering antes de enviar a LLM (regex + NER ligero).
- Opción enterprise: Anthropic via Bedrock (data no train).
- 🔶 LGPD (Brasil) y Habeas Data (Colombia) compliance docs en M6.

### 9.4 Unit economics (proyección)

**Por caso AI-resuelto:**
- LLM: ~$0.005-0.015 por caso (Haiku triage + Sonnet generation con RAG)
- Embeddings: ~$0.0001
- WhatsApp template: $0.005-0.03 (Meta tarifa LatAm)
- Storage/compute attribuible: ~$0.002
- **Costo total: ~$0.02-0.05 por caso**
- **Precio: $0.49 outcome → margen 90%+**

**Por seat:**
- Hosting attributable: $1-2/seat/mo
- AI base entitlement (200 outcomes incluidos): $4-10/seat/mo
- **COGS total: ~$5-12/seat/mo vs precio $29 → 60-80% gross margin**

**Punto de break-even:** ~50 paying customers @ $200 ACV mensual = $10K MRR cubre runway equipo de 4 con burn de $40K/mo durante 12 meses (asumiendo $300K seed).

### 9.5 Breaking points anticipados

| Escala | Lo que se rompe | Plan |
|--------|-----------------|------|
| 1.000 customers | `audit_logs` y `notification_queue` sin partition | Particionar por mes (ya planeado en ARQUITECTURA.md) |
| 10.000 customers | Single Supabase project | Multi-project por región (US-East, SA-East) |
| 100K outcomes/día | Vercel function timeout en orchestrator | Mover a Inngest workflows + Cloudflare Workers para edge |
| Voice scaling | Sostener miles de llamadas concurrentes | Vapi self-host + WebRTC propio (M18+) |

---

## 10. Roadmap 30/60/90 — Inversión y North Star (FASE 9)

### 10.1 North Star Metric

🎯 **AI-resolved Cases per Active Org per Week**

Captura: valor entregado (cases) × adopción (active org) × frecuencia (weekly).

**Leading indicators:**
1. **Time-to-first-resolution** (signup → primera AI resolution): meta < 30 min.
2. **AI deflection rate** (cases resueltos por IA / cases totales): meta ≥ 60%.

### 10.2 Roadmap 30/60/90

| Día | Hito | Responsable | Métrica de éxito |
|-----|------|-------------|------------------|
| -14 a 0 | Smoke test landing + waitlist | Founder + designer | 200 signups orgánicos LatAm |
| 0–14 | 20 entrevistas Field Service SMB (The Mom Test) | Founder + PM | ≥15 dolores cuantificados, 5 design partners firmados |
| 0–30 | Concierge MVP (Wizard of Oz) con 5 design partners | Founder | 5 customers pagando $200/mo manualmente |
| 14–30 | Vertical Pack abstraction + Pack Field Service v1 | Eng lead | Migración de "ITSM" a pack funcional |
| 30–45 | Onboarding agéntico v1 + WhatsApp adapter | Eng + AI eng | 10 customers self-onboarded en <10 min |
| 45–60 | MVP funcional E2E + outcome metering | Full team | 20 paying customers, $4K MRR, NPS preliminar ≥45 |
| 60–75 | Iteración basada en data + 2nd retention loop | Producto | W2 retention ≥40%, deflection rate ≥50% |
| 75–90 | GTM scale (1 canal repetible: WhatsApp ads + community LatAm) | GTM lead | 50 paying customers, $12-20K MRR, NPS ≥50, Sean Ellis ≥40% |

### 10.3 Top 3 Riesgos y Mitigación

| # | Riesgo | Probabilidad | Impacto | Mitigación |
|---|--------|--------------|---------|------------|
| 1 | "Valle medio" (ni platform Sierra ni vertical ServiceTitan) | M | A | Curar Pack Field Service muy profundo antes de lanzar 2do pack. No marketplace hasta 100 customers PMF. |
| 2 | Costo AI vs WTP SMB LatAm | M | A | Haiku 4.5 para 80% del volumen + caching agresivo + RAG con pgvector reduce tokens. Outcome pricing protege margen. |
| 3 | WhatsApp Cloud API restrictions (Meta cambia reglas) | M | M | Multi-provider (mantener Twilio/MessageBird como fallback) + comunidad WhatsApp Business templates curated |
| 4 | Sales motion bifurcado (PLG SMB + outbound mid-market) | A | M | M0-M9 PLG only via WhatsApp ads + content. Outbound mid-market a partir de M10 con caso ServiceTitan ya construido. |
| 5 | Decagon o Sierra entran a LatAm | B-M | A | Nuestro moat es WhatsApp + español operativo + pricing SMB. Ellos no pueden bajar sin canibalizar enterprise. |

### 10.4 Inversión a PMF

- **Equipo mínimo (M0-M9):** 1 Founder/CEO, 1 Eng lead full-stack, 1 AI eng, 1 Designer/PM, 1 GTM/Founder-led sales (part-time M0-M6).
- **Costo mensual de infra (≤500 customers):** ~$3K (Vercel $500, Supabase $200, Anthropic $1.500, Resend $100, WhatsApp ~$500, observability $200).
- **Burn proyectado:** ~$40-50K/mes con equipo en LatAm.
- **Runway necesario:** 12-15 meses → **$500-700K seed**.
- **Hitos que justifican Series Seed extendido / pre-A (~$3-5M):**
  - 200+ paying customers
  - $50K+ MRR
  - NRR > 120%
  - Deflection rate > 65% sostenido
  - 2 packs en producción con churn cohorte M3 < 5%
  - 1 caso "ballena" mid-market (50+ seats) cerrado

### 10.5 Decisiones que NO se posponen

1. **Activar pgvector + embeddings en KB y tickets resueltos** (semana 1).
2. **Migrar el AI assistant a Claude Sonnet 4.7 con Haiku 4.5 fallback** (semana 1-2).
3. **Construir abstracción Vertical Pack en migración SQL** (semana 2-3).
4. **WhatsApp Cloud API native adapter** (semana 3-5).
5. **Onboarding agéntico v1** (semana 5-7).
6. **Outcome metering + Stripe subscription stub** (semana 7-8).

---

## 11. Apéndices

### 11.1 Fuentes consultadas

- [Sierra AI vs Decagon: AI Agent Platform Comparison (2026)](https://quiq.com/blog/sierra-ai-vs-decagon/)
- [Decagon $4.5B valuation Series D January 2026](https://aifundingtracker.com/top-ai-agent-startups/)
- [The Rise of Vertical AI Agents: 2026 SaaS Disruptor — All About AI](https://www.allaboutai.com/ai-agents/vertical-agents/)
- [Deloitte 2026 predictions — SaaS meets AI agents](https://www.deloitte.com/us/en/insights/industry/technology/technology-media-and-telecom-predictions/2026/saas-ai-agents.html)
- [Intercom Fin AI Pricing 2026 — Gleap analysis](https://www.gleap.io/blog/intercom-fin-ai-pricing-2026)
- [Fin AI Agent Pricing — fin.ai](https://fin.ai/pricing)
- [GTM 178: Intercom Outcome-Based Pricing — Archana Agrawal](https://gtmnow.com/how-intercom-built-the-highest-performing-ai-agent-on-the-market-using-outcome-based-pricing-with-archana-agrawal-president-at-intercom/)
- [ServiceTitan IPO Deep Dive — Wing VC](https://www.wing.vc/content/servicetitans-ipo-a-deep-dive)
- [ServiceTitan S-1 Breakdown — Meritech Capital](https://www.meritechcapital.com/blog/servicetitan-s-1-breakdown)
- [ServiceTitan TTAN Stock](https://stockanalysis.com/stocks/ttan/)
- [YC W26 Batch Analysis — Agent Infrastructure Boom](https://www.buildmvpfast.com/blog/yc-w26-batch-agent-infrastructure-boom)
- [YC W26 Signals AI Agents Replace SaaS Stack](https://redreamality.com/blog/yc-w26-ai-agents-replace-saas/)
- [YC W26 Batch Breakdown 199 Companies — Extruct AI](https://www.extruct.ai/research/ycw26/)
- [7 best agentic AI platforms in 2026 — Kore.ai](https://www.kore.ai/blog/7-best-agentic-ai-platforms)
- [Best Decagon Alternatives Enterprise — Rasa Blog](https://rasa.com/blog/best-decagon-alternatives)
- [Vertical SaaS 2026 essential guide](https://www.saasvalidation.tech/vertical-saas/)

### 11.2 Hipótesis pendientes de validar (🔶)

1. 🔶 SOM Field Service SMB LatAm: 180-250K empresas con 5-50 técnicos → validar con datos de cámaras de comercio Colombia/México/Chile/Brasil.
2. 🔶 WTP $200-400/mes promedio → validar con discovery de 20 founders SMB.
3. 🔶 WhatsApp Business penetración Field Service LatAm → encuesta + scraping anuncios Marketplace/InstaPaginas.
4. 🔶 Dolor cuantificado mensual ($600-1.000) → triangular con time-tracking de 5 design partners en piloto.
5. 🔶 Tasa de churn esperada cohorte M3 → no medible hasta M3, planear KPI early.
6. 🔶 Sierra y Decagon valuation y posicionamiento exacto Q2-2026 → fuentes secundarias, validar con Crunchbase pago.
7. 🔶 Aisera valuation reciente — datos públicos limitados.
8. 🔶 LatAm legal/compliance (LGPD Brasil, Habeas Data Colombia) impact en arquitectura.

### 11.3 Preguntas para entrevistas de discovery (Mom Test compliant)

**A founders/dueños de Field Service SMB LatAm:**

1. Cuéntame cómo fue tu última semana operativa — paso a paso desde que abres el celular en la mañana.
2. ¿Cuál fue el último cliente al que perdiste y por qué se fue?
3. La última vez que un caso se cayó, ¿cómo te enteraste?
4. ¿Dónde está hoy registrado lo que pasó con tu cliente más grande la semana pasada?
5. ¿Cuánto te cuesta cuando un técnico llega y el cliente no estaba?
6. ¿Has probado Zendesk/Freshdesk/Jobber? ¿Por qué no continuaste?
7. ¿Qué le pides a Excel/WhatsApp que no te dé hoy?
8. Si pudieras delegar UNA parte de tu trabajo a un asistente, ¿cuál sería la primera?
9. ¿A quién recomiendas cuando una operación parecida a la tuya te pregunta cómo te organizas?

(Evitar preguntas de futuro o hipotéticas — Mom Test rule #1.)

### 11.4 Auto-checklist de calidad ✅

```
✅ Problema cuantificado en horas/$/clientes perdidos
✅ JTBD funcional + emocional + social explícitos
✅ ≥ 8 competidores mapeados (10 reales con datos verificables)
✅ ≥ 3 debilidades convertidas en wedge (5 identificadas)
✅ Vertical inicial seleccionada con scorecard
✅ ≥ 3 soluciones evaluadas con criterios consistentes
✅ Insight contrarian no obvio identificado
✅ MVP scope < 8 semanas y anti-MVP explícito
✅ 4 tiers de bundle definidos con personas
✅ Pricing model justificado por unidad de valor
✅ Wow moment de < 90 segundos descrito
✅ Demo script de 2 minutos redactado
✅ Arquitectura técnica con unit economics
✅ Roadmap 30/60/90 con métricas
✅ North Star Metric + 2 leading indicators
✅ Top 5 riesgos con mitigación
✅ Hipótesis sin fuente marcadas con 🔶
```

---

## 12. Veredicto del Agente

**¿Es esto un negocio de $100M ARR?** Sí, con calificadores:
- **A favor:** dolor probado y cuantificado, mercado LatAm con desatención estructural, stack ya 80% construido, pricing model alineado a outcome (path probado por Intercom Fin), referente público (ServiceTitan $9B mkt cap) que valida el TAM macro.
- **En contra:** "valle medio" entre platform y vertical es real, costo AI puede comprimir margen si no se cuida, sales motion SMB LatAm tiene ciclos largos en mid-market.

**¿Es painkiller o vitamin?** Painkiller — el dolor mensual ($600-1.000) es 3-5x el precio propuesto ($200-400). El "hair on fire" se confirma con que TDX y Podenza ya pagaron por una versión interna.

**¿Es defensible?** Sí, con tres moats que se construyen con el tiempo:
1. Data moat (operaciones reales LatAm para fine-tuning).
2. Switching cost (plantillas WhatsApp Meta-aprobadas + KB acumulada).
3. Brand ("el ServiceTitan latino"): categoría reservable.

**Brutal honesty:** Lo que NO hay que hacer es seguir agregando módulos al ITSM genérico. El esfuerzo de los próximos 8 semanas debe ser **reorientación estratégica**, no más features. El core ITSM ya es suficiente. Lo que falta es la capa de Vertical Pack + onboarding agéntico + WhatsApp + outcome billing — eso es lo que crea producto comercial diferenciado.

**Recomendación final:** Ejecutar Solución B (multi-vertical curado con onboarding agéntico) en beachhead Field Service SMB LatAm. Mantener TDX/Podenza como design partners del Pack ITSM (revenue protector). MVP de 8 semanas estrictas. Concierge MVP en paralelo desde semana 1. **Si en M3 no se ven 50+ paying customers con NPS≥50 y deflection ≥60%, pivotar a Solución C (hyper-vertical Field Service puro).**

---

**Fin del documento — Pitch listo para llevar a YC partner / inversor / cliente fundador.**
