-- ═══════════════════════════════════════════════════════════════
-- MIGRATION 00015: PROJECTS
-- NovaDesk ITSM — AI-First Multi-Tenant Platform
-- ═══════════════════════════════════════════════════════════════
-- Description: Creates projects, project_tasks, and
--              project_members tables with full RLS policies,
--              indexes, and triggers.
-- Depends on: 00014_audit_logs.sql
-- ═══════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------
-- 1. TABLE: projects
-- ---------------------------------------------------------------

CREATE TABLE projects (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name                text NOT NULL,
  description         text,
  status              text NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'in_progress', 'on_hold', 'completed', 'cancelled')),
  start_date          date,
  end_date            date,
  project_manager_id  uuid REFERENCES agents(id),
  budget              decimal(12,2),
  actual_cost         decimal(12,2) DEFAULT 0,
  progress_percent    integer DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_projects_tenant ON projects (tenant_id);
CREATE INDEX idx_projects_tenant_status ON projects (tenant_id, status);
CREATE INDEX idx_projects_manager ON projects (tenant_id, project_manager_id);

-- Trigger: auto-update updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Policies
CREATE POLICY projects_select ON projects FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY projects_insert ON projects FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY projects_update ON projects FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY projects_delete ON projects FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ---------------------------------------------------------------
-- 2. TABLE: project_tasks
-- ---------------------------------------------------------------

CREATE TABLE project_tasks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title           text NOT NULL,
  description     text,
  status          text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
  assigned_to     uuid REFERENCES agents(id),
  start_date      date,
  due_date        date,
  estimated_hours float,
  actual_hours    float,
  parent_task_id  uuid REFERENCES project_tasks(id) ON DELETE SET NULL,
  sort_order      integer DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE project_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_tasks FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_project_tasks_tenant ON project_tasks (tenant_id);
CREATE INDEX idx_project_tasks_project ON project_tasks (tenant_id, project_id);
CREATE INDEX idx_project_tasks_assigned ON project_tasks (tenant_id, assigned_to);
CREATE INDEX idx_project_tasks_parent ON project_tasks (parent_task_id);

-- Trigger: auto-update updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON project_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Policies
CREATE POLICY project_tasks_select ON project_tasks FOR SELECT TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY project_tasks_insert ON project_tasks FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_current_tenant_id());
CREATE POLICY project_tasks_update ON project_tasks FOR UPDATE TO authenticated
  USING (tenant_id = get_current_tenant_id());
CREATE POLICY project_tasks_delete ON project_tasks FOR DELETE TO authenticated
  USING (tenant_id = get_current_tenant_id());

-- ---------------------------------------------------------------
-- 3. TABLE: project_members
-- ---------------------------------------------------------------

CREATE TABLE project_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'member' CHECK (role IN ('manager', 'member', 'viewer')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, user_id)
);

-- RLS
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members FORCE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_project_members_project ON project_members (project_id);
CREATE INDEX idx_project_members_user ON project_members (user_id);

-- Trigger: auto-update updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON project_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Policies (scoped via project's tenant_id through join)
CREATE POLICY project_members_select ON project_members FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM projects p WHERE p.id = project_id AND p.tenant_id = get_current_tenant_id()
  ));
CREATE POLICY project_members_insert ON project_members FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM projects p WHERE p.id = project_id AND p.tenant_id = get_current_tenant_id()
  ));
CREATE POLICY project_members_update ON project_members FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM projects p WHERE p.id = project_id AND p.tenant_id = get_current_tenant_id()
  ));
CREATE POLICY project_members_delete ON project_members FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM projects p WHERE p.id = project_id AND p.tenant_id = get_current_tenant_id()
  ));

-- ═══════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════
-- To reverse this migration, run:
--
--   DROP TABLE IF EXISTS project_members CASCADE;
--   DROP TABLE IF EXISTS project_tasks CASCADE;
--   DROP TABLE IF EXISTS projects CASCADE;
-- ═══════════════════════════════════════════════════════════════
