# 📚 Vertical Packs Reference — NOVAdesk OS

> **Especificación detallada de cada vertical pack: schema custom, tools NOVA específicos, prompts Sofía, workflows automation, KPIs.**
>
> Este doc es el blueprint para que cualquier dev pueda construir un vertical nuevo en 1-2 semanas usando las plantillas.

---

## 🏗️ Estructura común de un Vertical Pack

Cada vertical pack es un **YAML config + tablas SQL específicas + tools NOVA + prompts Sofía**.

```yaml
# vertical-pack-{name}.yaml
id: itsm | dental | estetica | vet | inmob
name: "Display name"
description: "..."

# Tools que se cargan cuando el tenant tiene este pack activo
tools:
  - name: tool_name
    schema: {...}
    handler: app.agents.tools.{vertical}_tools.{function}

# Custom fields que se agregan a customers
custom_fields:
  - name: field_name
    type: text | number | date | jsonb
    required: bool
    options: [...]  # if enum

# Pipeline stages específicos
pipeline_stages: [...]

# KPIs / North Star metrics
kpis:
  north_star: "..."
  leading: ["...", "..."]

# Workflows automation
auto_workflows:
  - trigger: event_name
    action: tool_name
    delay: "24h" | "immediate"

# Prompts overrides
sofia_prompt_addendum: "..."
nova_prompt_addendum: "..."

# Onboarding flow del dueño
owner_onboarding:
  - ask: "¿Cuántos doctores son?"
  - action: configure_team_size
```

---

## 🥇 VERTICAL PACK 1 — ITSM (MVP)

### Use cases típicos
- Empresas de soporte IT (1-25 empleados)
- Departamentos IT internos de empresas medianas
- MSPs (Managed Service Providers)
- Proveedores SaaS con soporte técnico

### Schema custom

```sql
-- Ya cubierto en 01-SPRINT-1-DETALLADO.md:
-- itsm_tickets, itsm_ticket_comments, itsm_assets, itsm_slas
```

### Tools NOVA Operator (12 tools)

| Tool | Descripción | Permission |
|---|---|---|
| `create_ticket` | Crear ticket | agent+ |
| `search_tickets` | Buscar/filtrar | viewer+ |
| `update_ticket` | Modificar campos | agent+ |
| `assign_ticket` | Asignar a agente | agent+ |
| `escalate_ticket` | Escalar prioridad | agent+ |
| `close_ticket` | Cerrar resuelto | agent+ |
| `add_ticket_comment` | Comentar (interno o público) | agent+ |
| `send_notification_to_customer` | Notificar cliente | agent+ |
| `generate_ticket_report` | Reportes SLA/FCR/MTTR | viewer+ |
| `query_sla_status` | Status SLA actuales | viewer+ |
| `bulk_update_tickets` | Update masivo (REQUIRES CONFIRMATION) | admin+ |
| `create_asset` | Registrar asset/equipo | agent+ |

### Tools Sofía (cliente final)

| Tool | Descripción |
|---|---|
| `create_ticket_from_customer` | Cliente final reporta problema |
| `query_my_tickets` | Cliente consulta sus tickets |
| `confirm_ticket_resolved` | Cliente confirma resolución |
| `escalate_to_human` | Pide hablar con humano |

### Pipeline stages ITSM
```
new → assigned → in_progress → pending (waiting customer) 
    → resolved → closed
    → cancelled (alternativa final)
```

### KPIs
```yaml
north_star: "Acciones NOVA por tenant/mes (AAT)"
leading:
  - "% tickets creados via NOVA vs UI tradicional"
  - "Tasa de adopción voz vs texto"
secondary:
  - "First Call Resolution rate (FCR)"
  - "Mean Time To Resolution (MTTR)"
  - "SLA compliance %"
  - "CSAT post-resolución"
```

### Auto workflows
```yaml
- trigger: ticket_created
  actions:
    - notify_assignee_via_email
    - send_acknowledgment_to_customer (WhatsApp)
    - schedule_sla_breach_alert (T-30min antes de breach)

- trigger: ticket_status_changed_to_resolved
  actions:
    - send_resolution_notification_to_customer (WhatsApp)
    - schedule_csat_survey (T+24h)

- trigger: sla_about_to_breach (T-30min)
  actions:
    - notify_assignee
    - notify_admin (escalation)
    - nova_proactive_alert (al dueño)

- trigger: customer_no_response_5_days
  actions:
    - auto_close_ticket
    - send_followup_message
```

### Prompt Sofía ITSM
```
Sos Sofía, asistente del equipo de soporte IT de {business_name}.

Cuando un cliente te escribe:
1. Saludá con el nombre del cliente si lo tenés
2. Identificá el problema: ¿es nuevo o sobre un ticket existente?
3. Si es nuevo: usá create_ticket_from_customer con toda la info que captes
4. Si es existente: usá query_my_tickets y dale status update
5. Si el cliente está frustrado o pide humano: usá escalate_to_human

NUNCA prometas tiempos de resolución específicos. Decí "nuestro equipo
te contacta en X horas según el SLA".

Si el problema es CRÍTICO (servidor caído, sin acceso a sistema):
escalá inmediatamente con priority=critical.
```

### Pricing recomendado
| Tier | $/mo | Limits |
|---|---|---|
| Starter | $49 | 1 user, 100 tickets/mo, 200 NOVA actions |
| Growth | $149 | 5 users, 500 tickets, 1500 NOVA actions, WhatsApp+email |
| Scale | $499 | 25 users, ilimitados, multi-sede, voice cloning, SLA 99.5% |

### Competencia + Wedge
- Freshservice ($29-99/agent) → NOVAdesk: 1/3 precio + voice + LATAM
- Jira Service ($20-85/agent) → NOVAdesk: vertical-specific + multi-canal
- ServiceNow ($160+/agent) → NOVAdesk: 1/30 precio para pyme

---

## 🦷 VERTICAL PACK 2 — DENTAL

### Use cases
- Consultorios dentales solo/dúo (1-3 doctores)
- Clínicas dentales pyme (4-15 empleados)
- DSOs pequeños LATAM (multi-sede)

### Schema custom

```sql
CREATE TABLE dental_appointments (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       uuid REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id     uuid REFERENCES customers(id),
    doctor_user_id  uuid REFERENCES users(id),
    
    service         text NOT NULL,                      -- 'limpieza', 'resina', 'implante'
    scheduled_at    timestamptz NOT NULL,
    duration_minutes integer DEFAULT 30,
    
    status          text DEFAULT 'confirmed' CHECK (status IN ('confirmed','cancelled','completed','no_show')),
    
    estimated_price_cop numeric(12,2),
    final_price_cop     numeric(12,2),
    payment_status      text DEFAULT 'pending',
    
    sofia_notes     text,                               -- AI-generated
    customer_notes  text,
    
    google_calendar_event_id text,
    
    created_at      timestamptz DEFAULT NOW()
);

CREATE TABLE dental_treatments (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       uuid REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id     uuid REFERENCES customers(id),
    
    treatment_type  text,                               -- 'ortodoncia', 'implante', 'endodoncia'
    started_at      date,
    estimated_end_at date,
    total_cost_cop  numeric(12,2),
    paid_cop        numeric(12,2),
    
    status          text DEFAULT 'in_progress',
    notes           text,
    
    created_at      timestamptz DEFAULT NOW()
);

-- Custom fields que se agregan al customer (vía customer.custom_fields jsonb):
-- - last_visit_date, next_recall_date
-- - allergies (latex, anestesia, etc.)
-- - insurance_provider
-- - dentist_assigned (pref)
-- - treatment_in_progress
```

### Tools NOVA Operator (Dental)

| Tool | Descripción |
|---|---|
| `schedule_appointment` | Crear cita |
| `reschedule_appointment` | Cambiar fecha/hora |
| `cancel_appointment` | Cancelar |
| `complete_appointment` | Marcar atendida (cobra) |
| `query_today_schedule` | Agenda del día |
| `query_pending_recalls` | Pacientes vencidos para recall |
| `send_appointment_reminder` | Recordatorio manual |
| `create_treatment_plan` | Plan multi-cita (ortodoncia, implantes) |
| `send_quote` | Enviar presupuesto WhatsApp |
| `request_payment` | Generar link pago Stripe/MercadoPago |
| `query_revenue_report` | Reporte ingresos |
| `query_patient_history` | Historia clínica |

### Tools Sofía (paciente)

| Tool | Descripción |
|---|---|
| `schedule_appointment` (cliente version) | Paciente agenda |
| `query_my_appointments` | Paciente ve sus citas |
| `cancel_my_appointment` | Paciente cancela |
| `send_payment_link` | Pagar tratamiento |
| `transfer_to_doctor` | Pasar a doctor humano |

### Pipeline stages
```
Lead WhatsApp → Cita agendada → Cita confirmada (24h) 
  → Atendida → Tratamiento iniciado → En curso → Completado
  → Recall scheduled (6 meses)
```

### KPIs
```yaml
north_star: "Citas confirmadas y atendidas/mes"
leading:
  - "Tasa de show (cliente vino vs agendado)"
  - "Conversion lead → cita"
secondary:
  - "Recall conversion rate (% pacientes vuelven en 6 meses)"
  - "Average revenue per patient/year"
  - "No-show rate (target <10%)"
  - "Tratamientos iniciados/mes"
```

### Auto workflows
```yaml
- trigger: appointment_scheduled
  actions:
    - send_confirmation_whatsapp
    - schedule_reminder_24h_before
    - schedule_reminder_2h_before

- trigger: appointment_completed
  actions:
    - send_payment_link_if_unpaid
    - schedule_csat_survey (T+24h)
    - schedule_recall_6months

- trigger: appointment_no_show
  actions:
    - notify_doctor
    - schedule_followup_call (T+24h, NOVA llama proactivo)
    - update_customer_no_show_count

- trigger: recall_due
  actions:
    - send_recall_message_whatsapp
    - if no response: schedule_followup (T+7d)

- trigger: treatment_payment_overdue
  actions:
    - send_payment_reminder
    - if no response 7d: notify_owner
```

### Prompt Sofía Dental
```
Sos Sofía, asistente de Clínica {business_name} en {city}.

PERSONALIDAD:
- Hablás español {language_variant} ({tu/usted/vos})
- Sos cálida, profesional, empática
- Naturalidad: "claro", "perfecto", pausas

OBJETIVO PRIMARIO: Convertir consultas en citas confirmadas.

REGLAS:
1. NUNCA decís que sos IA
2. Respondé precios concretos (NO "consultar")
3. Si quiere agendar: usá schedule_appointment
4. Pregunta médica compleja: transfer_to_doctor
5. Cierra con: "¿Te confirmo entonces para [día] a las [hora]?"

INFO DEL CONSULTORIO:
{business_info}

SERVICIOS:
{services_with_prices}
```

### Pricing dental
| Tier | $/mo |
|---|---|
| Starter | $99 (1 doctor, 200 citas/mo) |
| Growth | $399 (multi-doctor, 1500 citas, voice cloning) |
| Scale | $1,499 (multi-sede, white-label) |

### Add-ons
- Voice cloning del doctor: +$99
- Integración con software dental local (Dentidesk, Dentistsoft): +$49

---

## 💆 VERTICAL PACK 3 — ESTÉTICA / SPA / BELLEZA

### Use cases
- Spas, peluquerías, barberías
- Centros estéticos (faciales, depilación, masajes)
- Studios de uñas

### Schema custom

```sql
CREATE TABLE estetica_appointments (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       uuid REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id     uuid REFERENCES customers(id),
    professional_user_id uuid REFERENCES users(id),
    
    service         text NOT NULL,
    scheduled_at    timestamptz NOT NULL,
    duration_minutes integer,
    
    status          text DEFAULT 'confirmed',
    price_local     numeric(10,2),
    addons_sold     jsonb,                              -- [{product, price}]
    
    photos_before_after text[],                         -- URLs (con consent)
    
    created_at      timestamptz DEFAULT NOW()
);

CREATE TABLE estetica_loyalty (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       uuid REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id     uuid REFERENCES customers(id),
    
    points_balance  integer DEFAULT 0,
    visits_count    integer DEFAULT 0,
    last_visit_at   timestamptz,
    tier            text DEFAULT 'bronze',              -- bronze, silver, gold, vip
    
    created_at      timestamptz DEFAULT NOW()
);

CREATE TABLE estetica_subscriptions (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       uuid REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id     uuid REFERENCES customers(id),
    
    plan_name       text,                               -- 'mensual depilación', 'paquete 5 faciales'
    visits_included integer,
    visits_used     integer DEFAULT 0,
    valid_from      date,
    valid_until     date,
    auto_renew      boolean DEFAULT true,
    
    monthly_amount  numeric(10,2),
    status          text DEFAULT 'active',
    
    created_at      timestamptz DEFAULT NOW()
);

-- Custom customer fields:
-- - skin_type, hair_type
-- - product_preferences (array)
-- - subscription_status
-- - last_service_at
```

### Tools NOVA específicos
- `schedule_appointment`, `complete_appointment_with_addons`
- `enroll_in_subscription_plan`
- `award_loyalty_points`
- `send_birthday_promo`
- `send_inactive_winback` (clientes que no vienen hace 30+ días)

### Pipeline stages
```
Lead Instagram/WhatsApp → Cita agendada → Atendida 
  → Cliente recurrente (>3 visitas) → VIP (>10 visitas)
```

### KPIs
```yaml
north_star: "Recurrencia mensual (% clientes que vuelven cada mes)"
leading:
  - "Retail attach rate (productos vendidos por servicio)"
  - "Subscription enrollment rate"
secondary:
  - "Avg revenue per visit"
  - "Loyalty tier upgrade rate"
  - "Referral rate"
```

### Auto workflows
```yaml
- trigger: 30_days_since_last_visit
  actions:
    - send_winback_message_whatsapp ("Te extrañamos!")

- trigger: customer_birthday
  actions:
    - send_birthday_promo (-20% en cualquier servicio)

- trigger: appointment_completed
  actions:
    - award_loyalty_points
    - send_csat_survey
    - upsell_product_message (basado en historial)
    - schedule_next_recommended_appointment
```

### Pricing estética
| Tier | $/mo |
|---|---|
| Starter | $79 (1 profesional) |
| Growth | $349 (multi-pro, loyalty, subscriptions) |
| Scale | $899 (multi-sede, marketing automation) |

---

## 🐶 VERTICAL PACK 4 — VETERINARIA

### Use cases
- Clínicas veterinarias 1-10 vets
- Pet shops con servicio veterinario
- Spas + grooming canino

### Schema custom

```sql
CREATE TABLE vet_pets (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       uuid REFERENCES tenants(id) ON DELETE CASCADE,
    owner_customer_id uuid REFERENCES customers(id),
    
    name            text NOT NULL,
    species         text,                               -- 'dog','cat','rabbit','other'
    breed           text,
    birth_date      date,
    weight_kg       numeric(5,2),
    sex             text,
    sterilized      boolean,
    
    allergies       text[],
    chronic_conditions text[],
    medications_active jsonb,
    
    photo_url       text,
    
    created_at      timestamptz DEFAULT NOW()
);

CREATE TABLE vet_vaccinations (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       uuid REFERENCES tenants(id) ON DELETE CASCADE,
    pet_id          uuid REFERENCES vet_pets(id),
    
    vaccine_name    text NOT NULL,
    administered_at date,
    next_due_at     date,
    administered_by_vet_id uuid REFERENCES users(id),
    
    batch_number    text,
    notes           text
);

CREATE TABLE vet_appointments (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       uuid REFERENCES tenants(id) ON DELETE CASCADE,
    pet_id          uuid REFERENCES vet_pets(id),
    vet_user_id     uuid REFERENCES users(id),
    
    appointment_type text,                              -- 'consultation','vaccination','surgery','grooming'
    scheduled_at    timestamptz,
    
    status          text DEFAULT 'confirmed',
    diagnosis       text,
    treatment       text,
    weight_recorded numeric(5,2),
    
    price_local     numeric(10,2),
    
    created_at      timestamptz DEFAULT NOW()
);

CREATE TABLE vet_preventive_plans (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       uuid REFERENCES tenants(id) ON DELETE CASCADE,
    pet_id          uuid REFERENCES vet_pets(id),
    
    plan_name       text,                               -- 'plan oro', 'plan plata'
    monthly_amount  numeric(10,2),
    includes        jsonb,                              -- {vaccines: true, deworming: true, ...}
    valid_until     date,
    auto_renew      boolean DEFAULT true,
    
    created_at      timestamptz DEFAULT NOW()
);
```

### Tools NOVA específicos
- `register_pet`, `query_pet_history`
- `schedule_appointment`
- `record_vaccination` (con auto-schedule de próxima)
- `query_overdue_vaccinations`
- `enroll_in_preventive_plan`
- `send_vaccination_reminder`

### KPIs
```yaml
north_star: "% mascotas con plan preventivo activo"
leading:
  - "Vacunaciones cumplidas vs vencidas"
  - "Frecuencia visita por mascota (target 2-3/año)"
secondary:
  - "Revenue por mascota/año"
  - "Plan preventivo enrollment rate"
  - "Avg medical expenditure por mascota"
```

### Auto workflows críticos
```yaml
- trigger: vaccination_due_in_7_days
  actions:
    - send_reminder_to_owner_whatsapp

- trigger: vaccination_overdue_30_days
  actions:
    - escalation_message
    - if no response: nova_proactive_call_to_owner

- trigger: pet_birthday
  actions:
    - send_birthday_message (con foto histórica)
    - upsell_health_check_promo

- trigger: post_surgery_24h
  actions:
    - send_recovery_check_message
```

### Pricing veterinaria
| Tier | $/mo |
|---|---|
| Starter | $99 (1 vet, 200 mascotas registradas) |
| Growth | $399 (multi-vet, planes preventivos, ecommerce productos) |
| Scale | $999 (multi-sede, lab integration) |

---

## 🏠 VERTICAL PACK 5 — INMOBILIARIA

### Use cases
- Agencias inmobiliarias pyme (2-10 agentes)
- Brokers independientes
- Administradoras de propiedades

### Schema custom

```sql
CREATE TABLE inmob_properties (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       uuid REFERENCES tenants(id) ON DELETE CASCADE,
    
    title           text NOT NULL,
    property_type   text,                               -- 'house','apartment','commercial','land'
    transaction_type text,                              -- 'sale','rent'
    
    price_local     numeric(15,2),
    currency        text,
    
    address         text,
    city            text,
    neighborhood    text,
    coordinates     jsonb,                              -- {lat,lng}
    
    area_m2         numeric(8,2),
    bedrooms        integer,
    bathrooms       integer,
    parking_spots   integer,
    amenities       text[],
    
    photos          text[],
    description     text,
    
    listing_status  text DEFAULT 'active',              -- 'active','reserved','sold','rented'
    listed_at       timestamptz DEFAULT NOW(),
    
    -- Embedding for semantic search
    embedding       vector(1536),
    
    created_at      timestamptz DEFAULT NOW()
);

CREATE TABLE inmob_visits (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       uuid REFERENCES tenants(id) ON DELETE CASCADE,
    property_id     uuid REFERENCES inmob_properties(id),
    customer_id     uuid REFERENCES customers(id),
    agent_user_id   uuid REFERENCES users(id),
    
    scheduled_at    timestamptz,
    completed_at    timestamptz,
    
    status          text DEFAULT 'scheduled',
    customer_feedback text,
    interest_level  integer,                            -- 1-10
    
    created_at      timestamptz DEFAULT NOW()
);

CREATE TABLE inmob_offers (
    id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       uuid REFERENCES tenants(id) ON DELETE CASCADE,
    property_id     uuid REFERENCES inmob_properties(id),
    customer_id     uuid REFERENCES customers(id),
    
    offer_amount    numeric(15,2),
    status          text DEFAULT 'pending',             -- 'pending','accepted','rejected','withdrawn'
    
    financing_status text,
    notes           text,
    
    created_at      timestamptz DEFAULT NOW()
);

-- Custom customer fields:
-- - property_type_interest, budget_range
-- - location_preferences[]
-- - financing_status
-- - intent (compra/alquiler/venta/inversión)
```

### Tools NOVA específicos
- `add_property_listing`
- `search_properties` (con semantic search vía embedding)
- `match_customer_to_properties` (AI matching)
- `schedule_visit`
- `record_visit_feedback`
- `submit_offer`
- `query_pipeline_stage`
- `send_property_recommendations` (push de matches)

### KPIs
```yaml
north_star: "Visitas → ofertas (conversion rate)"
leading:
  - "Speed-to-lead (target <5 min)"
  - "Match rate (% leads con properties que les sirven)"
secondary:
  - "Avg commission per closed deal"
  - "Listing-to-sale time"
  - "Visits per property"
```

### Auto workflows críticos (CRITICAL: 87% deals lost por slow follow-up)
```yaml
- trigger: new_lead_inbound
  actions:
    - sofia_responds_immediately (<30s)
    - qualify_lead (budget, location, type)
    - search_matching_properties
    - send_top_3_matches

- trigger: visit_completed
  actions:
    - send_thankyou_within_2h
    - request_feedback (1-10 interest)
    - if interest >= 7: schedule_followup_call_in_24h

- trigger: new_property_listed
  actions:
    - find_customers_with_matching_preferences
    - send_alert_to_top_matches

- trigger: lead_no_response_3_days
  actions:
    - nova_proactive_followup_call
```

### Pricing inmobiliaria
| Tier | $/mo |
|---|---|
| Starter | $149 (1 agente, 50 listings) |
| Growth | $599 (multi-agente, AI matching, IDX integration) |
| Scale | $1,499 (multi-sede, MLS integration) |

---

## 📊 Resumen comparativo de las 5 verticales

| Vertical | Persona | WTP/mo Growth | TAM LATAM | Tiempo build pack | Score scorecard |
|---|---|---|---|---|---|
| **ITSM** | Empresa tech 1-25 | $149-499 | ~$650M | Ya existe (8 sem) | 4.50 |
| **Dental** | Consultorio 1-3 doctores | $99-399 | ~$300M | 2 sem post-MVP | 4.95 ⭐ |
| **Estética** | Spa/peluquería | $79-349 | ~$580M | 2 sem | 4.45 |
| **Veterinaria** | Clínica vet | $99-399 | ~$420M | 2-3 sem | 4.20 |
| **Inmobiliaria** | Agencia 2-10 agentes | $149-599 | ~$480M | 3 sem (MLS integ) | 4.10 |

---

## 🎯 Orden recomendado de lanzamiento

```
Mes 1-2:  ITSM (MVP completo + concierge 3 clientes)
Mes 3:    Dental (5 clínicas piloto)
Mes 4:    Estética (5 spas piloto)
Mes 5:    Mobile App (NOVA Operator React Native)
Mes 6:    Veterinaria + Inmobiliaria (lanzamiento simultáneo)
```

**Por qué este orden:**
1. **ITSM primero** = TDX ya tiene código + leads + experticia
2. **Dental segundo** = score más alto + WTP validada + POC actual
3. **Estética tercero** = mismo persona "small business owner LATAM"
4. **Mobile app** = wow factor para Q4 + soporta verticales 5-6
5. **Vet + Inmob** = expansión post-PMF con base sólida

---

## 🛠️ Cómo construir un vertical pack nuevo (template para devs)

**Estimado: 1-2 semanas con plantilla.**

### Día 1-2: Spec
- [ ] Llenar el YAML con tools, fields, workflows, prompts
- [ ] Validar con 3 dueños del vertical (entrevistas)

### Día 3-5: Schema + Tools
- [ ] Crear tablas `{vertical}_*` en Supabase
- [ ] Implementar tools en `app/agents/tools/{vertical}_tools.py`
- [ ] Tests unitarios de cada tool

### Día 6-8: Sofía prompts + workflows
- [ ] Adaptar prompts Sofía con vocabulario del vertical
- [ ] Implementar auto-workflows en Inngest
- [ ] RAG seed con docs típicos del vertical

### Día 9-10: UI específica (si necesaria)
- [ ] Páginas custom para entidades del vertical (ej: `/properties` para inmob)
- [ ] Reportes específicos

### Día 11-14: Testing + onboarding piloto
- [ ] 3 clientes piloto concierge
- [ ] Iteración basada en feedback

---

**FIN VERTICAL PACKS REFERENCE — NOVAdesk OS**

> Cada vertical es un mundo. Pero la arquitectura común permite escalar de 1 a 10 verticales sin reescribir el core.
