# 💰 NOVAdesk OS — Pricing, Financials & Go-To-Market

> **El cuarto pilar del roadmap: cómo ganamos dinero, cuánto cuesta operar, y cómo conseguimos clientes.**
>
> Documento 4 de 4. Complemento a 00-Roadmap, 01-Sprint, 02-VerticalPacks.

---

## 💵 1. PRICING DEFINITIVO — Tiered + Add-ons + Outcome

### Filosofía: el pricing expresa VALOR CAPTURADO, no costo de infraestructura.

El dueño paga por:
1. **Acciones NOVA ejecutadas** (delegación de operación)
2. **Canales activos** (WhatsApp + email + voice)
3. **Contactos gestionados** (CRM size)
4. **Verticales activadas** (depth de la operación)

### 🏷️ Tiers principales (per tenant, USD/mo)

| Plan | Precio | Persona | Vertical | Users | NOVA acciones/mo | WhatsApp msgs | Contactos | Canales | Soporte |
|---|---|---|---|---|---|---|---|---|---|
| **Starter** | **$49** | Pyme 1-5 empleados | 1 | 1 | 200 | 500 | 500 | WhatsApp solo | Email |
| **Growth** ⭐ | **$149** | Pyme 5-15 empleados | 1 | 5 | 1,500 | 3,000 | 5,000 | WhatsApp + Email + Voice web | WhatsApp 8h |
| **Scale** | **$499** | Pyme 15-50 empleados | 3 | 25 | 5,000 | 10,000 | 25,000 | Multi-canal + App móvil | CSM dedicado |

### 🛒 Add-ons (revenue expansion)

| Add-on | Precio | Persona target |
|---|---|---|
| Vertical pack adicional | +$79/mo | Multi-negocio |
| Voice cloning del dueño | +$99/mo | Growth+ |
| Integración custom (Salesforce, SAP, ERP) | +$199/mo | Scale |
| Compliance pack (Habeas Data, GDPR) | +$79/mo | Scale |
| Multi-language (en + pt) | +$99/mo | Scale |
| App móvil white-label propia | +$499/mo | Scale enterprise |
| **NOVA acciones extra (paquete 1K)** | +$29/mo | Growth heavy |
| **WhatsApp messages extra (paquete 5K)** | +$15/mo | Heavy users |

### 🎯 Outcome-based pricing (Año 2)

| Outcome | Precio |
|---|---|
| Ticket resuelto dentro de SLA | +$1 |
| Cita confirmada y atendida | +$2 |
| Cobranza efectiva (BNPL embebido) | +3% del monto |
| Lead convertido a cliente activo | +$10 |

### 💼 Reseller / White-label (B2B2B Año 1-2)

| Modelo | Detalles |
|---|---|
| **Reseller básico** | 25% comisión MRR de clientes referidos. NOVAdesk maneja billing. |
| **White-label completo** | Reseller paga $999/mo + $39/sub-tenant. Su marca, su billing. NOVAdesk solo infra. |
| **Agency partner** | 50% comisión año 1, 30% año 2+. Min 5 clientes para activación. |

---

## 📊 2. UNIT ECONOMICS DETALLADAS

### Costo por tier (mensual, blended)

#### Starter ($49)
| Concepto | $ |
|---|---|
| Revenue | $49.00 |
| OpenAI Realtime + Anthropic (200 acciones × $0.04) | $8.00 |
| WhatsApp (500 msgs × $0.005) | $2.50 |
| Supabase + infra prorated | $3.50 |
| Stripe fees (3%) | $1.50 |
| **COGS** | **$15.50** |
| **Gross profit** | **$33.50** |
| **Margin** | **68%** |

#### Growth ⭐ ($149) — el sweet spot
| Concepto | $ |
|---|---|
| Revenue | $149.00 |
| OpenAI + Anthropic (1500 acc × $0.04) | $60.00 |
| WhatsApp (3000 msgs × $0.005) | $15.00 |
| Voice web infra (~30h × $0.20) | $6.00 |
| Supabase + Vercel + Railway | $12.00 |
| Stripe fees (3%) | $4.50 |
| **COGS** | **$97.50** |
| **Gross profit** | **$51.50** |
| **Margin** | **35%** ⚠️ |
| **Margin Q4 2026 con caching + optim** | **60-65%** ✅ |

⚠️ **Acción:** Q3 2026 priorizar prompt caching + voice token reduction para subir margin Growth a 60%.

#### Scale ($499)
| Concepto | $ |
|---|---|
| Revenue | $499.00 |
| OpenAI + Anthropic (5000 acc × $0.04) | $200.00 |
| WhatsApp (10000 × $0.005) | $50.00 |
| Voice web heavy (~80h) | $16.00 |
| Multi-tenant infra | $30.00 |
| Stripe fees | $15.00 |
| **COGS** | **$311.00** |
| **Gross profit** | **$188.00** |
| **Margin** | **38%** ⚠️ |

### CAC + LTV proyectado

| Métrica | Mes 6 (PMF) | Mes 12 (Seed) | Mes 24 (Series A) |
|---|---|---|---|
| Avg ARPU/mo | $130 | $160 | $220 |
| Gross margin (blended) | 50% | 65% | 72% |
| **Gross profit/mo per tenant** | $65 | $104 | $158 |
| Avg churn rate (monthly) | 8% | 4% | 2.5% |
| **Customer LTV** | $812 | $2,600 | $6,320 |
| Avg CAC (paid + content + sales) | $250 | $280 | $400 |
| **LTV:CAC ratio** | 3.2x ✅ | 9.3x 🚀 | 15.8x 🚀 |
| Payback period | 4 meses | 2.7 meses | 2.5 meses |

---

## 📈 3. FINANCIAL PROJECTIONS — 24 MESES BOTTOM-UP

### Tenants + MRR ramp-up

| Mes | Verticales activas | Tenants nuevos/mes | Total tenants | Avg ARPU | **MRR** | Cumulative ARR |
|---|---|---|---|---|---|---|
| M1 | ITSM (concierge) | 3 | 3 | $0 | $0 | $0 |
| M2 | ITSM | 3 | 6 | $99 | $594 | $7K |
| M3 | + Dental | 8 | 14 | $115 | $1,610 | $19K |
| M4 | + Estética | 12 | 26 | $128 | $3,328 | $40K |
| M5 | (mobile launch) | 15 | 41 | $135 | $5,535 | $66K |
| M6 | + Vet + Inmob | 25 | 66 | $145 | $9,570 | **$115K** |
| M7 | | 30 | 96 | $150 | $14,400 | $173K |
| M8 | | 35 | 131 | $155 | $20,305 | $244K |
| M9 | (México launch) | 50 | 181 | $158 | $28,598 | $343K |
| M10 | | 60 | 241 | $160 | $38,560 | $463K |
| M11 | | 70 | 311 | $162 | $50,382 | $605K |
| M12 | (Argentina launch) | 90 | 401 | $165 | $66,165 | **$794K** |
| M15 | + Embedded fintech | 120 | 776 | $200 | $155,200 | $1.86M |
| M18 | + Marketplace packs | 150 | 1,226 | $230 | $282K | $3.4M |
| M21 | (US Hispanic) | 180 | 1,766 | $250 | $441K | $5.3M |
| M24 | | 200 | 2,366 | $275 | $651K | **$7.8M ARR** |

### Costos operativos (P&L mensual proyectado)

| Período | Headcount | Salarios LATAM/mo | Infra + AI | Marketing | Total OPEX | MRR | Burn / Profit |
|---|---|---|---|---|---|---|---|
| M1 | 2 founders | $0 | $400 | $500 | $900 | $0 | -$900 |
| M3 | + 1 dev | $3K | $1,200 | $1,500 | $5,700 | $1,610 | -$4,090 |
| M6 | + 1 GTM + 1 dev | $7K | $4,500 | $4,000 | $15,500 | $9,570 | -$5,930 |
| M9 | + 1 customer success | $11K | $9,000 | $7,000 | $27K | $28,598 | +$1,600 ✅ |
| M12 | 8 personas total | $20K | $18K | $12K | $50K | $66K | +$16K |
| M18 | 18 personas | $55K | $45K | $30K | $130K | $282K | +$152K |
| M24 | 35 personas | $130K | $110K | $80K | $320K | $651K | +$331K |

### Cash flow + Funding milestones

| Hito | Mes | Cash needed | Total raised | Founders dilution acumulada |
|---|---|---|---|---|
| **Pre-seed F&F** | M0 | $230K | $230K | 8% |
| **Bootstrap break-even** | M9 | $0 | $230K | 8% |
| **Seed** | M12 | $1.5-3M | $1.7-3.2M | 22-28% |
| **Series A** | M24 | $10-15M | $11.7-18.2M | 35-45% |
| **Series B (futuro)** | M36+ | $30-50M | — | 50-55% |

---

## 🚀 4. GO-TO-MARKET STRATEGY (4 fases)

### 🎯 Fase 1 — Concierge MVP (M1-2): "Lighthouse customers"

**Objetivo:** 3 clientes ITSM pagando por concierge gratis primer mes.

**Canales:**
- Network personal de Freddy (TDX clients existentes + warm intros)
- LinkedIn outreach 50 prospects/sem
- 1-on-1 demos (1 hora each)

**Mensaje:**
> "Empresa de soporte IT, te configuramos NOVAdesk gratis primer mes. Si en 30 días resolvés 30%+ de tickets via voz, pagás $149/mes. Si no, free."

**Métrica éxito:** 3 lighthouse customers, NPS >40, AAT >150

**Costo estimado:** $0 (sólo tiempo Freddy)

---

### 🎯 Fase 2 — Direct sales + Content (M3-6): "Vertical wedge"

**Objetivo:** 30 tenants pagando, 4 verticales activas, $12K MRR.

**Canales (en orden de prioridad):**

#### A) **WhatsApp outbound personalizado** (50% del CAC)
- Lista de 5,000 empresas LATAM scrapeadas (LinkedIn + Yellow Pages)
- Mensaje 1: "Vimos que sos una empresa IT en Bogotá. ¿Te ayudaría tener un agente de voz que maneje tickets?"
- Mensaje 2 (si responde): "Te muestro 90 segundos de demo, sin venta"
- Conversion: 5% to demo, 25% demo to paying = **1.25% lista to paying**
- CAC = $80 por cliente

#### B) **Content marketing en LinkedIn** (25% del CAC)
- 1 post/día: case studies, comparativas, demos
- Newsletter "El Operador" (LATAM voice AI insights) → 5K subs en 6 meses
- CAC = $40 por cliente (orgánico amplificado)

#### C) **YouTube Shorts + TikTok demos** (15% del CAC)
- 30s demos del wow moment (NOVA configurando WhatsApp por voz)
- Target: dueños 25-45 años LATAM
- CAC = $60 por cliente

#### D) **Referral program** (10% del CAC, alta calidad)
- Cliente refiere → +1 mes gratis ambos
- CAC = $30 por cliente (recommended traffic converts 3x mejor)

**Total CAC blended Fase 2:** ~$70/cliente
**Inversión Fase 2:** $25K marketing + $15K sales

---

### 🎯 Fase 3 — Multi-país + Reseller (M7-12): "Land grab"

**Objetivo:** 400 tenants, $66K MRR, México + Argentina launched.

**Nuevos canales:**

#### E) **Reseller program agencias** (40% del growth)
- Agencias de marketing digital LATAM (1,000 prospects)
- Pitch: "Vendé NOVAdesk a tus clientes pyme, ganás 30% MRR para siempre"
- Target: 50 agencies activas, 5-10 clientes c/u = 250-500 tenants
- CAC indirecto: $50/cliente (la agencia hace el trabajo)

#### F) **Local press + podcast tour** (15% growth)
- Podcasts AmCham, Pyme.la, Endeavor LATAM, Founderly
- Press releases en La República, El Tiempo, Forbes LATAM
- CAC = $20/cliente (orgánico high-quality)

#### G) **Paid ads escalados** (30% growth)
- Google Ads: "voice AI assistant for SMB", "WhatsApp helpdesk"
- Meta Ads: video demos targeting dueños pyme
- LinkedIn Ads: ITSM/IT services LATAM
- CAC = $120-150/cliente

#### H) **Conferencias / eventos** (15% growth)
- SaaStr LATAM, FIL Bogotá, Endeavor MX, FinTech LATAM
- Speaking + booth + demos en vivo
- CAC = $200/cliente (alto, pero high-quality enterprise)

---

### 🎯 Fase 4 — Marketplace + PLG (M13-24): "Compounding loops"

**Objetivo:** 2,366 tenants, $651K MRR, ready for Series B.

**Mecanismos compuestos:**

#### I) **Marketplace de Vertical Packs** (network effect)
- Devs/agencias publican vertical packs custom
- 70/30 split (publisher / NOVAdesk)
- Crea long-tail: nichos específicos (abogados especializados, contadores, etc.)

#### J) **PLG self-serve onboarding**
- Sign-up sin sales
- Free trial 14 días automático
- NOVA hace todo el onboarding (8 min)
- Conversion target: 25% trial-to-paid

#### K) **Embedded fintech (BNPL + payments)**
- Stripe Connect para que tenants cobren a sus clientes
- BNPL en dental/estética/inmob
- NOVAdesk toma 0.5-2% del transaction volume
- ARPU expansion: $130 → $250+

---

## 👥 5. HIRING PLAN

### Q3 2026 (M1-3)
- ✅ Freddy (CEO, AI/backend)
- ✅ Emma (CTO, frontend, ITSM)
- 🆕 Senior dev voice/AI (LATAM remote, $5K/mo)

### Q4 2026 (M4-6)
- 🆕 GTM Operator / Sales (LATAM, $3K base + comisiones)
- 🆕 Mobile dev React Native (contractor 2 meses)
- 🆕 Customer Success Manager (LATAM, $2.5K/mo)

### Q1 2027 (M7-9)
- 🆕 Senior dev fullstack #2
- 🆕 Marketing/content manager
- 🆕 Designer (UI/UX)

### Q2 2027 (M10-12) — Post-Seed
- 🆕 Head of Engineering
- 🆕 Head of Sales LATAM
- 🆕 2 dev engineers
- 🆕 SDR team (3 personas)

### Q3-Q4 2027 (M13-18) — Post Series A
- Equipo total: 18-25 personas
- Open offices Medellín + México DF
- Plan: 50 personas para Series B (M30)

---

## 💼 6. CAP TABLE EVOLUTION

### Hoy (Pre-product, M0)
| Stakeholder | % |
|---|---|
| Freddy Rincones (CEO) | 50% |
| Emma Castillo (CTO) | 40% |
| Advisor pool | 5% |
| Option pool empleados | 5% |

### Post Pre-Seed F&F ($230K @ $2M cap, M0)
| Stakeholder | % |
|---|---|
| Freddy | 46% |
| Emma | 37% |
| Advisor pool | 4.5% |
| Option pool | 4.5% |
| Pre-seed investors | 8% |

### Post Seed ($1.5M @ $8M cap, M12)
| Stakeholder | % |
|---|---|
| Freddy | 36% |
| Emma | 29% |
| Pre-seed | 6% |
| Seed investors | 18% |
| Advisor + option pool | 11% |

### Post Series A ($10M @ $40M cap, M24)
| Stakeholder | % |
|---|---|
| Freddy | 26% |
| Emma | 21% |
| Pre-seed | 4% |
| Seed | 13% |
| Series A | 25% |
| Advisor + option pool | 11% |

---

## 🎯 7. NORTH STAR + KPIs FRAMEWORK

### North Star Metric
**AAT — Acciones del Agente por Tenant/Mes**

> Esta métrica captura: 1) adopción del producto, 2) valor entregado, 3) lock-in, 4) revenue (outcome-based futuro).

### Pirate Metrics (AARRR)

| Stage | Métrica | Target Mes 6 | Target Mes 12 |
|---|---|---|---|
| **Acquisition** | Sign-ups/mes | 80 | 250 |
| **Activation** | % completed onboarding (8 min) | 65% | 75% |
| **Retention** | M1 retention | 80% | 85% |
| **Revenue** | MRR | $9.5K | $66K |
| **Referral** | Net referral rate (% clients refer) | 15% | 25% |

### KPIs por área

#### Producto
- AAT (north star)
- % via NOVA (vs UI tradicional)
- Feature adoption rate por vertical
- Tool success rate (target >95%)
- Avg session duration NOVA

#### Comercial
- MQL → SQL → Won funnel
- CAC blended
- LTV:CAC ratio
- Payback period
- Logo churn rate

#### Operacional
- Gross margin %
- COGS por tenant
- Burn rate
- Runway months
- Team productivity (revenue per FTE)

---

## 🌎 8. EXPANSIÓN GEOGRÁFICA — Roadmap

### Año 1 (M1-12): Colombia + Bootstrap
- Foco: Bogotá, Medellín, Cali
- Idioma: español Colombia formal
- Currency: COP + USD
- Pagos: PSE + Daviplata + Stripe USD

### Año 2 (M13-24): México + Argentina + Chile
- M13-15: México (Spanish neutro/LATAM voice variants)
- M16-18: Argentina (vos + cedrar variant)
- M19-21: Chile + Perú
- Currency: MXN, ARS, CLP, PEN
- Pagos: MercadoPago + locales (Mercado Libre, OXXO, Rapipago)

### Año 3 (M25-36): Brasil + USA Hispanic
- M25-30: Brasil (português BR voice + cultural adaptation)
- M31-36: USA Hispanic market (NY, Miami, LA, TX)

---

## 🔥 9. EMBEDDED FINTECH OPPORTUNITY (Año 2)

Inspirado en Capim playbook (dental BNPL Brasil):

### Por vertical:

| Vertical | Embedded financial product | Take rate NOVAdesk |
|---|---|---|
| **Dental** | BNPL para tratamientos $400-2K (implantes, ortodoncia) | 2-3% |
| **Estética** | Suscripciones mensuales recurrentes (gym-style) | 1% transaction |
| **Veterinaria** | Pet insurance / planes preventivos prepagos | 5% premium |
| **Autos** | Pre-aprobación crédito automotor instantánea | 1% deal |
| **Inmobiliaria** | Garantías de alquiler digitales | 1.5% |
| **Restaurantes** | Loyalty con crédito embebido | 2% transaction |

### Proyección revenue fintech (Año 2)
- 1,500 tenants en Año 2
- Avg transaction volume per tenant: $5K/mo
- NOVAdesk take rate: 1.5% blended
- **Revenue fintech adicional:** $112K/mes = $1.35M ARR

**Total ARR Año 2 con fintech:** SaaS $7.8M + Fintech $1.35M = **$9.15M ARR**

---

## ⚖️ 10. RIESGOS DETALLADOS + MITIGATION

| # | Riesgo | Probabilidad | Impacto | Plan A | Plan B |
|---|---|---|---|---|---|
| 1 | Scope creep verticales | Alta | Alto | Disciplina ITSM-first 4 meses | Reducir a 3 verticales totales año 1 |
| 2 | OpenAI cost explosion | Media | Alto | Aggressive caching + Anthropic alternative | Multi-provider routing layer |
| 3 | Vambe/Mercately escalan más rápido | Media | Medio | Velocity execution + ITSM unique wedge | Acquisition target |
| 4 | Avoca/Toma bajan a LATAM | Media | Alto | Locking-in agencias reseller + LATAM brand | Pivot to white-label infra B2B2B |
| 5 | Meta cambia WhatsApp Cloud API pricing | Baja | Alto | Hedge con Telegram + email channels | Direct PSTN integration |
| 6 | Recession LATAM | Media | Medio | Pricing flexible + outcome-based focus | Reduce ARPU mantener volumen |
| 7 | Talent shortage LATAM senior | Alta | Medio | Remote-first, equity generosa | Outsource non-core |
| 8 | Dilución excesiva pre-Series A | Baja | Alto | F&F first, bootstrap break-even M9 | Skip seed, raise A directly |

---

## 🎯 11. NORTH STAR + COMPLIANCE CHECKLIST

### Antes de lanzar (M1-2)
- [ ] Términos y condiciones
- [ ] Política privacidad (Habeas Data Colombia + GDPR equivalente LATAM)
- [ ] Política de procesamiento datos personales
- [ ] DPA template para clientes enterprise
- [ ] Encriptación at-rest + in-transit
- [ ] Backup automático Supabase

### Antes de Seed (M9-12)
- [ ] SOC 2 Type 1 audit started
- [ ] Penetration test
- [ ] Compliance LGPD (Brasil)
- [ ] BCP (Business Continuity Plan)
- [ ] Insurance (cyber + E&O)
- [ ] Stock option plan formalizado

### Antes de Series A (M18-24)
- [ ] SOC 2 Type 2 certified
- [ ] ISO 27001 (opcional)
- [ ] Anti-money laundering procedures (fintech)
- [ ] PCI DSS compliance
- [ ] Multiple datacenters (AWS LATAM regions)
- [ ] Disaster recovery <1h RTO

---

**FIN PRICING + FINANCIALS + GTM — NOVAdesk OS**

> El roadmap completo está en 4 documentos. Este es el último. Si llegamos a $25K MRR en Mes 6, seed asegurado. Si llegamos a $600K MRR Mes 24, Series A líder LATAM.
