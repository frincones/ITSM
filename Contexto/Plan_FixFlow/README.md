# 🚀 NOVAdesk OS — Documentación Definitiva

> **Producto:** Voice-first Operations OS multi-vertical para pymes LATAM.
> **Origen:** Llamada Freddy + Emma (29 abril 2026, 37 min) + 9 fases YC PM.
> **Estado:** Roadmap aprobado, listo para Sprint 1.

---

## 📚 Estructura de la documentación

| # | Documento | Para qué sirve | Cuándo leer |
|---|---|---|---|
| 1 | **`00-ROADMAP-DEFINITIVO.md`** | Visión completa, 9 fases YC, executive summary, blueprint estratégico | **AHORA** — leer completo |
| 2 | **`01-SPRINT-1-DETALLADO.md`** | Tareas concretas semana 1-3, código, schemas SQL, 12 tools NOVA | Antes de codear |
| 3 | **`02-VERTICAL-PACKS-REFERENCE.md`** | Spec detallada de 5 verticales (ITSM, dental, estética, vet, inmob) + YAML templates | Cuando arranquemos vertical 2+ |
| 4 | **`03-PRICING-FINANCIALS-GTM.md`** | Pricing tiers, unit economics, projections 24m, GTM 4 fases, hiring, cap table | Para fundraising + decisiones revenue |

---

## 🎯 La visión en 1 párrafo

NOVAdesk OS es **el primer Sistema Operativo voice-first multi-vertical para pymes LATAM**. El dueño del negocio interactúa con NOVA (agente voz/chat) que opera todo: tickets, citas, clientes, WhatsApp, cobros, reportes. El cliente final del negocio interactúa con Sofía (agente voz/chat) por WhatsApp/email/voice web. Empezamos con **ITSM** (la vertical que ya está casi lista en TDX) y expandimos a Dental → Estética → Vet → Inmobiliaria. CRM transversal compartido entre todas. Web + Mobile. Multi-tenant white-label. **Inversión a PMF: $103K en 6 meses. Target: $25K MRR + raise seed $1M Q4 2026.**

---

## ⚡ Quick start — qué hacer esta semana

### Día 1-2 (Lunes-Martes)
- [ ] **Freddy:** Setup Railway + FastAPI base + endpoint `/health`
- [ ] **Emma:** Setup Next.js 15 + Vercel staging + Supabase project
- [ ] **Ambos:** Review final del roadmap, alinear scope Sprint 1

### Día 3-5 (Miércoles-Viernes)
- [ ] **Freddy:** Schema completo en Supabase (ver `01-SPRINT-1-DETALLADO.md`)
- [ ] **Emma:** Audit ITSM actual vs gaps identificados, lista de qué falta
- [ ] **Ambos:** Definir 12 tools NOVA Operator v1 + spec en código

### Semana 2
- [ ] Implementar NOVA Operator backend con 8 tools ITSM
- [ ] Construir NovaWidget UI dual (voz + texto) en frontend

### Semana 3
- [ ] Onboard 3 empresas tech LATAM en concierge MVP
- [ ] Métricas baseline + iteración

---

## 🎯 Las 3 decisiones clave que tomamos en la llamada

### 1. **MVP = ITSM, no dental** ✅
TDX ya tiene 70% del código. Tiene la red comercial. Flujos estructurados ideales para validar NOVA. Después expandir a verticales emocionales.

### 2. **Dual UI voz + texto desde día 1** ✅
Como ChatGPT — "si preferís escribir, podés en cualquier momento, yo me adapto". El dueño elige.

### 3. **Admin panel multi-tenant es PRODUCTO core, no afterthought** ✅
Membresías + verticales asignadas + pagos + recurrencias. Sin esto, no podemos onboardear escala.

---

## 📊 Las 5 métricas que vamos a obsesionar

| Métrica | Definición | Target Sprint 3 | Target Mes 6 |
|---|---|---|---|
| **AAT** (North Star) | Acciones NOVA por tenant/mes | >150 | >500 |
| **% via NOVA** | % operaciones via agente vs UI | >30% | >60% |
| **Sean Ellis 40%** | "¿Decepción si NOVA dejara de existir?" | 35% | 50% |
| **MRR** | Monthly Recurring Revenue | $4K | $25K |
| **NPS** | Net Promoter Score | 40 | 60 |

---

## 🚨 Las 3 reglas brutales (no negociables)

### 1. **Disciplina de scope.**
NO construir vertical 2 hasta tener PMF en ITSM (Sean Ellis ≥35%). Tentación enorme de saltar a dental "porque es más sexy". Resistir.

### 2. **Dual UI siempre.**
Cada feature debe pensarse para que NOVA pueda hacerla por voz/texto. Si solo se puede hacer clickeando, no es NOVAdesk OS, es otro CRM.

### 3. **Tenant isolation primero.**
RLS desde día 1. Nada de "después lo aseguramos". Cada query debe pasar por tenant_id en JWT. Sin excepciones.

---

## 💰 Stack confirmado (sin cambios)

| Capa | Tech | Estado |
|---|---|---|
| Frontend Web | Next.js 15 + Vercel | ✅ Confirmado |
| Mobile (Fase 2) | React Native + Apple/Google | ✅ Confirmado |
| Backend AI | FastAPI Python en Railway | ✅ Confirmado |
| DB + Auth | Supabase Postgres + RLS | ✅ Confirmado |
| AI primary | OpenAI Realtime + Anthropic Claude | ✅ Confirmado |
| Payments | Stripe + MercadoPago | ✅ Confirmado |
| WhatsApp | Meta Cloud API directo (sin BSP) | ✅ Reuso de POC |

---

## 🗓️ Timeline visual

```
Sprint 0 (S1):     Setup stack
Sprint 1 (S2-3):   NOVA + ITSM completion + 8 tools
Sprint 2 (S4-5):   Multi-canal + Admin panel + WebRTC live
Sprint 3 (S6-8):   Polish + 3 clientes concierge MVP
                    │
                    ▼
Mes 3:  Vertical Dental (+5 clínicas) → 8 tenants total
Mes 4:  Vertical Estética (+5 spas) → 15 tenants
Mes 5:  Mobile App React Native beta
Mes 6:  Vet + Inmob → 30 tenants, $25K MRR
                    │
                    ▼
Q4 2026: Raise seed $1M, expansión México
Q1 2027: 6 verticales, 200 tenants
Q2 2027: White-label + reseller, 500 tenants, $200K MRR
```

---

## 🎬 Próximos pasos inmediatos

1. **Hoy:** Freddy y Emma leen los 3 docs completos
2. **Mañana:** 30 min review call para alinear y resolver dudas
3. **Pasado mañana:** Empezamos Sprint 0

---

## 📞 Contactos del proyecto

- **Freddy Rincones** — Tech lead + AI + backend
- **Emma Castillo** — Frontend + ITSM module + product
- **TDX SAS** — Entidad legal + WABA + clientes existentes

---

## 🔗 Documentos relacionados (de iteraciones previas)

Los docs de NOVAdesk anteriores (WhatsApp IAB, PWA, voice agent dental) **siguen siendo válidos como módulos** que podemos integrar:

- Voice agent IAB de WhatsApp → será **Sofía Web** (Sprint 2)
- PWA con push outbound → Año 2, expansion para clientes finales
- Voice cloning ElevenLabs → add-on premium tier Scale
- Schema multi-tenant Supabase → ya integrado en este sprint

---

**FIN README — NOVAdesk OS Documentación Definitiva**

> Listos para construir. La visión está clara, el roadmap detallado, las decisiones tomadas. **Es momento de ejecutar.**
