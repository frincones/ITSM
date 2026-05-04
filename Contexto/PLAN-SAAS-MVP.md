# PLAN DE IMPLEMENTACIÓN — NOVAdesk SaaS Production-Ready MVP

> **Documento maestro** del plan para llevar NOVAdesk ITSM de plataforma interna a **SaaS multi-tenant production-ready** con billing real, observabilidad, control de costos y Platform Console.
>
> **Validado por:** @arquitecto (según reglas de `.claude/agents/arquitecto.md`)
> **Stack de referencia:** `Contexto/ARQUITECTURA.md`
> **Duración total:** 6 semanas
> **Fecha creación:** 2026-04-24
> **Versión:** 1.0

---

## 📋 ÍNDICE

1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [Estado actual vs objetivo](#2-estado-actual-vs-objetivo)
3. [Validación arquitectónica (propuestas a ARQUITECTURA.md)](#3-validación-arquitectónica)
4. [Principios innegociables](#4-principios-innegociables)
5. [Alcance MVP (in/out)](#5-alcance-mvp)
6. [Roadmap de 6 fases](#6-roadmap-de-6-fases)
7. [Schema de base de datos](#7-schema-de-base-de-datos)
8. [Estructura `/platform/*`](#8-estructura-platform)
9. [Cost Control System (detalle)](#9-cost-control-system)
10. [Feature Flags System](#10-feature-flags-system)
11. [TDX Support Dogfooding](#11-tdx-support-dogfooding)
12. [Production-Ready Checklist](#12-production-ready-checklist)
13. [Métricas de éxito](#13-métricas-de-éxito)
14. [Riesgos y mitigación](#14-riesgos-y-mitigación)
15. [Decisiones pendientes del usuario](#15-decisiones-pendientes)
16. [Actualizaciones requeridas a agentes](#16-actualizaciones-a-agentes)

---

## 1. Resumen ejecutivo

**En 6 semanas NOVAdesk pasa de ~70% a 100% SaaS production-ready.** El plan incorpora billing Paddle end-to-end, 5 providers de auth OAuth, Platform Console completo para Emma + Freddy (TDX), sistema de control de costos con protección multi-capa para integraciones externas (Claude/OpenAI/Gemini/Resend), feature flags avanzados con rollouts y overrides, soporte integrado vía dogfooding (widget → tickets en tenant TDX), observabilidad (Sentry + PostHog), rate limiting global y audit trail completo.

**Costo fijo infra mensual:** ~$65 USD.
**Break-even:** desde el primer cliente Starter ($57 USD/mes con 3 seats mínimos).
**Primer cliente pago factible:** semana 7.

---

## 2. Estado actual vs objetivo

### ✅ Lo que ya existe (baseline 2026-04-24)

| Categoría | Detalle |
|---|---|
| Schema base | ~55 tablas multi-tenant con RLS + FORCE + 4 policies + `get_current_tenant_id()` |
| Auth | Supabase Auth cookie-based SSR + CSRF + MFA básico + middleware |
| RBAC | `profiles` + `profile_permissions` granulares |
| Audit | `audit_logs` particionada por mes |
| AI | Claude API + pgvector + RAG con filtro `tenant_id` |
| Email | Resend configurado |
| Inbox omnicanal | Email, Office 365, Gmail, WhatsApp, Web Widget |
| Stack | Next.js 15 + shadcn/ui + Tailwind 4 + Supabase + Vercel |
| Marketing | `/pricing`, políticas legales publicadas |
| Paddle (API-bootstrap) | 2 productos + 4 prices + client token + webhook setting |

### ❌ Gaps por construir

Billing enforcement · Platform Console · Cost observability · Feature flags · TDX support tenant · Auth OAuth providers adicionales · Workspace onboarding · Rate limiting · Session invalidation post-plan-change · Sentry/PostHog · Widget soporte.

---

## 3. Validación arquitectónica

### Propuesta formal #1 a ARQUITECTURA.md — 3 niveles de tablas

**Sección a modificar:** §7 Database + §8 Multi-tenancy.

**Cambio propuesto:** Relajar la regla absoluta #1 (*"TODA tabla tiene tenant_id NOT NULL"*) para admitir 3 niveles:

```
NIVEL A — Tenant tables (comportamiento actual, sin cambios)
  • tenant_id NOT NULL
  • ENABLE + FORCE RLS
  • 4 policies con get_current_tenant_id()
  • Prefijo: ninguno
  • Ejemplos existentes: tickets, agents, inbox_messages

NIVEL B — Platform tables (NUEVO)
  • SIN tenant_id (son globales de la plataforma)
  • ENABLE + FORCE RLS
  • Policies usan is_platform_admin() en vez de tenant check
  • Prefijo obligatorio: platform_*
  • Ejemplos: platform_admins, platform_feature_flags, plans, plan_entitlements

NIVEL C — Cross-tenant aggregation tables (NUEVO)
  • tenant_id NOT NULL (mantiene isolation tenant)
  • ENABLE + FORCE RLS con DOBLE policy por operación:
    - USING (tenant_id = get_current_tenant_id() OR is_platform_admin())
  • Prefijo: ninguno (son datos de tenants)
  • Ejemplos: service_usage_events, tenant_subscriptions, billing_events, data_requests
```

**Justificación:**
1. **Problema:** Imposible construir Platform Admin Console sin romper RLS o duplicar data.
2. **Beneficio:** Tenant isolation sigue 100% garantizado. Solo platform admins con `is_platform_admin()` TRUE tienen acceso cross-tenant.
3. **Evidencia:** Patrón usado por Supabase Studio (schema `public` con policies globales), Vercel Dashboard (teams table), Linear Admin, Clerk.

**Impacto:** 🟢 BAJO — solo aplica a nuevas tablas de la Fase 1+. Las ~55 tablas existentes siguen en Nivel A sin cambios.

**Estado:** ⏳ Pendiente aprobación del usuario antes de ejecutar Fase 1.

### Propuesta formal #2 — Helper `is_platform_admin()`

Agregar a §8 después de `get_current_tenant_id()`:

```sql
CREATE OR REPLACE FUNCTION is_platform_admin(required_role platform_admin_role DEFAULT NULL)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM platform_admins
    WHERE user_id = auth.uid()
      AND active = true
      AND (required_role IS NULL OR role = required_role OR role = 'owner')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```

---

## 4. Principios innegociables

| # | Principio | Consecuencia |
|---|---|---|
| 1 | Tenant isolation absoluto vía RLS | Un tenant jamás ve data de otro. Platform admins excepción controlada. |
| 2 | Paddle webhook = source of truth | Nunca update optimista de subscription desde frontend. |
| 3 | Idempotency key en TODO evento externo | Webhook retries no deben duplicar. |
| 4 | Usage tracking en wrappers únicos | Llamada a Claude pasa por `lib/services/usage/claude.ts` o no pasa. |
| 5 | Dogfooding absoluto | TDX tenant ES el support desk. |
| 6 | YAGNI estricto | Si lo necesitás a 200 clientes, defer. |
| 7 | Impersonation auditada + time-box 1h | SOC 2 ready desde día 1. |
| 8 | Rate limit en TODO endpoint público | Widget, API pública, auth callbacks. |
| 9 | Entitlements separados de permisos RBAC | Permisos = "user puede hacer X"; entitlements = "tenant incluye X según plan". |
| 10 | Feature flags separados de entitlements | Entitlements = pricing; flags = dark launches/canary/rollouts. |
| 11 | Cost calculation inmutable | Se guarda el costo al momento del evento, nunca se recalcula. |
| 12 | Kill switches accesibles en UI | Panic button sin deploy. |

---

## 5. Alcance MVP

### ✅ DENTRO del MVP (6 semanas)

**Auth (5 providers):**
- Google OAuth
- Microsoft/Azure OAuth
- GitHub OAuth
- Email + password
- Magic link

**Billing:**
- Paddle checkout overlay end-to-end
- Webhook con idempotencia + retry propio
- Trial 14 días con emails de conversión
- Customer Portal (Paddle hosted) para self-serve billing

**Platform Console (`/platform/*`) — 9 módulos Tier 1:**
1. Dashboard principal (Revenue + Growth + Costs + Ops)
2. Tenants (list + detail + usage + actions + feature-flags override)
3. Revenue (MRR/ARR + transacciones + past-due)
4. Observability (costos global + por tenant + alerts)
5. Inbox (alerts internos accionables para Emma/Freddy)
6. Support (TDX tickets cross-tenant con contexto)
7. Feature Flags (CRUD + rollouts + overrides)
8. Admins (lista + add/revoke)
9. Settings (kill switches + max daily spend + providers)
10. Audit (viewer con filters)

**Cost Control System:**
- Plan entitlements por tier (Free/Starter/Pro/Enterprise)
- Per-tenant override (JSONB en `tenants`)
- Global kill switches por provider
- Pre-flight budget check (<10ms)
- Threshold alerts automáticos (80% warning, 100% block)
- Anomaly detection (spike >2x promedio)

**Feature Flags:**
- Status: disabled/enabled/percentage/allowlist
- Per-tenant overrides con `expires_at`
- Cache con revalidate 60s e invalidación en cambios
- 9 flags iniciales seed

**TDX Support:**
- TDX tenant con flag `is_support_tenant`
- Widget en tenants (rate-limited)
- Tickets cross-tenant con `source_tenant_id` + `source_context`
- Threading vía Resend inbound

**Observabilidad externa:**
- Sentry (errors + perf)
- PostHog (eventos de conversión)

### ❌ FUERA del MVP (post-launch, on-demand)

- Enterprise SSO/SAML/SCIM → WorkOS cuando aparezca primer lead Enterprise
- SOC 2 readiness → Vanta/Drata cuando haya $100k+ ARR
- Growth analytics detallado → PostHog cubre
- Infrastructure deep dive UI → Sentry + Supabase Studio cubren
- Broadcasts UI → Resend manual
- AI prompt editor UI → commit + deploy
- Compliance queue UI → email manual + script
- Plan editor UI → seed file + deploy
- API pública + OAuth apps → cuando haya demanda
- Cohort retention + A/B experiments → post product-market-fit
- Subdomain custom por tenant (`acme.novadesk.app`) → path-based `novadesk.app/acme` en MVP

---

## 6. Roadmap de 6 fases

### FASE 0 — Pre-flight (días 1-2)

**Objetivo:** Aprobar base + setup de cuentas externas.

**Tareas:**
- [ ] Aprobar Propuestas #1 y #2 a ARQUITECTURA.md
- [ ] Actualizar `.claude/agents/arquitecto.md`, `fullstack-dev.md`, `db-integration.md` con reglas nivel A/B/C
- [ ] Crear Google Cloud OAuth app (Client ID + Secret)
- [ ] Crear Azure AD app registration (Client ID + Secret)
- [ ] Crear GitHub OAuth app
- [ ] Configurar Upstash Redis free tier (rate limiting)
- [ ] Crear Sentry project
- [ ] Crear PostHog project
- [ ] Configurar env vars en `.env.local` + Vercel
- [ ] Habilitar providers en Supabase Dashboard

**Entregable:** Todas las credentials listas y documentadas en `.claude/SUPABASE-CREDENTIALS.md` (gitignored).

---

### FASE 1 — Billing + Platform foundation (semana 1)

**Objetivo:** Schema sólido que sostiene todo lo demás.

**Migraciones (orden estricto):**

**`00020_platform_and_billing.sql`** (una sola migración, siguiendo template db-integration):

```sql
-- ============ NIVEL B: Platform tables ============
CREATE TYPE platform_admin_role AS ENUM ('owner', 'support');

CREATE TABLE platform_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role platform_admin_role NOT NULL,
  email text NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Helper function
CREATE OR REPLACE FUNCTION is_platform_admin(required_role platform_admin_role DEFAULT NULL)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM platform_admins
    WHERE user_id = auth.uid() AND active = true
      AND (required_role IS NULL OR role = required_role OR role = 'owner')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_admins FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_admins_all ON platform_admins FOR ALL TO authenticated
  USING (is_platform_admin()) WITH CHECK (is_platform_admin('owner'));

-- Platform audit (SIN particionar — YAGNI)
CREATE TABLE platform_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id),
  actor_email text NOT NULL,
  action text NOT NULL,
  target_type text,
  target_id uuid,
  target_tenant_id uuid REFERENCES tenants(id),
  reason text,
  ip_address inet,
  user_agent text,
  diff jsonb,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE platform_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_audit_select ON platform_audit_logs FOR SELECT TO authenticated
  USING (is_platform_admin());
-- INSERT solo via service_role

CREATE INDEX idx_platform_audit_created ON platform_audit_logs (created_at DESC);
CREATE INDEX idx_platform_audit_actor ON platform_audit_logs (actor_user_id, created_at DESC);
CREATE INDEX idx_platform_audit_target ON platform_audit_logs (target_tenant_id, created_at DESC);

-- Plans catalog
CREATE TABLE plans (
  slug text PRIMARY KEY,
  name text NOT NULL,
  description text,
  price_monthly_cents bigint,
  price_annual_cents bigint,
  paddle_product_id text,
  paddle_price_monthly_id text,
  paddle_price_annual_id text,
  min_seats int DEFAULT 1,
  trial_days int DEFAULT 14,
  is_public boolean DEFAULT true,
  display_order int DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY plans_read ON plans FOR SELECT TO authenticated USING (is_public = true OR is_platform_admin());
CREATE POLICY plans_write ON plans FOR ALL TO authenticated
  USING (is_platform_admin()) WITH CHECK (is_platform_admin());

-- Plan entitlements
CREATE TABLE plan_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_slug text NOT NULL REFERENCES plans(slug) ON DELETE CASCADE,
  feature_key text NOT NULL,
  limit_type text NOT NULL CHECK (limit_type IN ('boolean', 'quota', 'custom')),
  limit_value bigint,
  soft_limit_pct int DEFAULT 80,
  overage_price_cents numeric(12,6),
  UNIQUE(plan_slug, feature_key)
);
ALTER TABLE plan_entitlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY plan_ent_read ON plan_entitlements FOR SELECT TO authenticated USING (true);
CREATE POLICY plan_ent_write ON plan_entitlements FOR ALL TO authenticated
  USING (is_platform_admin()) WITH CHECK (is_platform_admin());

-- ============ NIVEL B: Feature flags ============
CREATE TYPE feature_flag_status AS ENUM ('disabled', 'enabled', 'percentage', 'allowlist');

CREATE TABLE platform_feature_flags (
  key text PRIMARY KEY,
  description text,
  status feature_flag_status NOT NULL DEFAULT 'disabled',
  rollout_percent int NOT NULL DEFAULT 0 CHECK (rollout_percent BETWEEN 0 AND 100),
  allowlist_tenants uuid[] NOT NULL DEFAULT '{}',
  blocklist_tenants uuid[] NOT NULL DEFAULT '{}',
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE platform_feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_feature_flags FORCE ROW LEVEL SECURITY;
CREATE POLICY flags_read ON platform_feature_flags FOR SELECT TO authenticated USING (true);
CREATE POLICY flags_write ON platform_feature_flags FOR ALL TO authenticated
  USING (is_platform_admin()) WITH CHECK (is_platform_admin());

-- Per-tenant overrides
CREATE TABLE tenant_feature_overrides (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  feature_key text NOT NULL REFERENCES platform_feature_flags(key) ON DELETE CASCADE,
  enabled boolean NOT NULL,
  reason text NOT NULL,
  expires_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, feature_key)
);
ALTER TABLE tenant_feature_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_feature_overrides FORCE ROW LEVEL SECURITY;
CREATE POLICY overrides_read ON tenant_feature_overrides FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id() OR is_platform_admin());
CREATE POLICY overrides_write ON tenant_feature_overrides FOR ALL TO authenticated
  USING (is_platform_admin()) WITH CHECK (is_platform_admin());

-- RPC de evaluación
CREATE OR REPLACE FUNCTION is_feature_enabled(p_tenant_id uuid, p_feature_key text)
RETURNS boolean AS $$
DECLARE
  v_flag platform_feature_flags%ROWTYPE;
  v_override tenant_feature_overrides%ROWTYPE;
BEGIN
  SELECT * INTO v_override FROM tenant_feature_overrides
  WHERE tenant_id = p_tenant_id AND feature_key = p_feature_key
    AND (expires_at IS NULL OR expires_at > now());
  IF FOUND THEN RETURN v_override.enabled; END IF;

  SELECT * INTO v_flag FROM platform_feature_flags WHERE key = p_feature_key;
  IF NOT FOUND THEN RETURN false; END IF;

  IF p_tenant_id = ANY(v_flag.blocklist_tenants) THEN RETURN false; END IF;

  RETURN CASE v_flag.status
    WHEN 'disabled' THEN false
    WHEN 'enabled' THEN true
    WHEN 'allowlist' THEN p_tenant_id = ANY(v_flag.allowlist_tenants)
    WHEN 'percentage' THEN
      (abs(hashtext(p_tenant_id::text || ':' || p_feature_key)) % 100) < v_flag.rollout_percent
  END;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============ NIVEL C: Cross-tenant billing ============
CREATE TYPE subscription_status AS ENUM (
  'trialing', 'active', 'past_due', 'paused', 'canceled', 'over_limit'
);

CREATE TABLE tenant_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  plan_slug text NOT NULL REFERENCES plans(slug),
  status subscription_status NOT NULL DEFAULT 'trialing',
  paddle_subscription_id text,
  paddle_customer_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_ends_at timestamptz,
  seat_limit int NOT NULL DEFAULT 1,
  seats_used int NOT NULL DEFAULT 1,
  canceled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE tenant_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_subscriptions FORCE ROW LEVEL SECURITY;
CREATE POLICY subs_select ON tenant_subscriptions FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id() OR is_platform_admin());
-- Mutations solo via service_role

CREATE INDEX idx_subs_tenant ON tenant_subscriptions (tenant_id);
CREATE INDEX idx_subs_status ON tenant_subscriptions (status) WHERE status IN ('past_due', 'over_limit');

-- Billing events (idempotencia + replay)
CREATE TABLE billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paddle_event_id text NOT NULL UNIQUE,
  tenant_id uuid REFERENCES tenants(id),
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  processed boolean NOT NULL DEFAULT false,
  processed_at timestamptz,
  error text,
  retry_count int DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY billing_events_select ON billing_events FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id() OR is_platform_admin());

CREATE INDEX idx_billing_events_pending ON billing_events (processed, created_at) WHERE processed = false;

-- ============ Platform settings (kill switches + config global) ============
CREATE TABLE platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY settings_read ON platform_settings FOR SELECT TO authenticated
  USING (is_platform_admin());
CREATE POLICY settings_write ON platform_settings FOR ALL TO authenticated
  USING (is_platform_admin('owner')) WITH CHECK (is_platform_admin('owner'));

-- ============ Platform inbox alerts ============
CREATE TABLE platform_inbox_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  category text NOT NULL,
  title text NOT NULL,
  body text,
  tenant_id uuid REFERENCES tenants(id),
  action_url text,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id),
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE platform_inbox_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY alerts_read ON platform_inbox_alerts FOR SELECT TO authenticated USING (is_platform_admin());
CREATE POLICY alerts_update ON platform_inbox_alerts FOR UPDATE TO authenticated USING (is_platform_admin());

CREATE INDEX idx_alerts_unresolved ON platform_inbox_alerts (created_at DESC) WHERE resolved_at IS NULL;

-- ============ Extensiones a tablas existentes ============
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS status text DEFAULT 'trialing';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS entitlement_overrides jsonb DEFAULT '{}';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS is_support_tenant boolean DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_slug ON tenants (slug) WHERE slug IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_single_support_tenant ON tenants ((1)) WHERE is_support_tenant = true;

-- Triggers
CREATE TRIGGER set_updated_at BEFORE UPDATE ON platform_admins
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON platform_feature_flags
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON tenant_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============ Invitations (para Fase 2) ============
CREATE TABLE tenant_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email text NOT NULL,
  role_id uuid REFERENCES profiles(id),
  invited_by uuid NOT NULL REFERENCES auth.users(id),
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE tenant_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_invitations FORCE ROW LEVEL SECURITY;
CREATE POLICY invitations_select ON tenant_invitations FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id() OR is_platform_admin());
CREATE POLICY invitations_insert ON tenant_invitations FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY invitations_update ON tenant_invitations FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());

CREATE INDEX idx_invitations_email ON tenant_invitations (email) WHERE accepted_at IS NULL AND revoked_at IS NULL;
```

**Seed inicial (`00020_seed.sql`):**

```sql
-- Plans iniciales
INSERT INTO plans (slug, name, description, price_monthly_cents, price_annual_cents, paddle_product_id, paddle_price_monthly_id, paddle_price_annual_id, min_seats, trial_days, display_order) VALUES
  ('free', 'Free', 'For small teams getting started with ITSM', 0, 0, NULL, NULL, NULL, 1, 0, 1),
  ('starter', 'Starter', 'Core ITSM for growing IT teams and MSPs', 1900, 18900,
    'pro_01kpzxenss5wt69mve48c15h12',
    'pri_01kpzxep5mn513e5qc2vymhym0',
    'pri_01kpzxepg39v8596e8ss17pfmp',
    3, 14, 2),
  ('professional', 'Professional', 'The complete platform for mid-market IT operations', 4900, 48900,
    'pro_01kpzxepx1v3zpxyctzs7dzbv8',
    'pri_01kpzxeq7k0rkbaff2788xy5tk',
    'pri_01kpzxeqj33hn8z5v8e9tswns0',
    5, 14, 3),
  ('enterprise', 'Enterprise', 'Compliance, security and scale for regulated orgs', NULL, NULL, NULL, NULL, NULL, 25, 0, 4);

-- Plan entitlements
INSERT INTO plan_entitlements (plan_slug, feature_key, limit_type, limit_value, soft_limit_pct, overage_price_cents) VALUES
  -- Free
  ('free', 'max_agents', 'quota', 3, 80, NULL),
  ('free', 'tickets_per_month', 'quota', 500, 80, NULL),
  ('free', 'ai_resolutions_per_month', 'quota', 100, 80, NULL),
  ('free', 'kb_articles', 'quota', 50, 80, NULL),
  ('free', 'cmdb', 'boolean', 0, NULL, NULL),
  ('free', 'workflows', 'quota', 0, NULL, NULL),
  ('free', 'public_api', 'boolean', 0, NULL, NULL),
  ('free', 'sso_saml', 'boolean', 0, NULL, NULL),
  -- Starter
  ('starter', 'max_agents', 'quota', 999, NULL, NULL),
  ('starter', 'tickets_per_month', 'quota', 999999, NULL, NULL),
  ('starter', 'ai_resolutions_per_month', 'quota', 1000, 80, 40),
  ('starter', 'workflows', 'quota', 5, NULL, NULL),
  ('starter', 'cmdb', 'boolean', 0, NULL, NULL),
  ('starter', 'public_api', 'boolean', 0, NULL, NULL),
  -- Professional
  ('professional', 'max_agents', 'quota', 999, NULL, NULL),
  ('professional', 'ai_resolutions_per_month', 'quota', 5000, 80, 40),
  ('professional', 'workflows', 'quota', 999, NULL, NULL),
  ('professional', 'cmdb', 'boolean', 1, NULL, NULL),
  ('professional', 'public_api', 'boolean', 1, NULL, NULL),
  ('professional', 'ai_agents', 'quota', 3, NULL, NULL),
  -- Enterprise
  ('enterprise', 'ai_resolutions_per_month', 'quota', 50000, 80, 40),
  ('enterprise', 'ai_agents', 'quota', 8, NULL, NULL),
  ('enterprise', 'sso_saml', 'boolean', 1, NULL, NULL),
  ('enterprise', 'cmdb', 'boolean', 1, NULL, NULL),
  ('enterprise', 'public_api', 'boolean', 1, NULL, NULL);

-- Feature flags iniciales
INSERT INTO platform_feature_flags (key, description, status) VALUES
  -- Kill switches (emergency)
  ('ai_enabled_globally', 'Master switch for all AI features', 'enabled'),
  ('signups_enabled', 'Allow new tenant signups', 'enabled'),
  ('widget_enabled', 'Support widget in tenant apps', 'enabled'),
  -- Gradable features
  ('new_ai_triage_v2', 'Improved AI triage with multi-step reasoning', 'disabled'),
  ('workflow_builder_visual', 'React Flow visual workflow editor', 'allowlist'),
  ('cmdb_graph_view', 'CMDB dependency graph visualization', 'disabled'),
  ('ai_chat_in_portal', 'AI chat assistant in customer portal', 'percentage'),
  -- Experimental
  ('inbox_whatsapp', 'WhatsApp channel in inbox', 'allowlist'),
  ('ai_voice_transcription', 'Transcribe voice notes in tickets', 'disabled');

-- Platform settings
INSERT INTO platform_settings (key, value, description) VALUES
  ('max_daily_spend_anthropic_cents', '10000', 'Hard cap: $100/día total Anthropic'),
  ('max_daily_spend_openai_cents', '5000', 'Hard cap: $50/día total OpenAI'),
  ('max_daily_spend_google_cents', '5000', 'Hard cap: $50/día total Google/Gemini'),
  ('max_daily_spend_resend_cents', '2000', 'Hard cap: $20/día total Resend'),
  ('maintenance_mode', 'false', 'Show maintenance banner across all tenants'),
  ('maintenance_message', '"Scheduled maintenance — we will be back soon."', 'Banner text');
```

**Webhook handler (`apps/web/app/api/paddle/webhook/route.ts`):**

```typescript
export async function POST(request: Request) {
  // 1. Verify HMAC signature
  const signature = request.headers.get('paddle-signature');
  const rawBody = await request.text();
  if (!verifyPaddleSignature(rawBody, signature)) {
    return new Response('Invalid signature', { status: 401 });
  }

  const event = JSON.parse(rawBody);

  // 2. Idempotency: insert into billing_events con UNIQUE paddle_event_id
  const { error } = await serviceClient.from('billing_events').insert({
    paddle_event_id: event.notification_id,
    tenant_id: resolveTenantFromCustomData(event.data),
    event_type: event.event_type,
    payload: event,
    processed: false,
  });
  if (error && error.message.includes('duplicate')) {
    return new Response('OK (duplicate)', { status: 200 });
  }

  // 3. Process (async via cron — aquí solo queue)
  void processBillingEvent(event);  // fire-and-forget

  return new Response('OK', { status: 200 });
}
```

**Retry propio (`apps/web/app/api/cron/process-billing-events/route.ts`):**

Scheduled cada 5 min vía `vercel.json`:
- `SELECT ... WHERE processed = false ORDER BY created_at LIMIT 50`
- Para cada evento: procesar + `UPDATE processed=true`
- Si falla 3 veces → crear `platform_inbox_alert` severity=critical

**Solo 4 eventos suscritos:** `subscription.created`, `subscription.updated`, `subscription.canceled`, `transaction.payment_failed`.

**Checklist Fase 1:**
- [ ] Migración aplicada sin errores (`supabase db push`)
- [ ] `is_platform_admin()` returns `true` para Emma+Freddy (insertados manualmente)
- [ ] `is_feature_enabled()` evaluado con los 4 modos (test manual)
- [ ] Webhook Paddle recibido en prod con test event
- [ ] Idempotencia verificada (3 webhook duplicados → 1 row)
- [ ] Cron de retry corriendo cada 5 min
- [ ] TypeScript types regenerados

---

### FASE 2 — Auth completo + Workspace onboarding (semana 2)

**Objetivo:** Usuario entra por cualquier método, crea workspace, cae en app con trial activo.

**Activaciones Supabase Dashboard:**
- Google OAuth (con Client ID/Secret de Google Cloud)
- Azure OAuth (con Client ID/Secret de Azure AD)
- GitHub OAuth
- Email + password (ya activo)
- Magic link (ya activo)

**Trigger extendido `handle_new_user`:**

```sql
CREATE OR REPLACE FUNCTION handle_new_user() RETURNS trigger AS $$
DECLARE
  v_invitation tenant_invitations%ROWTYPE;
BEGIN
  -- 1. ¿Invitación pendiente por email?
  SELECT * INTO v_invitation FROM tenant_invitations
  WHERE email = NEW.email AND accepted_at IS NULL AND revoked_at IS NULL
    AND expires_at > now()
  LIMIT 1;

  IF v_invitation.id IS NOT NULL THEN
    -- Auto-join al tenant invitante
    INSERT INTO agents (tenant_id, user_id, profile_id, email, name)
    VALUES (
      v_invitation.tenant_id, NEW.id, v_invitation.role_id,
      NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
    );
    UPDATE tenant_invitations SET accepted_at = now() WHERE id = v_invitation.id;
  END IF;
  -- Si no hay invitación: user redirect a /onboarding/workspace

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Estructura de archivos:**

```
apps/web/app/
├── auth/
│   ├── sign-in/page.tsx          # OAuth buttons + email form + magic link
│   ├── sign-up/page.tsx          # Igual + redirect /onboarding si nuevo
│   ├── callback/route.ts         # Handle OAuth callback
│   ├── verify/page.tsx           # Email verification
│   └── reset-password/page.tsx
├── onboarding/
│   ├── layout.tsx                # Stepper visual
│   ├── workspace/page.tsx        # Form: nombre + slug + país + rol
│   ├── invite-team/page.tsx      # (Opcional) invitar 1-3 emails
│   └── welcome/page.tsx          # "Ready!" → /home
└── join/
    └── [token]/page.tsx          # Magic link landing para invitations
```

**Componente `OAuthButtons.tsx` (shadcn/ui + Lucide):**
```tsx
<Button variant="outline" onClick={() => signInWithOAuth('google')}>
  <GoogleIcon /> Continue with Google
</Button>
<Button variant="outline" onClick={() => signInWithOAuth('azure')}>
  <MicrosoftIcon /> Continue with Microsoft
</Button>
<Button variant="outline" onClick={() => signInWithOAuth('github')}>
  <GitHubIcon /> Continue with GitHub
</Button>
<Separator>or</Separator>
<EmailForm />
<MagicLinkButton />
```

**Server Action `createWorkspace`:**
```typescript
export async function createWorkspace(input) {
  const validated = workspaceSchema.parse(input);
  // 1. Insert tenants con slug único
  // 2. Insert agents (admin del workspace)
  // 3. Insert tenant_subscriptions (plan=free, status=trialing si starter+)
  // 4. Seed data: 3 tickets demo + 1 SLA + 1 workflow
  // 5. Return redirect /home
}
```

**Session invalidation post-plan-change:**
```typescript
// lib/services/billing/apply-plan-change.ts
// Después de actualizar tenant_subscriptions.plan → force refresh JWT
// supabase.auth.refreshSession() en próximo request
```

**Checklist Fase 2:**
- [ ] Sign in con Google funciona con gmail + workspace
- [ ] Sign in con Microsoft funciona con Office 365
- [ ] Sign in con GitHub funciona
- [ ] Email/password + magic link siguen funcionando
- [ ] Invitation por email → `/join/{token}` → signup pre-llenado → auto-join tenant
- [ ] Crear workspace sin invitación → onboarding wizard → tenant creado con trial
- [ ] Seed data aparece al entrar a `/home` primera vez

---

### FASE 3 — Paddle checkout + entitlements enforcement (semana 3)

**Objetivo:** De `/pricing` a subscription activa con feature gating.

**Frontend:**
- `pnpm add @paddle/paddle-js`
- `components/billing/PaddleProvider.tsx` — init con token del env
- Actualizar `/pricing`:
  - Toggle monthly/annual
  - Botón "Start free" → `/auth/sign-up?plan={slug}`
  - Botón "Upgrade" (si ya logueado) → abre overlay Paddle
- `/billing/page.tsx` — plan actual + próxima factura + botón "Manage" (Paddle Customer Portal)
- `/billing/success/page.tsx` — post-pago

**Entitlements helper server-side:**

```typescript
// lib/services/entitlements.ts
import { unstable_cache } from 'next/cache';

export const getEntitlements = unstable_cache(
  async (tenantId: string) => {
    const supabase = getSupabaseServerClient();
    const { data: sub } = await supabase
      .from('tenant_subscriptions')
      .select('plan_slug, status')
      .eq('tenant_id', tenantId)
      .single();
    if (!sub) return {};

    const { data: ent } = await supabase
      .from('plan_entitlements')
      .select('feature_key, limit_type, limit_value, overage_price_cents')
      .eq('plan_slug', sub.plan_slug);

    const { data: tenant } = await supabase
      .from('tenants').select('entitlement_overrides').eq('id', tenantId).single();

    // Merge: base plan + overrides JSONB
    return mergeEntitlements(ent, tenant.entitlement_overrides);
  },
  ['entitlements'],
  { revalidate: 60, tags: ['entitlements'] }
);

export async function requireEntitlement(
  tenantId: string,
  feature: string,
  amount: number = 1
) {
  const ent = await getEntitlements(tenantId);
  const featureEnt = ent[feature];
  if (!featureEnt) return { allowed: false, reason: 'Feature not in plan' };
  if (featureEnt.limit_type === 'boolean') {
    return { allowed: !!featureEnt.limit_value, reason: 'Upgrade required' };
  }
  // Quota
  const used = await getUsageThisMonth(tenantId, feature);
  if (used + amount > featureEnt.limit_value) {
    return { allowed: false, reason: 'Monthly limit reached' };
  }
  return { allowed: true };
}
```

**Feature gating en UI:**

```tsx
// Server Component
const entitlements = await getEntitlements(tenant.id);
return (
  <>
    {entitlements.cmdb && <CmdbNav />}
    {!entitlements.cmdb && <UpgradePromptTo plan="professional" />}
  </>
);
```

**Trial emails (Resend cron):**
- Día 11 (T-3): "Trial ends in 3 days"
- Día 13 (T-1): "Trial ends tomorrow"
- Día 14 (T-0): Webhook Paddle → "Subscription active" o "Trial ended, downgraded to Free"

**Checklist Fase 3:**
- [ ] Usuario con trial → botón Upgrade → Paddle overlay → pago → webhook → status=active
- [ ] Feature gated (CMDB) → modal upgrade si plan Starter
- [ ] Seat limit → bloqueo al intentar invitar #4 en Starter
- [ ] Cancel desde Customer Portal → webhook → status=canceled + grace 7d
- [ ] Emails de trial enviados en T-3, T-1, T-0
- [ ] Session se refresca después de plan change

---

### FASE 4 — Usage tracking + Cost Control System (semana 4)

**Objetivo:** Captura de TODO evento facturable + protección multi-capa de costos.

**Migración `00021_service_usage.sql`:**

```sql
CREATE TYPE service_provider AS ENUM (
  'openai', 'anthropic', 'google', 'resend', 'twilio', 'whatsapp', 'supabase_storage'
);

CREATE TYPE service_operation AS ENUM (
  'chat_completion', 'embedding', 'transcription', 'image_generation',
  'email_send', 'sms_send', 'whatsapp_send', 'storage_upload', 'storage_egress'
);

CREATE TABLE service_usage_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider service_provider NOT NULL,
  operation service_operation NOT NULL,
  model text,
  tokens_input int DEFAULT 0,
  tokens_output int DEFAULT 0,
  units numeric(12,4) DEFAULT 0,
  cost_usd_cents numeric(12,6) NOT NULL DEFAULT 0,
  resource_type text,
  resource_id uuid,
  user_id uuid REFERENCES auth.users(id),
  idempotency_key text NOT NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE UNIQUE INDEX idx_usage_idem ON service_usage_events (tenant_id, idempotency_key);
CREATE INDEX idx_usage_tenant_created ON service_usage_events (tenant_id, created_at DESC);
CREATE INDEX idx_usage_tenant_provider ON service_usage_events (tenant_id, provider, created_at DESC);

-- Particiones mensuales iniciales
CREATE TABLE service_usage_events_2026_04 PARTITION OF service_usage_events
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE service_usage_events_2026_05 PARTITION OF service_usage_events
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');

-- RLS doble
ALTER TABLE service_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_usage_events FORCE ROW LEVEL SECURITY;
CREATE POLICY usage_select ON service_usage_events FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id() OR is_platform_admin());

-- Daily spend tracking (para kill switches)
CREATE TABLE daily_spend (
  day date NOT NULL,
  provider service_provider NOT NULL,
  tenant_id uuid REFERENCES tenants(id),  -- nullable = global
  total_cents numeric(12,6) NOT NULL DEFAULT 0,
  PRIMARY KEY (day, provider, COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid))
);

-- RPC pre-flight budget check
CREATE OR REPLACE FUNCTION check_budget(p_tenant_id uuid, p_provider service_provider)
RETURNS TABLE (blocked boolean, reason text, feature text) AS $$
DECLARE
  v_sub tenant_subscriptions%ROWTYPE;
  v_global_spend numeric;
  v_global_limit numeric;
BEGIN
  -- 1. Kill switch global
  IF NOT is_feature_enabled('00000000-0000-0000-0000-000000000000'::uuid, 'ai_enabled_globally')
     AND p_provider IN ('openai', 'anthropic', 'google')
  THEN
    RETURN QUERY SELECT true, 'AI globally disabled'::text, 'ai_enabled_globally'::text;
    RETURN;
  END IF;

  -- 2. Tenant subscription status
  SELECT * INTO v_sub FROM tenant_subscriptions WHERE tenant_id = p_tenant_id;
  IF v_sub.status IN ('canceled', 'past_due', 'over_limit') THEN
    RETURN QUERY SELECT true, 'Subscription ' || v_sub.status, NULL::text;
    RETURN;
  END IF;

  -- 3. Global daily spend cap (platform_settings)
  SELECT (value::text)::numeric INTO v_global_limit
  FROM platform_settings
  WHERE key = 'max_daily_spend_' || p_provider::text || '_cents';

  SELECT COALESCE(SUM(total_cents), 0) INTO v_global_spend
  FROM daily_spend WHERE day = CURRENT_DATE AND provider = p_provider;

  IF v_global_spend >= v_global_limit THEN
    RETURN QUERY SELECT true, 'Daily global cap reached for ' || p_provider::text, 'max_daily_spend'::text;
    RETURN;
  END IF;

  -- 4. OK
  RETURN QUERY SELECT false, NULL::text, NULL::text;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Threshold check (pg_cron cada 10 min)
CREATE OR REPLACE FUNCTION check_usage_thresholds() RETURNS void AS $$
BEGIN
  -- Usage >80% → warning
  INSERT INTO platform_inbox_alerts (severity, category, title, tenant_id, action_url)
  SELECT 'warning', 'billing',
         'Tenant ' || s.tenant_id || ' at ' || ROUND((100 * used / limit_value)::numeric, 0) || '% of ' || pe.feature_key,
         s.tenant_id,
         '/platform/tenants/' || s.tenant_id || '/usage'
  FROM tenant_subscriptions s
  JOIN plan_entitlements pe ON pe.plan_slug = s.plan_slug
  CROSS JOIN LATERAL (
    SELECT COALESCE(SUM(units), 0) as used
    FROM service_usage_events
    WHERE tenant_id = s.tenant_id
      AND created_at >= date_trunc('month', now())
  ) usage
  WHERE pe.limit_type = 'quota'
    AND usage.used >= pe.limit_value * 0.8
    AND usage.used < pe.limit_value
    AND NOT EXISTS (
      SELECT 1 FROM platform_inbox_alerts
      WHERE tenant_id = s.tenant_id AND category = 'billing'
        AND created_at > now() - interval '24 hours'
    );

  -- Usage >100% → block + alert crítico
  UPDATE tenant_subscriptions SET status = 'over_limit'
  WHERE tenant_id IN (
    SELECT s.tenant_id
    FROM tenant_subscriptions s
    JOIN plan_entitlements pe ON pe.plan_slug = s.plan_slug
    CROSS JOIN LATERAL (
      SELECT COALESCE(SUM(units), 0) as used FROM service_usage_events
      WHERE tenant_id = s.tenant_id AND created_at >= date_trunc('month', now())
    ) usage
    WHERE pe.limit_type = 'quota' AND usage.used >= pe.limit_value
      AND s.status = 'active'
  );

  -- Global spend anomaly (>2x avg últimos 7 días)
  INSERT INTO platform_inbox_alerts (severity, category, title, body)
  SELECT 'critical', 'billing',
         'Spend spike: ' || provider || ' at ' || total_today || ' vs avg ' || avg_7d,
         'Today: $' || (total_today/100) || ', 7-day avg: $' || (avg_7d/100)
  FROM (
    SELECT provider,
           (SELECT SUM(total_cents) FROM daily_spend WHERE day = CURRENT_DATE AND provider = ds.provider) AS total_today,
           (SELECT AVG(SUM(total_cents)) OVER ()
            FROM daily_spend WHERE day >= CURRENT_DATE - 7 AND day < CURRENT_DATE
            AND provider = ds.provider GROUP BY day) AS avg_7d
    FROM daily_spend ds WHERE day = CURRENT_DATE
  ) t
  WHERE total_today > avg_7d * 2;
END;
$$ LANGUAGE plpgsql;

SELECT cron.schedule('usage-thresholds', '*/10 * * * *', 'SELECT check_usage_thresholds()');
SELECT cron.schedule('refresh-daily-spend', '*/5 * * * *', $$
  INSERT INTO daily_spend (day, provider, tenant_id, total_cents)
  SELECT DATE(created_at), provider, tenant_id, SUM(cost_usd_cents)
  FROM service_usage_events
  WHERE created_at >= CURRENT_DATE
  GROUP BY DATE(created_at), provider, tenant_id
  ON CONFLICT (day, provider, tenant_id) DO UPDATE SET total_cents = EXCLUDED.total_cents;
$$);
```

**Wrappers obligatorios (`apps/web/lib/services/usage/`):**

```
lib/services/usage/
├── index.ts              # trackUsage() core
├── pricing.ts            # PROVIDER_PRICING table
├── budget-check.ts       # checkBudget() con cache 60s
├── claude.ts             # callClaude() wrapper
├── openai.ts             # callOpenAI() wrapper
├── gemini.ts             # callGemini() wrapper
├── resend.ts             # sendEmail() wrapper
└── errors.ts             # BudgetExceededError, ServiceUnavailableError
```

**Pricing table (`lib/services/usage/pricing.ts`):**
```typescript
export const PROVIDER_PRICING = {
  anthropic: {
    'claude-opus-4-7': { inputPer1M: 1500, outputPer1M: 7500 },
    'claude-sonnet-4-6': { inputPer1M: 300, outputPer1M: 1500 },
    'claude-haiku-4-5': { inputPer1M: 80, outputPer1M: 400 },
  },
  openai: {
    'gpt-4o': { inputPer1M: 250, outputPer1M: 1000 },
    'text-embedding-3-small': { inputPer1M: 2, outputPer1M: 0 },
  },
  google: {
    'gemini-1.5-pro': { inputPer1M: 125, outputPer1M: 500 },
  },
  resend: {
    'email_send': { per1k: 100 },
  },
} as const;
```

**Regla de oro:** ANTES de mergear código, grep `@anthropic-ai|openai|@google-ai|resend` fuera de `lib/services/usage/` → solo deben estar en los wrappers. @arquitecto bloquea si aparecen en otras partes.

**Checklist Fase 4:**
- [ ] Cada llamada Claude pasa por wrapper + genera row en service_usage_events
- [ ] Cost calc correcto: 1k input tokens Opus = 1.5 cents
- [ ] Idempotencia: mismo request 2x → 1 sola row
- [ ] checkBudget() < 10ms con cache
- [ ] Tenant al 80% → aparece en platform_inbox_alerts
- [ ] Tenant al 100% → status='over_limit' + feature bloqueada
- [ ] Kill switch global `ai_enabled_globally=false` → bloquea todos los wrappers AI
- [ ] Cron `check_usage_thresholds` corriendo cada 10 min

---

### FASE 5 — Platform Console MVP (semana 5)

**Objetivo:** Emma y Freddy operan el SaaS completo desde `/platform/*`.

**Middleware extendido (`apps/web/middleware.ts`):**

```typescript
if (url.pathname.startsWith('/platform')) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/auth/sign-in?next=/platform', request.url));

  const { data: admin } = await supabase
    .from('platform_admins')
    .select('role, active')
    .eq('user_id', user.id).eq('active', true).single();
  if (!admin) return NextResponse.rewrite(new URL('/404', request.url));  // No revelar existencia

  const response = NextResponse.next();
  response.headers.set('x-platform-admin-role', admin.role);
  return response;
}
```

**Estructura completa `/platform/`:**

```
apps/web/app/platform/
├── layout.tsx                          # Sidebar platform-only + impersonation banner
├── page.tsx                            # Dashboard: 4 bloques (Revenue/Growth/Costs/Ops)
│
├── tenants/
│   ├── page.tsx                        # Lista con health semáforo + filtros
│   └── [id]/
│       ├── page.tsx                    # Overview
│       ├── usage/page.tsx              # Cost breakdown del tenant
│       ├── actions/page.tsx            # Suspend/resume/trial-ext/comp/impersonate/export/delete
│       └── feature-flags/page.tsx      # Overrides de este tenant
│
├── revenue/
│   └── page.tsx                        # MRR/ARR + transacciones + past-due
│
├── observability/
│   ├── page.tsx                        # Cost dashboard global
│   ├── tenants/page.tsx                # Top spenders
│   └── alerts/page.tsx                 # Config thresholds + lista alerts fired
│
├── inbox/
│   └── page.tsx                        # platform_inbox_alerts feed
│
├── support/
│   ├── page.tsx                        # Inbox tickets source_tenant (TDX)
│   └── tickets/[id]/page.tsx           # Detalle con panel de contexto
│
├── feature-flags/
│   ├── page.tsx                        # CRUD lista
│   └── [key]/page.tsx                  # Editor (status + % slider + allow/blocklist)
│
├── admins/
│   └── page.tsx                        # Lista + add/revoke (solo owner)
│
├── settings/
│   └── page.tsx                        # Kill switches + max daily spend
│
└── audit/
    └── page.tsx                        # Viewer con filters
```

**Componentes clave:**

`/platform/page.tsx` — Dashboard ejecutivo:
- 4 widgets: Revenue (MRR/ARR/NetNew/Churn), Growth (Signups/Active/Conversion/Activation), Costs (Total/Margin/TopSpender/Anomalies), Ops (SupportTickets/DataReqs/Alerts/SystemStatus)
- Feed de últimas 20 acciones de platform_audit_logs

`/platform/settings/page.tsx` — Emergency panel:
- 4 kill switches con toggle + confirmación 2-step: `ai_enabled_globally`, `signups_enabled`, `widget_enabled`, `maintenance_mode`
- 4 inputs de max daily spend por provider
- Lista de rotación de API keys (con fecha última rotación)

**Impersonation flow (sin tabla separada, via audit events):**

```typescript
// Server Action startImpersonation(targetTenantId, reason: string)
// 1. Validar reason (min 10 chars)
// 2. Insert platform_audit_logs { action: 'impersonation.start',
//    target_tenant_id, reason, metadata: { session_id, expires_at } }
// 3. Set cookie impersonation_session con JWT custom expira 1h
// 4. Redirect → /home del tenant objetivo con banner rojo
// 5. Cookie expira → audit_log action: 'impersonation.end'
```

**Checklist Fase 5:**
- [ ] Emma con role='support' entra a /platform/* pero no ve /platform/admins ni /platform/settings
- [ ] Freddy con role='owner' accede todo
- [ ] Dashboard carga en <2s con data real
- [ ] /platform/observability refresca cada 30s con query directa
- [ ] Kill switch `ai_enabled_globally=false` → bloquea llamadas AI en todos los tenants
- [ ] Impersonation: banner rojo visible + expira 60 min + 2 audit events
- [ ] /platform/feature-flags editor: status + % slider + allowlist funcionan
- [ ] Acciones destructivas (suspend/delete/refund) requieren confirmación 2-step

---

### FASE 6 — TDX Support + Observabilidad externa (semana 6)

**Objetivo:** Dogfooding completo + Sentry + PostHog + rate limiting global.

**Migración `00022_tdx_support.sql`:**

```sql
ALTER TABLE tickets ADD COLUMN source_tenant_id uuid REFERENCES tenants(id);
ALTER TABLE tickets ADD COLUMN source_user_id uuid REFERENCES auth.users(id);
ALTER TABLE tickets ADD COLUMN source_context jsonb;

CREATE INDEX idx_tickets_source_tenant ON tickets (source_tenant_id, created_at DESC)
  WHERE source_tenant_id IS NOT NULL;

-- Update RLS para support tenant (admins del support ven tickets de otros tenants si source_tenant_id está seteado)
-- Esto se maneja en app layer vía service_role, no por RLS

-- Seed: crear TDX tenant
INSERT INTO tenants (slug, name, is_support_tenant, status, entitlement_overrides)
VALUES ('tdx', 'TDX Core (Support)', true, 'active', '{"unlimited": true}');

-- Emma + Freddy como agents del TDX tenant
-- (se ejecuta manualmente con service_role después de que existan en auth.users)
```

**Widget (`components/support/SupportWidget.tsx`):**
```tsx
'use client';
// Renderiza bottom-right de app/home/layout.tsx
// EXCEPTO si currentTenant.is_support_tenant = true
// Abre Dialog con SupportForm (subject + message)
// POST /api/support/widget
```

**Endpoint (`apps/web/app/api/support/widget/route.ts`):**
```typescript
export async function POST(request: Request) {
  // 1. Origin check
  // 2. RATE LIMIT (Upstash Redis: 5 req/min por user_id)
  const rateLimited = await rateLimit(`widget:${userId}`, 5, '1m');
  if (rateLimited) return new Response('Too many requests', { status: 429 });

  // 3. Resolver source tenant + user del cookie
  // 4. INSERT ticket via service_role con tenant_id=TDX_TENANT_ID
  //    + source_tenant_id + source_user_id + source_context
  // 5. Response con ticket_number
}
```

**Resend inbound (`apps/web/app/api/inbox/resend/route.ts`):**
- Verificar firma Resend webhook
- Match por header `In-Reply-To` → append mensaje a conversation existente en TDX
- O crear nueva conversation con ticket_relation si es un reply externo

**Rate limiting global (`lib/services/rate-limit.ts`):**

```typescript
// Upstash Redis free tier
// Endpoints protegidos:
//   /api/support/widget: 5/min por user
//   /api/v1/* (API pública, futuro): 100/min por API key
//   /api/auth/callback: 10/min por IP
```

**Sentry setup:**
```typescript
// apps/web/instrumentation.ts
import * as Sentry from '@sentry/nextjs';
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  beforeSend(event) {
    // Add tenant_id context automático
    event.tags = { ...event.tags, tenant_id: getTenantId() };
    return event;
  },
});
```

**PostHog eventos core:**
```typescript
posthog.capture('signup_completed', { provider })
posthog.capture('workspace_created', { plan, seats })
posthog.capture('first_ticket_created')
posthog.capture('first_agent_invited')
posthog.capture('checkout_opened', { plan })
posthog.capture('subscription_activated', { plan, mrr })
posthog.capture('upgrade_clicked', { from, to })
posthog.capture('feature_gated_shown', { feature })
posthog.capture('churn_cancel_started')
posthog.capture('widget_ticket_submitted')
```

**Checklist Fase 6:**
- [ ] Widget visible en todos los tenants excepto TDX
- [ ] Rate limit: 6to clic en 1 min → 429
- [ ] Ticket aparece en /platform/support con badge del source tenant
- [ ] Emma responde desde inbox TDX → email llega via Resend a user del tenant origen
- [ ] User responde email → mensaje engancha al mismo ticket (threading)
- [ ] Error en prod aparece en Sentry con tenant_id en tags
- [ ] Eventos PostHog fluyen en dashboard
- [ ] Maintenance mode toggle → banner visible en todos los tenants

---

## 7. Schema de base de datos

### Resumen de nuevas tablas

| # | Tabla | Nivel | Migración |
|---|---|---|---|
| 1 | `platform_admins` | B | 00020 |
| 2 | `platform_audit_logs` | B | 00020 |
| 3 | `plans` | B | 00020 |
| 4 | `plan_entitlements` | B | 00020 |
| 5 | `platform_feature_flags` | B | 00020 |
| 6 | `tenant_feature_overrides` | C | 00020 |
| 7 | `tenant_subscriptions` | C | 00020 |
| 8 | `billing_events` | C | 00020 |
| 9 | `platform_settings` | B | 00020 |
| 10 | `platform_inbox_alerts` | B | 00020 |
| 11 | `tenant_invitations` | A | 00020 |
| 12 | `service_usage_events` (particionada) | C | 00021 |
| 13 | `daily_spend` | C | 00021 |

### Extensiones a tablas existentes

| Tabla | Columnas nuevas |
|---|---|
| `tenants` | `slug text UNIQUE`, `status text`, `entitlement_overrides jsonb`, `is_support_tenant boolean` |
| `tickets` | `source_tenant_id uuid`, `source_user_id uuid`, `source_context jsonb` |

### Nuevas funciones RPC

- `is_platform_admin(required_role)` — Nivel B policies
- `is_feature_enabled(tenant_id, feature_key)` — Feature flag evaluation
- `check_budget(tenant_id, provider)` — Pre-flight budget check
- `check_usage_thresholds()` — Cron job threshold alerts

---

## 8. Estructura `/platform/*` completa

Ver sección Fase 5. Resumen:

- 10 módulos Tier 1
- ~18 rutas
- Middleware dedicado
- Sidebar platform-only distinto al tenant

---

## 9. Cost Control System

### Arquitectura de 5 capas

```
┌──────────────────────────────────────────────────────────────┐
│  CAPA 1 — Plan Entitlements (pricing-based)                  │
│    plan_entitlements.limit_value por feature por plan         │
├──────────────────────────────────────────────────────────────┤
│  CAPA 2 — Per-Tenant Overrides (contratos custom)            │
│    tenants.entitlement_overrides jsonb                        │
├──────────────────────────────────────────────────────────────┤
│  CAPA 3 — Global Kill Switches (emergency)                   │
│    platform_settings: ai_enabled_globally, max_daily_spend    │
├──────────────────────────────────────────────────────────────┤
│  CAPA 4 — Pre-Request Budget Check (<10ms)                   │
│    RPC check_budget() + cache 60s                             │
├──────────────────────────────────────────────────────────────┤
│  CAPA 5 — Threshold Alerts (post-request)                    │
│    pg_cron cada 10 min + anomaly detection                    │
└──────────────────────────────────────────────────────────────┘
```

### Flujo de una llamada a Claude

```
1. Server Action necesita Claude response
   ↓
2. lib/services/usage/claude.ts.callClaude()
   ↓
3. checkBudget(tenantId, 'anthropic') [cache 60s]
   ├── Kill switch check
   ├── Tenant status check (active/trialing)
   ├── Global daily spend cap
   └── (Tenant monthly quota check happens async post-call)
   ↓ ALLOWED
4. anthropic.messages.create()
   ↓
5. trackUsage() con idempotency_key = `anthropic:${response.id}`
   ├── Calcular cost_usd_cents desde pricing.ts
   ├── INSERT service_usage_events (ignora si duplicate)
   └── Daily_spend aggregation vía cron /5min
   ↓
6. checkThresholdAndAlert(tenantId, 'anthropic') [fire-and-forget]
   └── Si >80%: platform_inbox_alert + email
   └── Si >100%: status='over_limit' + block
```

### Responses a failure modes

| Escenario | Respuesta del sistema |
|---|---|
| Tenant hit 100% AI quota | Hard block + alert platform + email tenant admin |
| Global Claude spend >$100/día | Kill switch auto-activado + alert crítico Emma+Freddy |
| Spike detectado (3x avg) | Alert sin bloqueo + email Emma+Freddy |
| Webhook Paddle cae | Retry cron cada 5min + alert si >3 fails |
| Prompt injection abuse | Freddy activa `ai_enabled_globally=false` (1 click) |

---

## 10. Feature Flags System

### Flags iniciales (9 seed)

| Key | Propósito | Status inicial |
|---|---|---|
| `ai_enabled_globally` | Kill switch emergencia AI | `enabled` |
| `signups_enabled` | Permitir nuevos tenants | `enabled` |
| `widget_enabled` | Widget de soporte | `enabled` |
| `new_ai_triage_v2` | Nuevo triage con multi-step | `disabled` |
| `workflow_builder_visual` | React Flow editor | `allowlist` (solo TDX) |
| `cmdb_graph_view` | CMDB dependency graph | `disabled` |
| `ai_chat_in_portal` | AI chat en portal cliente | `percentage` (0%) |
| `inbox_whatsapp` | WhatsApp en inbox | `allowlist` |
| `ai_voice_transcription` | Voice notes | `disabled` |

### Casos de uso validados

1. **Dark launch:** Merge código con flag `disabled` → nadie lo ve hasta listo
2. **Canary 10→50→100%:** Cambiar `rollout_percent` en slider UI
3. **Beta program:** Allowlist con tenant_ids específicos
4. **Emergency rollback:** Status a `disabled` → efecto inmediato (cache 60s max)
5. **Per-tenant grant:** `tenant_feature_overrides` para ACME con reason "Beta tester"
6. **Per-tenant disable:** Override negativo para bloquear feature en tenant con bug reportado

### Helper TypeScript

```typescript
// lib/services/feature-flags.ts
export const getFeatureFlags = unstable_cache(
  async (tenantId) => {/* ... */},
  ['feature-flags'],
  { revalidate: 60, tags: ['feature-flags'] }
);

export async function isFeatureEnabled(tenantId: string, key: string) {
  const flags = await getFeatureFlags(tenantId);
  return flags[key] ?? false;
}

// Uso:
// const showTriageV2 = await isFeatureEnabled(tenant.id, 'new_ai_triage_v2');
// {showTriageV2 && <NewTriageUI />}
```

Cambio de flag en `/platform/feature-flags/[key]` → Server Action invalida cache con `revalidateTag('feature-flags')`.

---

## 11. TDX Support Dogfooding

### Concepto

**TDX tiene su propio tenant en NOVAdesk** (`slug='tdx'`, `is_support_tenant=true`). Los tickets de soporte de todos los clientes se crean **EN este tenant**, con metadata del tenant origen.

### Flujo E2E

```
1. Juan (cliente acme tenant) clickea widget bottom-right en /home
2. Escribe problema + submit
3. POST /api/support/widget
   ├── Origin check + rate limit 5/min
   ├── Resolver source_tenant=acme, source_user=juan
   └── INSERT ticket con tenant_id=TDX + source_tenant_id=acme
4. Juan ve "Ticket #INC-2604-1234 created. We'll email you."

5. Emma (platform_admin role=support) abre /platform/support
6. Ve ticket con badge "ACME · Professional plan"
7. Click → /platform/support/tickets/[id]
   Panel lateral muestra:
     - Plan del tenant
     - Usage actual vs limit
     - Último login
     - Botón "Impersonate to reproduce"
8. Emma responde desde inbox TDX → Resend envía email a juan@acme.com
9. Juan responde email → Resend inbound webhook
   → Match por In-Reply-To → append a conversation TDX
10. Si Emma necesita ver qué ve Juan:
    → Botón Impersonate con reason="Debug ticket #INC-2604-1234"
    → Banner rojo + cookie 1h + audit log
```

### Ventajas

- **Dogfooding absoluto** — usan el producto tal como lo venden
- **Zero duplicación** — reusan inbox, tickets, AI triage, SLAs existentes
- **Cross-tenant context** — agente ve todo sin salir del ticket
- **AI desde día 1** — el AI triage que venden lo usan ellos mismos
- **Scaling natural** — contratás 5 support reps → `platform_admin` role=support

---

## 12. Production-Ready Checklist

### Seguridad
- [ ] RLS FORCE en TODAS las tablas A y C
- [ ] Rate limiting en `/api/support/widget`, `/api/v1/*`, `/api/auth/callback`
- [ ] Paddle webhook con HMAC signature verification
- [ ] CSRF middleware activo (@edge-csrf/nextjs)
- [ ] CSP headers estrictos en `next.config.js`
- [ ] No hay `service_role` key en cliente
- [ ] Todos los secrets en Vercel env vars
- [ ] `.env.local` gitignored y verificado
- [ ] 2FA obligatorio para platform_admins

### Billing
- [ ] Paddle en modo live verified
- [ ] Webhook endpoint con idempotencia (UNIQUE paddle_event_id)
- [ ] Webhook retry propio via cron
- [ ] Trial → paid transition tested con tarjeta real
- [ ] Seat limit enforcement verified
- [ ] Past-due handling: email + banner + restricción
- [ ] Session invalidation post-plan-change

### Multi-tenancy
- [ ] Test manual: user tenant A no puede SELECT de tenant B
- [ ] Test: service_usage_events respeta OR is_platform_admin()
- [ ] Test: platform_* tables solo visibles a platform admins
- [ ] handle_new_user trigger tested con invitation flow

### Cost Control
- [ ] Wrappers usage/* en todas las llamadas externas
- [ ] Kill switch `ai_enabled_globally=false` bloquea correctamente
- [ ] check_budget() < 10ms con cache
- [ ] Threshold 80% dispara alert
- [ ] Threshold 100% bloquea + marca over_limit
- [ ] Anomaly detection funciona (spike >2x)

### Observability
- [ ] Sentry captura errors de prod con tenant_id context
- [ ] PostHog eventos core fluyendo
- [ ] Usage tracking en cada wrapper verificado
- [ ] /platform dashboard carga en <2s

### Support (TDX)
- [ ] Widget funciona desde tenant ≠ TDX
- [ ] TDX tenant seedeado + Emma+Freddy como agents
- [ ] Threading email via Resend inbound
- [ ] Impersonation auditada y time-boxed

### Performance
- [ ] P95 /platform/* <500ms
- [ ] P95 /home/* <2s
- [ ] Índices con tenant_id primero
- [ ] No hay SELECT *

### Compliance mínimo
- [ ] Cookie policy + Privacy + Terms + Refund publicados
- [ ] DPA template markdown
- [ ] Subprocessor list pública en `/legal/subprocessors`
- [ ] Data export endpoint para platform admins
- [ ] Supabase backups activos

### Operations
- [ ] Runbook: webhook Paddle falla
- [ ] Runbook: tenant quiere export full data
- [ ] Runbook: AI provider rate limit
- [ ] Vercel + Supabase billing alerts
- [ ] Upstash Redis uptime monitoring

---

## 13. Métricas de éxito

### Técnicas (observables)

| Métrica | Semana 1 | Mes 1 |
|---|---|---|
| Uptime | 99.5% | 99.9% |
| Error rate | <1% | <0.5% |
| P95 page load | <3s | <2s |
| P95 API response | <500ms | <300ms |
| Webhook success rate | >99% | >99.9% |
| Cost per tenant (avg) | N/A | <$5 infra |

### Negocio

| Métrica | Mes 1 |
|---|---|
| Signups | 50 |
| Activation (invitó 1+ member) | 40% |
| Trial → paid conversion | 15% |
| MRR | $500 |
| Churn | <5% |
| Support tickets via TDX | <10/semana |
| Median support response time | <4h |

---

## 14. Riesgos y mitigación

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Paddle verification demora >2 semanas | Alta | Bloqueante launch | Preparar sandbox en paralelo + docs completos |
| Primer Enterprise pide SSO | Media | Pierde deal | WorkOS integration scoped en Fase 7 post-launch |
| Abuso del widget (spam) | Media | UX support | Rate limit + captcha si ocurre |
| Costo AI supera MRR por cliente Starter | Baja | Margen negativo | Hard limit 1k resolutions + banner 80% |
| Platform admin deletea data por error | Baja | Data loss | Confirmaciones 2-step + audit log + backups |
| Schema migration rompe prod | Baja | Downtime | Preview environments Vercel + Supabase branches |
| Paddle webhook falla silenciosamente | Media | Billing stale | Retry propio cada 5 min + alert si >3 fails |
| Prompt injection quema $5k AI en una hora | Baja | Pérdida cash | Kill switch global + max_daily_spend + alert spike |
| OAuth provider cae (Google/Azure) | Baja | Login bloqueado | Email/password + magic link como fallback |

---

## 15. Decisiones pendientes

**Requeridas antes de ejecutar Fase 0:**

1. **¿Aprobás la Propuesta #1 (3 niveles de tablas)?**
   Bloqueante para todas las migraciones. Sin esto no hay Platform Console.

2. **¿Aprobás la Propuesta #2 (helper `is_platform_admin()`)?**
   Bloqueante.

3. **¿Slug de workspaces será path-based (`novadesk.app/acme`) o subdomain (`acme.novadesk.app`)?**
   Recomendación: path-based para MVP (subdomains requieren wildcard DNS + SSL + middleware rewrite = 3 días extra).

4. **¿TDX tenant se llama `tdx` o `support`?**
   Slug único irreversible sin migración. Recomendación: `tdx` (brand-aligned).

5. **¿Emma y Freddy son ambos `owner` o uno es `support`?**
   Recomendación: ambos `owner` al inicio, diferenciar cuando crezca team.

6. **¿Aprobás max daily spend caps iniciales?**
   - Anthropic: $100/día → $3k/mes cap
   - OpenAI: $50/día → $1.5k/mes cap
   - Google: $50/día
   - Resend: $20/día → $600/mes cap

7. **¿Anual discount es exactamente 17% o querés ajustar?**
   Starter: $228 (monthly*12) → $189 anual (-17%)
   Pro: $588 → $489 anual (-17%)

---

## 16. Actualizaciones a agentes

Tras aprobar Propuestas #1 y #2, actualizar:

### `.claude/agents/arquitecto.md`

Agregar sección sobre:
- Niveles A/B/C de tablas
- Helper `is_platform_admin()`
- Checklist adicional para tablas Nivel B (SIN tenant_id) y Nivel C (doble policy)
- Rutas `/platform/*` como categoría distinta a `/home/*`

### `.claude/agents/fullstack-dev.md`

Agregar:
- Pattern `/platform/*` con `requirePlatformAdmin()` helper
- Usage tracking wrappers obligatorios (regla: nunca importar `@anthropic-ai` fuera de `lib/services/usage/`)
- Entitlements check pattern en Server Actions
- Feature flags check pattern en Server Components
- Rate limit middleware para endpoints públicos

### `.claude/agents/db-integration.md`

Agregar:
- Template de migración Nivel B (platform_*)
- Template de migración Nivel C (cross-tenant con doble policy)
- Lista de nuevas tablas (platform_admins, plans, feature_flags, subscriptions, etc.)
- pg_cron jobs nuevos (usage thresholds, daily_spend aggregation, billing events retry)
- Nueva columnas en tenants (slug, status, entitlement_overrides, is_support_tenant)

---

## 📊 Timeline visual

```
Semana 0 │ Pre-flight (días 1-2)
         │ ░░░ Cuentas OAuth + Sentry + PostHog + Upstash + aprobaciones
         │
Semana 1 │ FASE 1: Billing + Platform foundation
         │ ████████████████████ Migración 00020 + webhook Paddle
         │
Semana 2 │ FASE 2: Auth + Workspace onboarding
         │ ████████████████████ OAuth + trigger extendido + invitations
         │
Semana 3 │ FASE 3: Paddle checkout + entitlements
         │ ████████████████████ Overlay + feature gating + trial emails
         │
Semana 4 │ FASE 4: Usage tracking + Cost Control
         │ ████████████████████ Migración 00021 + wrappers + kill switches
         │
Semana 5 │ FASE 5: Platform Console MVP
         │ ████████████████████ /platform/* 10 módulos + impersonation
         │
Semana 6 │ FASE 6: TDX Support + observabilidad
         │ ████████████████████ Widget + Sentry + PostHog + rate limit
         │
         │ ✅ PRODUCTION READY
         │
Semana 7 │ Primer cliente pago viable
```

---

## 💰 Cost estimate mensual (stack completo)

| Servicio | Plan | Costo/mes |
|---|---|---|
| Vercel | Pro | $20 |
| Supabase | Pro | $25 |
| Upstash Redis | Free | $0 |
| Sentry | Free (5k errors) | $0 |
| PostHog | Free (1M events) | $0 |
| Resend | Pro (50k emails) | $20 |
| Paddle | Transaction fees (5% + $0.50) | Variable |
| Anthropic API | Usage-based | Variable (cobrado al cliente) |
| OpenAI API | Usage-based | Variable |
| **Fixed total** | | **~$65/mes** |

Con 10 tenants Starter = $570 MRR → margen cómodo desde día 1.

---

## 🎯 Resumen en 1 párrafo

En 6 semanas NOVAdesk ITSM pasa de 70% a 100% SaaS production-ready con billing Paddle end-to-end, 5 providers de auth OAuth, Platform Console completo para TDX (10 módulos con kill switches, cost observability multi-capa, feature flags avanzados, impersonation auditada), dogfooding de soporte via TDX tenant, Sentry + PostHog + rate limiting global. Arquitectura multi-tenant estricta con 3 niveles de tablas propuesta formal a ARQUITECTURA.md. Cost fijo infra ~$65/mes permite rentabilidad desde primer cliente Starter. Enterprise features (SAML, SCIM, SOC 2) quedan en Fase 7+ on-demand.

---

**Versión 1.0 — NovaDesk ITSM Production Plan**
**Creado:** 2026-04-24
**Validado por:** @arquitecto
**Siguiente paso:** Confirmación del usuario de las 7 decisiones pendientes (§15) → iniciar Fase 0.
