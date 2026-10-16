// ---------------------------------------------------------------------------
// GENERATED FILE — do not edit by hand.
// ---------------------------------------------------------------------------
// Produced by scripts/mcp/gen-types.mjs from the live PostgREST schema
// (GET /rest/v1/), which publishes every table, column, type, enum and
// default. Regenerate after any migration:
//
//   SB_URL=... SB_KEY=... node scripts/mcp/gen-types.mjs > apps/web/lib/database.types.ts
//
// Why not `supabase gen types`: that needs a Management API access token,
// a different credential from the service-role key. If you have one, its
// output is a drop-in replacement for this file — the shape is the same.
//
// Scope note: function Args/Returns are untyped. PostgREST's OpenAPI does
// not describe RPC signatures in enough detail to generate them, and a
// wrong signature would be worse than an honest `unknown`.
//
// Tables: 103
// Functions: 40
// Generated: 2026-10-16T02:07:58.012Z
// ---------------------------------------------------------------------------

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // supabase-js 2.75+ reads this marker to decide which PostgREST dialect
  // the client speaks. Without it the Database generic is discarded and
  // SupabaseClient<Database> silently behaves as SupabaseClient<any> — the
  // types compile, the client validates nothing, and an invented column
  // goes straight through to a runtime 400.
  __InternalSupabase: {
    PostgrestVersion: '12'
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          id: string
          name: string
          email: string | null
          updated_at: string | null
          created_at: string | null
          created_by: string | null
          updated_by: string | null
          picture_url: string | null
          public_data: Json
        }
        Insert: {
          id?: string
          name: string
          email?: string | null
          updated_at?: string | null
          created_at?: string | null
          created_by?: string | null
          updated_by?: string | null
          picture_url?: string | null
          public_data?: Json
        }
        Update: {
          id?: string
          name?: string
          email?: string | null
          updated_at?: string | null
          created_at?: string | null
          created_by?: string | null
          updated_by?: string | null
          picture_url?: string | null
          public_data?: Json
        }
        Relationships: []
      }
      agent_organizations: {
        Row: {
          id: string
          tenant_id: string
          agent_id: string
          organization_id: string
          access_level: string
          is_default: boolean | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          agent_id: string
          organization_id: string
          access_level?: string
          is_default?: boolean | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          agent_id?: string
          organization_id?: string
          access_level?: string
          is_default?: boolean | null
          created_at?: string
        }
        Relationships: []
      }
      agents: {
        Row: {
          id: string
          tenant_id: string
          user_id: string
          name: string
          email: string
          role: "admin" | "supervisor" | "agent" | "readonly"
          profile_id: string | null
          skills: string[] | null
          avatar_url: string | null
          is_active: boolean | null
          last_active_at: string | null
          settings: Json | null
          created_at: string
          updated_at: string
          search_tsv: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          user_id: string
          name: string
          email: string
          role?: "admin" | "supervisor" | "agent" | "readonly"
          profile_id?: string | null
          skills?: string[] | null
          avatar_url?: string | null
          is_active?: boolean | null
          last_active_at?: string | null
          settings?: Json | null
          created_at?: string
          updated_at?: string
          search_tsv?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          user_id?: string
          name?: string
          email?: string
          role?: "admin" | "supervisor" | "agent" | "readonly"
          profile_id?: string | null
          skills?: string[] | null
          avatar_url?: string | null
          is_active?: boolean | null
          last_active_at?: string | null
          settings?: Json | null
          created_at?: string
          updated_at?: string
          search_tsv?: string | null
        }
        Relationships: []
      }
      ai_agents: {
        Row: {
          id: string
          tenant_id: string
          agent_type: "triage" | "support" | "resolution" | "routing" | "escalation" | "analytics" | "quality" | "inbox"
          name: string
          system_prompt: string | null
          model: string | null
          temperature: number | null
          tools_enabled: string[] | null
          knowledge_sources: Json | null
          is_active: boolean | null
          config: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          agent_type: "triage" | "support" | "resolution" | "routing" | "escalation" | "analytics" | "quality" | "inbox"
          name: string
          system_prompt?: string | null
          model?: string | null
          temperature?: number | null
          tools_enabled?: string[] | null
          knowledge_sources?: Json | null
          is_active?: boolean | null
          config?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          agent_type?: "triage" | "support" | "resolution" | "routing" | "escalation" | "analytics" | "quality" | "inbox"
          name?: string
          system_prompt?: string | null
          model?: string | null
          temperature?: number | null
          tools_enabled?: string[] | null
          knowledge_sources?: Json | null
          is_active?: boolean | null
          config?: Json | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_dashboard_insights: {
        Row: {
          id: string
          tenant_id: string
          organization_id: string | null
          insight_type: string
          title: string
          description: string
          confidence: number | null
          severity: string | null
          metadata: Json | null
          generated_at: string
          expires_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          organization_id?: string | null
          insight_type: string
          title: string
          description: string
          confidence?: number | null
          severity?: string | null
          metadata?: Json | null
          generated_at?: string
          expires_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          organization_id?: string | null
          insight_type?: string
          title?: string
          description?: string
          confidence?: number | null
          severity?: string | null
          metadata?: Json | null
          generated_at?: string
          expires_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      ai_performance_metrics: {
        Row: {
          id: string
          tenant_id: string
          date: string
          auto_classification_rate: number
          ai_resolved_no_human: number
          ai_assisted_resolution: number
          total_tickets: number
          ai_classified_tickets: number
          ai_resolved_tickets: number
          ai_assisted_tickets: number
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          date: string
          auto_classification_rate?: number
          ai_resolved_no_human?: number
          ai_assisted_resolution?: number
          total_tickets?: number
          ai_classified_tickets?: number
          ai_resolved_tickets?: number
          ai_assisted_tickets?: number
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          date?: string
          auto_classification_rate?: number
          ai_resolved_no_human?: number
          ai_assisted_resolution?: number
          total_tickets?: number
          ai_classified_tickets?: number
          ai_resolved_tickets?: number
          ai_assisted_tickets?: number
          created_at?: string
        }
        Relationships: []
      }
      api_keys: {
        Row: {
          id: string
          tenant_id: string
          name: string
          description: string | null
          environment: "live" | "test"
          key_prefix: string
          key_hash: string
          scopes: string[]
          rate_limit_rpm: number
          organization_ids: string[] | null
          metadata: Json
          is_active: boolean
          expires_at: string | null
          last_used_at: string | null
          last_used_ip: string | null
          usage_count: number
          created_by: string | null
          revoked_at: string | null
          revoked_by: string | null
          created_at: string
          updated_at: string
          actor_agent_id: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          name: string
          description?: string | null
          environment?: "live" | "test"
          key_prefix: string
          key_hash: string
          scopes?: string[]
          rate_limit_rpm?: number
          organization_ids?: string[] | null
          metadata?: Json
          is_active?: boolean
          expires_at?: string | null
          last_used_at?: string | null
          last_used_ip?: string | null
          usage_count?: number
          created_by?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          created_at?: string
          updated_at?: string
          actor_agent_id?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          name?: string
          description?: string | null
          environment?: "live" | "test"
          key_prefix?: string
          key_hash?: string
          scopes?: string[]
          rate_limit_rpm?: number
          organization_ids?: string[] | null
          metadata?: Json
          is_active?: boolean
          expires_at?: string | null
          last_used_at?: string | null
          last_used_ip?: string | null
          usage_count?: number
          created_by?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          created_at?: string
          updated_at?: string
          actor_agent_id?: string | null
        }
        Relationships: []
      }
      asset_assignments: {
        Row: {
          id: string
          tenant_id: string
          asset_id: string
          agent_id: string
          assigned_at: string
          returned_at: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          asset_id: string
          agent_id: string
          assigned_at?: string
          returned_at?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          asset_id?: string
          agent_id?: string
          assigned_at?: string
          returned_at?: string | null
          notes?: string | null
          created_at?: string
        }
        Relationships: []
      }
      asset_types: {
        Row: {
          id: string
          tenant_id: string
          name: string
          description: string | null
          icon: string | null
          is_active: boolean | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          name: string
          description?: string | null
          icon?: string | null
          is_active?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          name?: string
          description?: string | null
          icon?: string | null
          is_active?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      assets: {
        Row: {
          id: string
          tenant_id: string
          asset_tag: string
          name: string
          asset_type_id: string | null
          status: string
          serial_number: string | null
          purchase_date: string | null
          purchase_cost: number | null
          location: string | null
          assigned_to: string | null
          notes: string | null
          created_at: string
          updated_at: string
          organization_id: string | null
          search_tsv: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          asset_tag: string
          name: string
          asset_type_id?: string | null
          status?: string
          serial_number?: string | null
          purchase_date?: string | null
          purchase_cost?: number | null
          location?: string | null
          assigned_to?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
          organization_id?: string | null
          search_tsv?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          asset_tag?: string
          name?: string
          asset_type_id?: string | null
          status?: string
          serial_number?: string | null
          purchase_date?: string | null
          purchase_cost?: number | null
          location?: string | null
          assigned_to?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
          organization_id?: string | null
          search_tsv?: string | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          id: string
          tenant_id: string
          user_id: string | null
          action: string
          resource_type: string | null
          resource_id: string | null
          changes: Json | null
          ip_address: string | null
          user_agent: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          user_id?: string | null
          action: string
          resource_type?: string | null
          resource_id?: string | null
          changes?: Json | null
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          user_id?: string | null
          action?: string
          resource_type?: string | null
          resource_id?: string | null
          changes?: Json | null
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string
        }
        Relationships: []
      }
      calendar_holidays: {
        Row: {
          id: string
          tenant_id: string
          calendar_id: string
          name: string
          date: string
          is_recurring: boolean | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          calendar_id: string
          name: string
          date: string
          is_recurring?: boolean | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          calendar_id?: string
          name?: string
          date?: string
          is_recurring?: boolean | null
          created_at?: string
        }
        Relationships: []
      }
      calendar_schedules: {
        Row: {
          id: string
          tenant_id: string
          calendar_id: string
          day_of_week: number
          start_time: string
          end_time: string
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          calendar_id: string
          day_of_week: number
          start_time: string
          end_time: string
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          calendar_id?: string
          day_of_week?: number
          start_time?: string
          end_time?: string
          created_at?: string
        }
        Relationships: []
      }
      calendars: {
        Row: {
          id: string
          tenant_id: string
          name: string
          description: string | null
          timezone: string | null
          is_default: boolean | null
          is_active: boolean | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          name: string
          description?: string | null
          timezone?: string | null
          is_default?: boolean | null
          is_active?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          name?: string
          description?: string | null
          timezone?: string | null
          is_default?: boolean | null
          is_active?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          id: string
          tenant_id: string
          name: string
          parent_id: string | null
          applies_to: string[] | null
          default_group_id: string | null
          default_sla_id: string | null
          icon: string | null
          sort_order: number | null
          is_active: boolean | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          name: string
          parent_id?: string | null
          applies_to?: string[] | null
          default_group_id?: string | null
          default_sla_id?: string | null
          icon?: string | null
          sort_order?: number | null
          is_active?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          name?: string
          parent_id?: string | null
          applies_to?: string[] | null
          default_group_id?: string | null
          default_sla_id?: string | null
          icon?: string | null
          sort_order?: number | null
          is_active?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      change_costs: {
        Row: {
          id: string
          tenant_id: string
          change_id: string
          cost_type: string
          amount: number
          currency: string | null
          description: string | null
          agent_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          change_id: string
          cost_type: string
          amount: number
          currency?: string | null
          description?: string | null
          agent_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          change_id?: string
          cost_type?: string
          amount?: number
          currency?: string | null
          description?: string | null
          agent_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      change_tasks: {
        Row: {
          id: string
          tenant_id: string
          change_id: string
          title: string
          description: string | null
          status: string | null
          assigned_agent_id: string | null
          due_date: string | null
          estimated_hours: number | null
          actual_hours: number | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          change_id: string
          title: string
          description?: string | null
          status?: string | null
          assigned_agent_id?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          actual_hours?: number | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          change_id?: string
          title?: string
          description?: string | null
          status?: string | null
          assigned_agent_id?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          actual_hours?: number | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      change_validations: {
        Row: {
          id: string
          tenant_id: string
          change_id: string
          validator_id: string
          status: string | null
          comment: string | null
          validated_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          change_id: string
          validator_id: string
          status?: string | null
          comment?: string | null
          validated_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          change_id?: string
          validator_id?: string
          status?: string | null
          comment?: string | null
          validated_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      changes: {
        Row: {
          id: string
          tenant_id: string
          change_number: string
          title: string
          description: string | null
          status: "new" | "evaluation" | "approval_pending" | "approved" | "scheduled" | "in_progress" | "testing" | "implemented" | "rolled_back" | "closed" | "rejected"
          change_type: "standard" | "normal" | "emergency"
          risk_level: "low" | "medium" | "high" | "critical"
          impact_analysis: string | null
          rollback_plan: string | null
          implementation_plan: string | null
          scheduled_start: string | null
          scheduled_end: string | null
          actual_start: string | null
          actual_end: string | null
          category_id: string | null
          assigned_agent_id: string | null
          assigned_group_id: string | null
          approval_status: string | null
          ai_risk_assessment: Json | null
          ai_impact_analysis: Json | null
          created_by: string | null
          deleted_at: string | null
          created_at: string
          updated_at: string
          search_tsv: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          change_number?: string
          title: string
          description?: string | null
          status?: "new" | "evaluation" | "approval_pending" | "approved" | "scheduled" | "in_progress" | "testing" | "implemented" | "rolled_back" | "closed" | "rejected"
          change_type?: "standard" | "normal" | "emergency"
          risk_level?: "low" | "medium" | "high" | "critical"
          impact_analysis?: string | null
          rollback_plan?: string | null
          implementation_plan?: string | null
          scheduled_start?: string | null
          scheduled_end?: string | null
          actual_start?: string | null
          actual_end?: string | null
          category_id?: string | null
          assigned_agent_id?: string | null
          assigned_group_id?: string | null
          approval_status?: string | null
          ai_risk_assessment?: Json | null
          ai_impact_analysis?: Json | null
          created_by?: string | null
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
          search_tsv?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          change_number?: string
          title?: string
          description?: string | null
          status?: "new" | "evaluation" | "approval_pending" | "approved" | "scheduled" | "in_progress" | "testing" | "implemented" | "rolled_back" | "closed" | "rejected"
          change_type?: "standard" | "normal" | "emergency"
          risk_level?: "low" | "medium" | "high" | "critical"
          impact_analysis?: string | null
          rollback_plan?: string | null
          implementation_plan?: string | null
          scheduled_start?: string | null
          scheduled_end?: string | null
          actual_start?: string | null
          actual_end?: string | null
          category_id?: string | null
          assigned_agent_id?: string | null
          assigned_group_id?: string | null
          approval_status?: string | null
          ai_risk_assessment?: Json | null
          ai_impact_analysis?: Json | null
          created_by?: string | null
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
          search_tsv?: string | null
        }
        Relationships: []
      }
      contacts: {
        Row: {
          id: string
          tenant_id: string
          name: string | null
          email: string | null
          phone: string | null
          whatsapp_id: string | null
          company: string | null
          avatar_url: string | null
          channel_identifiers: Json | null
          metadata: Json | null
          created_at: string
          updated_at: string
          organization_id: string | null
          search_tsv: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          name?: string | null
          email?: string | null
          phone?: string | null
          whatsapp_id?: string | null
          company?: string | null
          avatar_url?: string | null
          channel_identifiers?: Json | null
          metadata?: Json | null
          created_at?: string
          updated_at?: string
          organization_id?: string | null
          search_tsv?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          name?: string | null
          email?: string | null
          phone?: string | null
          whatsapp_id?: string | null
          company?: string | null
          avatar_url?: string | null
          channel_identifiers?: Json | null
          metadata?: Json | null
          created_at?: string
          updated_at?: string
          organization_id?: string | null
          search_tsv?: string | null
        }
        Relationships: []
      }
      cron_config: {
        Row: {
          key: string
          value: string
          updated_at: string
        }
        Insert: {
          key: string
          value: string
          updated_at?: string
        }
        Update: {
          key?: string
          value?: string
          updated_at?: string
        }
        Relationships: []
      }
      daily_metrics: {
        Row: {
          id: string
          tenant_id: string
          date: string
          ticket_type: string | null
          status: string | null
          channel: string | null
          priority: number | null
          group_id: string | null
          count: number
          avg_resolution_minutes: number | null
          sla_met_count: number | null
          sla_breached_count: number | null
          created_at: string
          updated_at: string
          organization_id: string | null
          category_id: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          date: string
          ticket_type?: string | null
          status?: string | null
          channel?: string | null
          priority?: number | null
          group_id?: string | null
          count?: number
          avg_resolution_minutes?: number | null
          sla_met_count?: number | null
          sla_breached_count?: number | null
          created_at?: string
          updated_at?: string
          organization_id?: string | null
          category_id?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          date?: string
          ticket_type?: string | null
          status?: string | null
          channel?: string | null
          priority?: number | null
          group_id?: string | null
          count?: number
          avg_resolution_minutes?: number | null
          sla_met_count?: number | null
          sla_breached_count?: number | null
          created_at?: string
          updated_at?: string
          organization_id?: string | null
          category_id?: string | null
        }
        Relationships: []
      }
      effort_conversion: {
        Row: {
          id: string
          tenant_id: string
          size: "S" | "M" | "L" | "XL"
          points: number
          effective_from: string
          effective_to: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          size: "S" | "M" | "L" | "XL"
          points: number
          effective_from?: string
          effective_to?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          size?: "S" | "M" | "L" | "XL"
          points?: number
          effective_from?: string
          effective_to?: string | null
          created_at?: string
        }
        Relationships: []
      }
      form_destinations: {
        Row: {
          id: string
          form_id: string
          tenant_id: string
          destination_type: string
          config: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          form_id: string
          tenant_id: string
          destination_type: string
          config?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          form_id?: string
          tenant_id?: string
          destination_type?: string
          config?: Json | null
          created_at?: string
        }
        Relationships: []
      }
      form_questions: {
        Row: {
          id: string
          section_id: string
          tenant_id: string
          label: string
          field_type: string
          options: Json | null
          is_required: boolean | null
          placeholder: string | null
          validation: Json | null
          sort_order: number | null
          created_at: string
        }
        Insert: {
          id?: string
          section_id: string
          tenant_id: string
          label: string
          field_type: string
          options?: Json | null
          is_required?: boolean | null
          placeholder?: string | null
          validation?: Json | null
          sort_order?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          section_id?: string
          tenant_id?: string
          label?: string
          field_type?: string
          options?: Json | null
          is_required?: boolean | null
          placeholder?: string | null
          validation?: Json | null
          sort_order?: number | null
          created_at?: string
        }
        Relationships: []
      }
      form_sections: {
        Row: {
          id: string
          form_id: string
          tenant_id: string
          title: string | null
          description: string | null
          sort_order: number | null
          created_at: string
        }
        Insert: {
          id?: string
          form_id: string
          tenant_id: string
          title?: string | null
          description?: string | null
          sort_order?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          form_id?: string
          tenant_id?: string
          title?: string | null
          description?: string | null
          sort_order?: number | null
          created_at?: string
        }
        Relationships: []
      }
      form_submissions: {
        Row: {
          id: string
          form_id: string
          tenant_id: string
          contact_id: string | null
          answers: Json
          ticket_id: string | null
          status: string
          created_at: string
        }
        Insert: {
          id?: string
          form_id: string
          tenant_id: string
          contact_id?: string | null
          answers?: Json
          ticket_id?: string | null
          status?: string
          created_at?: string
        }
        Update: {
          id?: string
          form_id?: string
          tenant_id?: string
          contact_id?: string | null
          answers?: Json
          ticket_id?: string | null
          status?: string
          created_at?: string
        }
        Relationships: []
      }
      forms: {
        Row: {
          id: string
          tenant_id: string
          service_catalog_id: string | null
          name: string
          description: string | null
          is_active: boolean | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          service_catalog_id?: string | null
          name: string
          description?: string | null
          is_active?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          service_catalog_id?: string | null
          name?: string
          description?: string | null
          is_active?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      group_members: {
        Row: {
          id: string
          group_id: string
          agent_id: string
          role: string | null
          created_at: string
        }
        Insert: {
          id?: string
          group_id: string
          agent_id: string
          role?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          group_id?: string
          agent_id?: string
          role?: string | null
          created_at?: string
        }
        Relationships: []
      }
      groups: {
        Row: {
          id: string
          tenant_id: string
          name: string
          description: string | null
          parent_group_id: string | null
          manager_agent_id: string | null
          email: string | null
          auto_assign: boolean | null
          auto_assign_method: string | null
          calendar_id: string | null
          sla_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          name: string
          description?: string | null
          parent_group_id?: string | null
          manager_agent_id?: string | null
          email?: string | null
          auto_assign?: boolean | null
          auto_assign_method?: string | null
          calendar_id?: string | null
          sla_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          name?: string
          description?: string | null
          parent_group_id?: string | null
          manager_agent_id?: string | null
          email?: string | null
          auto_assign?: boolean | null
          auto_assign_method?: string | null
          calendar_id?: string | null
          sla_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      inbox_channels: {
        Row: {
          id: string
          tenant_id: string
          channel_type: string
          name: string
          config: Json | null
          is_active: boolean | null
          auto_create_ticket: boolean | null
          default_category_id: string | null
          default_group_id: string | null
          ai_processing: boolean | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          channel_type: string
          name: string
          config?: Json | null
          is_active?: boolean | null
          auto_create_ticket?: boolean | null
          default_category_id?: string | null
          default_group_id?: string | null
          ai_processing?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          channel_type?: string
          name?: string
          config?: Json | null
          is_active?: boolean | null
          auto_create_ticket?: boolean | null
          default_category_id?: string | null
          default_group_id?: string | null
          ai_processing?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      inbox_conversations: {
        Row: {
          id: string
          tenant_id: string
          channel_id: string
          contact_id: string | null
          ticket_id: string | null
          status: string
          subject: string | null
          last_message_at: string | null
          assigned_agent_id: string | null
          assigned_group_id: string | null
          ai_summary: string | null
          metadata: Json | null
          created_at: string
          updated_at: string
          organization_id: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          channel_id: string
          contact_id?: string | null
          ticket_id?: string | null
          status?: string
          subject?: string | null
          last_message_at?: string | null
          assigned_agent_id?: string | null
          assigned_group_id?: string | null
          ai_summary?: string | null
          metadata?: Json | null
          created_at?: string
          updated_at?: string
          organization_id?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          channel_id?: string
          contact_id?: string | null
          ticket_id?: string | null
          status?: string
          subject?: string | null
          last_message_at?: string | null
          assigned_agent_id?: string | null
          assigned_group_id?: string | null
          ai_summary?: string | null
          metadata?: Json | null
          created_at?: string
          updated_at?: string
          organization_id?: string | null
        }
        Relationships: []
      }
      inbox_messages: {
        Row: {
          id: string
          tenant_id: string
          conversation_id: string
          direction: string
          sender_type: string
          sender_id: string | null
          content_text: string | null
          content_html: string | null
          attachments: Json | null
          channel_message_id: string | null
          ai_classification: Json | null
          metadata: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          conversation_id: string
          direction: string
          sender_type: string
          sender_id?: string | null
          content_text?: string | null
          content_html?: string | null
          attachments?: Json | null
          channel_message_id?: string | null
          ai_classification?: Json | null
          metadata?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          conversation_id?: string
          direction?: string
          sender_type?: string
          sender_id?: string | null
          content_text?: string | null
          content_html?: string | null
          attachments?: Json | null
          channel_message_id?: string | null
          ai_classification?: Json | null
          metadata?: Json | null
          created_at?: string
        }
        Relationships: []
      }
      kb_article_feedback: {
        Row: {
          id: string
          tenant_id: string
          article_id: string
          user_id: string | null
          is_helpful: boolean
          comment: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          article_id: string
          user_id?: string | null
          is_helpful: boolean
          comment?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          article_id?: string
          user_id?: string | null
          is_helpful?: boolean
          comment?: string | null
          created_at?: string
        }
        Relationships: []
      }
      kb_article_revisions: {
        Row: {
          id: string
          tenant_id: string
          article_id: string
          content_markdown: string
          revised_by: string | null
          revision_note: string | null
          version: number
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          article_id: string
          content_markdown: string
          revised_by?: string | null
          revision_note?: string | null
          version?: number
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          article_id?: string
          content_markdown?: string
          revised_by?: string | null
          revision_note?: string | null
          version?: number
          created_at?: string
        }
        Relationships: []
      }
      kb_articles: {
        Row: {
          id: string
          tenant_id: string
          category_id: string | null
          title: string
          slug: string
          content_markdown: string
          content_html: string | null
          status: "draft" | "published" | "archived"
          author_id: string | null
          is_public: boolean | null
          view_count: number | null
          helpful_count: number | null
          not_helpful_count: number | null
          ai_auto_generated: boolean | null
          tags: string[] | null
          language: string | null
          version: number | null
          published_at: string | null
          deleted_at: string | null
          created_at: string
          updated_at: string
          organization_id: string | null
          search_tsv: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          category_id?: string | null
          title: string
          slug: string
          content_markdown: string
          content_html?: string | null
          status?: "draft" | "published" | "archived"
          author_id?: string | null
          is_public?: boolean | null
          view_count?: number | null
          helpful_count?: number | null
          not_helpful_count?: number | null
          ai_auto_generated?: boolean | null
          tags?: string[] | null
          language?: string | null
          version?: number | null
          published_at?: string | null
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
          organization_id?: string | null
          search_tsv?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          category_id?: string | null
          title?: string
          slug?: string
          content_markdown?: string
          content_html?: string | null
          status?: "draft" | "published" | "archived"
          author_id?: string | null
          is_public?: boolean | null
          view_count?: number | null
          helpful_count?: number | null
          not_helpful_count?: number | null
          ai_auto_generated?: boolean | null
          tags?: string[] | null
          language?: string | null
          version?: number | null
          published_at?: string | null
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
          organization_id?: string | null
          search_tsv?: string | null
        }
        Relationships: []
      }
      kb_categories: {
        Row: {
          id: string
          tenant_id: string
          name: string
          description: string | null
          slug: string
          parent_id: string | null
          icon: string | null
          sort_order: number | null
          is_active: boolean | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          name: string
          description?: string | null
          slug: string
          parent_id?: string | null
          icon?: string | null
          sort_order?: number | null
          is_active?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          name?: string
          description?: string | null
          slug?: string
          parent_id?: string | null
          icon?: string | null
          sort_order?: number | null
          is_active?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      knowledge_documents: {
        Row: {
          id: string
          tenant_id: string
          source_type: "kb_article" | "repository" | "document" | "transcript" | "user_story" | "webpage" | "ticket_solution"
          source_id: string | null
          source_url: string | null
          title: string
          content: string
          metadata: Json | null
          last_synced_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          source_type: "kb_article" | "repository" | "document" | "transcript" | "user_story" | "webpage" | "ticket_solution"
          source_id?: string | null
          source_url?: string | null
          title: string
          content: string
          metadata?: Json | null
          last_synced_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          source_type?: "kb_article" | "repository" | "document" | "transcript" | "user_story" | "webpage" | "ticket_solution"
          source_id?: string | null
          source_url?: string | null
          title?: string
          content?: string
          metadata?: Json | null
          last_synced_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      knowledge_embeddings: {
        Row: {
          id: string
          document_id: string
          tenant_id: string
          chunk_index: number
          chunk_text: string
          embedding: string
          metadata: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          document_id: string
          tenant_id: string
          chunk_index: number
          chunk_text: string
          embedding: string
          metadata?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          document_id?: string
          tenant_id?: string
          chunk_index?: number
          chunk_text?: string
          embedding?: string
          metadata?: Json | null
          created_at?: string
        }
        Relationships: []
      }
      mcp_audit_log: {
        Row: {
          id: number
          tenant_id: string
          api_key_id: string | null
          agent_id: string | null
          channel: string
          tool_name: string
          status: string
          status_code: number | null
          arguments: Json | null
          error_message: string | null
          duration_ms: number | null
          ip_address: string | null
          user_agent: string | null
          request_id: string | null
          created_at: string
        }
        Insert: {
          id: number
          tenant_id: string
          api_key_id?: string | null
          agent_id?: string | null
          channel: string
          tool_name: string
          status: string
          status_code?: number | null
          arguments?: Json | null
          error_message?: string | null
          duration_ms?: number | null
          ip_address?: string | null
          user_agent?: string | null
          request_id?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          tenant_id?: string
          api_key_id?: string | null
          agent_id?: string | null
          channel?: string
          tool_name?: string
          status?: string
          status_code?: number | null
          arguments?: Json | null
          error_message?: string | null
          duration_ms?: number | null
          ip_address?: string | null
          user_agent?: string | null
          request_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      mcp_rate_buckets: {
        Row: {
          api_key_id: string
          bucket_minute: string
          call_count: number
        }
        Insert: {
          api_key_id: string
          bucket_minute: string
          call_count?: number
        }
        Update: {
          api_key_id?: string
          bucket_minute?: string
          call_count?: number
        }
        Relationships: []
      }
      notification_queue: {
        Row: {
          id: string
          tenant_id: string
          template_id: string | null
          channel: string
          recipient_type: string
          recipient_id: string | null
          recipient_address: string | null
          subject: string | null
          body: string | null
          status: string
          attempts: number | null
          last_attempt_at: string | null
          error: string | null
          scheduled_for: string | null
          sent_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          template_id?: string | null
          channel: string
          recipient_type: string
          recipient_id?: string | null
          recipient_address?: string | null
          subject?: string | null
          body?: string | null
          status?: string
          attempts?: number | null
          last_attempt_at?: string | null
          error?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          template_id?: string | null
          channel?: string
          recipient_type?: string
          recipient_id?: string | null
          recipient_address?: string | null
          subject?: string | null
          body?: string | null
          status?: string
          attempts?: number | null
          last_attempt_at?: string | null
          error?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      notification_templates: {
        Row: {
          id: string
          tenant_id: string
          event_type: string
          channel: string
          subject_template: string | null
          body_template: string | null
          is_active: boolean | null
          language: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          event_type: string
          channel: string
          subject_template?: string | null
          body_template?: string | null
          is_active?: boolean | null
          language?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          event_type?: string
          channel?: string
          subject_template?: string | null
          body_template?: string | null
          is_active?: boolean | null
          language?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          id: string
          tenant_id: string
          user_id: string
          title: string
          body: string | null
          link: string | null
          is_read: boolean | null
          resource_type: string | null
          resource_id: string | null
          created_at: string
          updated_at: string
          type: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          user_id: string
          title: string
          body?: string | null
          link?: string | null
          is_read?: boolean | null
          resource_type?: string | null
          resource_id?: string | null
          created_at?: string
          updated_at?: string
          type?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          user_id?: string
          title?: string
          body?: string | null
          link?: string | null
          is_read?: boolean | null
          resource_type?: string | null
          resource_id?: string | null
          created_at?: string
          updated_at?: string
          type?: string | null
        }
        Relationships: []
      }
      nps_surveys: {
        Row: {
          id: string
          tenant_id: string
          ticket_id: string
          organization_id: string | null
          agent_id: string | null
          recipient_email: string
          token: string
          score: number | null
          category: string | null
          comment: string | null
          sent_at: string | null
          responded_at: string | null
          expires_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          ticket_id: string
          organization_id?: string | null
          agent_id?: string | null
          recipient_email: string
          token: string
          score?: number | null
          category?: string | null
          comment?: string | null
          sent_at?: string | null
          responded_at?: string | null
          expires_at?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          ticket_id?: string
          organization_id?: string | null
          agent_id?: string | null
          recipient_email?: string
          token?: string
          score?: number | null
          category?: string | null
          comment?: string | null
          sent_at?: string | null
          responded_at?: string | null
          expires_at?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      oauth_authorization_codes: {
        Row: {
          id: string
          code_hash: string
          client_id: string
          user_id: string
          agent_id: string
          tenant_id: string
          scopes: string[]
          resource: string
          redirect_uri: string
          code_challenge: string
          code_challenge_method: string
          organization_ids: string[] | null
          expires_at: string
          used_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          code_hash: string
          client_id: string
          user_id: string
          agent_id: string
          tenant_id: string
          scopes?: string[]
          resource: string
          redirect_uri: string
          code_challenge: string
          code_challenge_method?: string
          organization_ids?: string[] | null
          expires_at: string
          used_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          code_hash?: string
          client_id?: string
          user_id?: string
          agent_id?: string
          tenant_id?: string
          scopes?: string[]
          resource?: string
          redirect_uri?: string
          code_challenge?: string
          code_challenge_method?: string
          organization_ids?: string[] | null
          expires_at?: string
          used_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      oauth_clients: {
        Row: {
          id: string
          client_id: string
          client_secret_hash: string | null
          client_name: string
          client_uri: string | null
          logo_uri: string | null
          redirect_uris: string[]
          grant_types: string[]
          response_types: string[]
          token_endpoint_auth_method: string
          allowed_scopes: string[]
          is_dynamic: boolean
          is_active: boolean
          tenant_id: string | null
          metadata: Json
          created_at: string
          updated_at: string
          last_used_at: string | null
        }
        Insert: {
          id?: string
          client_id: string
          client_secret_hash?: string | null
          client_name: string
          client_uri?: string | null
          logo_uri?: string | null
          redirect_uris?: string[]
          grant_types?: string[]
          response_types?: string[]
          token_endpoint_auth_method?: string
          allowed_scopes?: string[]
          is_dynamic?: boolean
          is_active?: boolean
          tenant_id?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
          last_used_at?: string | null
        }
        Update: {
          id?: string
          client_id?: string
          client_secret_hash?: string | null
          client_name?: string
          client_uri?: string | null
          logo_uri?: string | null
          redirect_uris?: string[]
          grant_types?: string[]
          response_types?: string[]
          token_endpoint_auth_method?: string
          allowed_scopes?: string[]
          is_dynamic?: boolean
          is_active?: boolean
          tenant_id?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
          last_used_at?: string | null
        }
        Relationships: []
      }
      oauth_tokens: {
        Row: {
          id: string
          token_hash: string
          token_type: string
          client_id: string
          user_id: string
          agent_id: string
          tenant_id: string
          scopes: string[]
          resource: string
          organization_ids: string[] | null
          refresh_parent_id: string | null
          expires_at: string
          revoked_at: string | null
          last_used_at: string | null
          usage_count: number
          created_at: string
        }
        Insert: {
          id?: string
          token_hash: string
          token_type: string
          client_id: string
          user_id: string
          agent_id: string
          tenant_id: string
          scopes?: string[]
          resource: string
          organization_ids?: string[] | null
          refresh_parent_id?: string | null
          expires_at: string
          revoked_at?: string | null
          last_used_at?: string | null
          usage_count?: number
          created_at?: string
        }
        Update: {
          id?: string
          token_hash?: string
          token_type?: string
          client_id?: string
          user_id?: string
          agent_id?: string
          tenant_id?: string
          scopes?: string[]
          resource?: string
          organization_ids?: string[] | null
          refresh_parent_id?: string | null
          expires_at?: string
          revoked_at?: string | null
          last_used_at?: string | null
          usage_count?: number
          created_at?: string
        }
        Relationships: []
      }
      ola_level_actions: {
        Row: {
          id: string
          tenant_id: string
          ola_level_id: string
          action_type: string
          config: Json
          execution_order: number | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          ola_level_id: string
          action_type: string
          config?: Json
          execution_order?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          ola_level_id?: string
          action_type?: string
          config?: Json
          execution_order?: number | null
          created_at?: string
        }
        Relationships: []
      }
      ola_levels: {
        Row: {
          id: string
          tenant_id: string
          ola_id: string
          name: string
          execution_time: number
          is_before_breach: boolean | null
          actions: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          ola_id: string
          name: string
          execution_time: number
          is_before_breach?: boolean | null
          actions?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          ola_id?: string
          name?: string
          execution_time?: number
          is_before_breach?: boolean | null
          actions?: Json | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      olas: {
        Row: {
          id: string
          tenant_id: string
          name: string
          description: string | null
          type: "response" | "resolution" | "update"
          calendar_id: string | null
          target_critical: number
          target_high: number
          target_medium: number
          target_low: number
          is_active: boolean | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          name: string
          description?: string | null
          type?: "response" | "resolution" | "update"
          calendar_id?: string | null
          target_critical?: number
          target_high?: number
          target_medium?: number
          target_low?: number
          is_active?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          name?: string
          description?: string | null
          type?: "response" | "resolution" | "update"
          calendar_id?: string | null
          target_critical?: number
          target_high?: number
          target_medium?: number
          target_low?: number
          is_active?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      organization_support_contracts: {
        Row: {
          id: string
          tenant_id: string
          organization_id: string
          plan_name: string
          monthly_ticket_quota: number
          ticket_unit_price_cop: number
          monthly_fee_cop: number
          calendar_id: string | null
          cycle_start_day: number
          sla_enabled: boolean
          credit_min_tickets: number
          contract_ref: string | null
          notes: string | null
          effective_from: string
          effective_to: string | null
          created_at: string
          updated_at: string
          quota_notices: Json
          notify_client: boolean
          plan_id: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          organization_id: string
          plan_name: string
          monthly_ticket_quota: number
          ticket_unit_price_cop: number
          monthly_fee_cop: number
          calendar_id?: string | null
          cycle_start_day?: number
          sla_enabled?: boolean
          credit_min_tickets?: number
          contract_ref?: string | null
          notes?: string | null
          effective_from: string
          effective_to?: string | null
          created_at?: string
          updated_at?: string
          quota_notices?: Json
          notify_client?: boolean
          plan_id?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          organization_id?: string
          plan_name?: string
          monthly_ticket_quota?: number
          ticket_unit_price_cop?: number
          monthly_fee_cop?: number
          calendar_id?: string | null
          cycle_start_day?: number
          sla_enabled?: boolean
          credit_min_tickets?: number
          contract_ref?: string | null
          notes?: string | null
          effective_from?: string
          effective_to?: string | null
          created_at?: string
          updated_at?: string
          quota_notices?: Json
          notify_client?: boolean
          plan_id?: string | null
        }
        Relationships: []
      }
      organization_users: {
        Row: {
          id: string
          tenant_id: string
          organization_id: string
          user_id: string | null
          name: string
          email: string
          phone: string | null
          role: string | null
          is_active: boolean | null
          last_login_at: string | null
          created_at: string
          updated_at: string
          profile_id: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          organization_id: string
          user_id?: string | null
          name: string
          email: string
          phone?: string | null
          role?: string | null
          is_active?: boolean | null
          last_login_at?: string | null
          created_at?: string
          updated_at?: string
          profile_id?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          organization_id?: string
          user_id?: string | null
          name?: string
          email?: string
          phone?: string | null
          role?: string | null
          is_active?: boolean | null
          last_login_at?: string | null
          created_at?: string
          updated_at?: string
          profile_id?: string | null
        }
        Relationships: []
      }
      organizations: {
        Row: {
          id: string
          tenant_id: string
          name: string
          slug: string
          domain: string | null
          logo_url: string | null
          brand_colors: Json | null
          industry: string | null
          contact_name: string | null
          contact_email: string | null
          contact_phone: string | null
          address: string | null
          notes: string | null
          sla_id: string | null
          settings: Json | null
          is_active: boolean | null
          max_users: number | null
          contract_start: string | null
          contract_end: string | null
          created_at: string
          updated_at: string
          enabled_modules: string[] | null
          ai_context: string | null
          portal_token: string
          inbound_email_slug: string | null
          search_tsv: string | null
          default_group_id: string | null
          default_agent_id: string | null
          default_category_id: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          name: string
          slug: string
          domain?: string | null
          logo_url?: string | null
          brand_colors?: Json | null
          industry?: string | null
          contact_name?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          address?: string | null
          notes?: string | null
          sla_id?: string | null
          settings?: Json | null
          is_active?: boolean | null
          max_users?: number | null
          contract_start?: string | null
          contract_end?: string | null
          created_at?: string
          updated_at?: string
          enabled_modules?: string[] | null
          ai_context?: string | null
          portal_token?: string
          inbound_email_slug?: string | null
          search_tsv?: string | null
          default_group_id?: string | null
          default_agent_id?: string | null
          default_category_id?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          name?: string
          slug?: string
          domain?: string | null
          logo_url?: string | null
          brand_colors?: Json | null
          industry?: string | null
          contact_name?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          address?: string | null
          notes?: string | null
          sla_id?: string | null
          settings?: Json | null
          is_active?: boolean | null
          max_users?: number | null
          contract_start?: string | null
          contract_end?: string | null
          created_at?: string
          updated_at?: string
          enabled_modules?: string[] | null
          ai_context?: string | null
          portal_token?: string
          inbound_email_slug?: string | null
          search_tsv?: string | null
          default_group_id?: string | null
          default_agent_id?: string | null
          default_category_id?: string | null
        }
        Relationships: []
      }
      partner_agents: {
        Row: {
          id: string
          partner_id: string
          tenant_id: string
          user_id: string
          name: string
          email: string
          permissions: Json | null
          is_active: boolean | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          partner_id: string
          tenant_id: string
          user_id: string
          name: string
          email: string
          permissions?: Json | null
          is_active?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          partner_id?: string
          tenant_id?: string
          user_id?: string
          name?: string
          email?: string
          permissions?: Json | null
          is_active?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      partners: {
        Row: {
          id: string
          tenant_id: string
          name: string
          type: string
          contact_email: string | null
          contact_phone: string | null
          sla_id: string | null
          is_active: boolean | null
          api_key: string | null
          config: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          name: string
          type: string
          contact_email?: string | null
          contact_phone?: string | null
          sla_id?: string | null
          is_active?: boolean | null
          api_key?: string | null
          config?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          name?: string
          type?: string
          contact_email?: string | null
          contact_phone?: string | null
          sla_id?: string | null
          is_active?: boolean | null
          api_key?: string | null
          config?: Json | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      portal_activity_log: {
        Row: {
          id: string
          tenant_id: string
          organization_id: string
          session_id: string
          user_email: string | null
          user_name: string | null
          event_type: string
          event_data: Json | null
          page_url: string | null
          user_agent: string | null
          ip_address: string | null
          conversation_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          organization_id: string
          session_id: string
          user_email?: string | null
          user_name?: string | null
          event_type: string
          event_data?: Json | null
          page_url?: string | null
          user_agent?: string | null
          ip_address?: string | null
          conversation_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          organization_id?: string
          session_id?: string
          user_email?: string | null
          user_name?: string | null
          event_type?: string
          event_data?: Json | null
          page_url?: string | null
          user_agent?: string | null
          ip_address?: string | null
          conversation_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      problem_tasks: {
        Row: {
          id: string
          tenant_id: string
          problem_id: string
          title: string
          description: string | null
          status: string | null
          assigned_agent_id: string | null
          due_date: string | null
          estimated_hours: number | null
          actual_hours: number | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          problem_id: string
          title: string
          description?: string | null
          status?: string | null
          assigned_agent_id?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          actual_hours?: number | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          problem_id?: string
          title?: string
          description?: string | null
          status?: string | null
          assigned_agent_id?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          actual_hours?: number | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      problem_ticket_links: {
        Row: {
          id: string
          tenant_id: string
          problem_id: string
          ticket_id: string
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          problem_id: string
          ticket_id: string
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          problem_id?: string
          ticket_id?: string
          created_at?: string
        }
        Relationships: []
      }
      problems: {
        Row: {
          id: string
          tenant_id: string
          problem_number: string
          title: string
          description: string | null
          status: "new" | "accepted" | "analysis" | "root_cause_identified" | "solution_planned" | "resolved" | "closed"
          urgency: "low" | "medium" | "high" | "critical"
          impact: "low" | "medium" | "high" | "critical"
          priority: number
          root_cause: string | null
          root_cause_ai: string | null
          workaround: string | null
          solution: string | null
          category_id: string | null
          assigned_agent_id: string | null
          assigned_group_id: string | null
          ai_pattern_detected: Json | null
          resolved_at: string | null
          created_by: string | null
          deleted_at: string | null
          created_at: string
          updated_at: string
          search_tsv: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          problem_number?: string
          title: string
          description?: string | null
          status?: "new" | "accepted" | "analysis" | "root_cause_identified" | "solution_planned" | "resolved" | "closed"
          urgency?: "low" | "medium" | "high" | "critical"
          impact?: "low" | "medium" | "high" | "critical"
          priority?: number
          root_cause?: string | null
          root_cause_ai?: string | null
          workaround?: string | null
          solution?: string | null
          category_id?: string | null
          assigned_agent_id?: string | null
          assigned_group_id?: string | null
          ai_pattern_detected?: Json | null
          resolved_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
          search_tsv?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          problem_number?: string
          title?: string
          description?: string | null
          status?: "new" | "accepted" | "analysis" | "root_cause_identified" | "solution_planned" | "resolved" | "closed"
          urgency?: "low" | "medium" | "high" | "critical"
          impact?: "low" | "medium" | "high" | "critical"
          priority?: number
          root_cause?: string | null
          root_cause_ai?: string | null
          workaround?: string | null
          solution?: string | null
          category_id?: string | null
          assigned_agent_id?: string | null
          assigned_group_id?: string | null
          ai_pattern_detected?: Json | null
          resolved_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
          search_tsv?: string | null
        }
        Relationships: []
      }
      profile_permissions: {
        Row: {
          id: string
          profile_id: string
          resource: string
          actions: string[]
          scope: "own" | "group" | "all"
          conditions: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          resource: string
          actions?: string[]
          scope?: "own" | "group" | "all"
          conditions?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          resource?: string
          actions?: string[]
          scope?: "own" | "group" | "all"
          conditions?: Json | null
          created_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          tenant_id: string
          name: string
          description: string | null
          is_system: boolean | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          name: string
          description?: string | null
          is_system?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          name?: string
          description?: string | null
          is_system?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_members: {
        Row: {
          id: string
          project_id: string
          user_id: string
          role: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          user_id: string
          role?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          project_id?: string
          user_id?: string
          role?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_tasks: {
        Row: {
          id: string
          tenant_id: string
          project_id: string
          title: string
          description: string | null
          status: string
          assigned_to: string | null
          start_date: string | null
          due_date: string | null
          estimated_hours: number | null
          actual_hours: number | null
          parent_task_id: string | null
          sort_order: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          project_id: string
          title: string
          description?: string | null
          status?: string
          assigned_to?: string | null
          start_date?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          actual_hours?: number | null
          parent_task_id?: string | null
          sort_order?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          project_id?: string
          title?: string
          description?: string | null
          status?: string
          assigned_to?: string | null
          start_date?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          actual_hours?: number | null
          parent_task_id?: string | null
          sort_order?: number | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          id: string
          tenant_id: string
          name: string
          description: string | null
          status: string
          start_date: string | null
          end_date: string | null
          project_manager_id: string | null
          budget: number | null
          actual_cost: number | null
          progress_percent: number | null
          created_at: string
          updated_at: string
          organization_id: string | null
          contract_id: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          name: string
          description?: string | null
          status?: string
          start_date?: string | null
          end_date?: string | null
          project_manager_id?: string | null
          budget?: number | null
          actual_cost?: number | null
          progress_percent?: number | null
          created_at?: string
          updated_at?: string
          organization_id?: string | null
          contract_id?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          name?: string
          description?: string | null
          status?: string
          start_date?: string | null
          end_date?: string | null
          project_manager_id?: string | null
          budget?: number | null
          actual_cost?: number | null
          progress_percent?: number | null
          created_at?: string
          updated_at?: string
          organization_id?: string | null
          contract_id?: string | null
        }
        Relationships: []
      }
      response_templates: {
        Row: {
          id: string
          tenant_id: string
          name: string
          content: string
          category: string | null
          shortcut: string | null
          is_active: boolean | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          name: string
          content: string
          category?: string | null
          shortcut?: string | null
          is_active?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          name?: string
          content?: string
          category?: string | null
          shortcut?: string | null
          is_active?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      rule_actions: {
        Row: {
          id: string
          tenant_id: string
          rule_id: string
          action_type: "assign_agent" | "assign_group" | "set_priority" | "set_status" | "set_category" | "set_type" | "add_tag" | "remove_tag" | "send_notification" | "send_webhook" | "add_follower" | "escalate" | "set_sla" | "add_note" | "run_ai_triage"
          config: Json
          execution_order: number | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          rule_id: string
          action_type: "assign_agent" | "assign_group" | "set_priority" | "set_status" | "set_category" | "set_type" | "add_tag" | "remove_tag" | "send_notification" | "send_webhook" | "add_follower" | "escalate" | "set_sla" | "add_note" | "run_ai_triage"
          config?: Json
          execution_order?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          rule_id?: string
          action_type?: "assign_agent" | "assign_group" | "set_priority" | "set_status" | "set_category" | "set_type" | "add_tag" | "remove_tag" | "send_notification" | "send_webhook" | "add_follower" | "escalate" | "set_sla" | "add_note" | "run_ai_triage"
          config?: Json
          execution_order?: number | null
          created_at?: string
        }
        Relationships: []
      }
      rule_conditions: {
        Row: {
          id: string
          tenant_id: string
          rule_id: string
          field: string
          operator: "equals" | "not_equals" | "contains" | "not_contains" | "starts_with" | "ends_with" | "greater_than" | "less_than" | "in" | "not_in" | "is_null" | "is_not_null" | "between" | "regex"
          value: Json
          logical_group: number | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          rule_id: string
          field: string
          operator?: "equals" | "not_equals" | "contains" | "not_contains" | "starts_with" | "ends_with" | "greater_than" | "less_than" | "in" | "not_in" | "is_null" | "is_not_null" | "between" | "regex"
          value?: Json
          logical_group?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          rule_id?: string
          field?: string
          operator?: "equals" | "not_equals" | "contains" | "not_contains" | "starts_with" | "ends_with" | "greater_than" | "less_than" | "in" | "not_in" | "is_null" | "is_not_null" | "between" | "regex"
          value?: Json
          logical_group?: number | null
          created_at?: string
        }
        Relationships: []
      }
      rule_execution_logs: {
        Row: {
          id: string
          tenant_id: string
          rule_id: string
          ticket_id: string | null
          matched: boolean
          actions_executed: Json | null
          execution_time_ms: number | null
          error_message: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          rule_id: string
          ticket_id?: string | null
          matched?: boolean
          actions_executed?: Json | null
          execution_time_ms?: number | null
          error_message?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          rule_id?: string
          ticket_id?: string | null
          matched?: boolean
          actions_executed?: Json | null
          execution_time_ms?: number | null
          error_message?: string | null
          created_at?: string
        }
        Relationships: []
      }
      rules: {
        Row: {
          id: string
          tenant_id: string
          name: string
          description: string | null
          rule_type: "on_create" | "on_update" | "on_schedule" | "on_sla_breach" | "on_escalation"
          is_active: boolean | null
          priority: number | null
          stop_on_match: boolean | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          name: string
          description?: string | null
          rule_type?: "on_create" | "on_update" | "on_schedule" | "on_sla_breach" | "on_escalation"
          is_active?: boolean | null
          priority?: number | null
          stop_on_match?: boolean | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          name?: string
          description?: string | null
          rule_type?: "on_create" | "on_update" | "on_schedule" | "on_sla_breach" | "on_escalation"
          is_active?: boolean | null
          priority?: number | null
          stop_on_match?: boolean | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      service_catalogs: {
        Row: {
          id: string
          tenant_id: string
          name: string
          description: string | null
          icon: string | null
          sort_order: number | null
          is_active: boolean | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          name: string
          description?: string | null
          icon?: string | null
          sort_order?: number | null
          is_active?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          name?: string
          description?: string | null
          icon?: string | null
          sort_order?: number | null
          is_active?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          id: string
          tenant_id: string
          category_id: string | null
          name: string
          description: string | null
          sla_id: string | null
          owner_group_id: string | null
          is_active: boolean | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          category_id?: string | null
          name: string
          description?: string | null
          sla_id?: string | null
          owner_group_id?: string | null
          is_active?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          category_id?: string | null
          name?: string
          description?: string | null
          sla_id?: string | null
          owner_group_id?: string | null
          is_active?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      sla_due_date_orphans: {
        Row: {
          id: string | null
          ticket_number: string | null
          type: "incident" | "request" | "warranty" | "support" | "backlog" | "desarrollo_pendiente" | null
          status: "new" | "assigned" | "in_progress" | "pending" | "testing" | "resolved" | "closed" | "cancelled" | "backlog" | "detenido" | "reopened" | "esperando_ventana" | null
          organization_id: string | null
          created_at: string | null
          sla_due_date: string | null
        }
        Insert: {
          id?: string | null
          ticket_number?: string | null
          type?: "incident" | "request" | "warranty" | "support" | "backlog" | "desarrollo_pendiente" | null
          status?: "new" | "assigned" | "in_progress" | "pending" | "testing" | "resolved" | "closed" | "cancelled" | "backlog" | "detenido" | "reopened" | "esperando_ventana" | null
          organization_id?: string | null
          created_at?: string | null
          sla_due_date?: string | null
        }
        Update: {
          id?: string | null
          ticket_number?: string | null
          type?: "incident" | "request" | "warranty" | "support" | "backlog" | "desarrollo_pendiente" | null
          status?: "new" | "assigned" | "in_progress" | "pending" | "testing" | "resolved" | "closed" | "cancelled" | "backlog" | "detenido" | "reopened" | "esperando_ventana" | null
          organization_id?: string | null
          created_at?: string | null
          sla_due_date?: string | null
        }
        Relationships: []
      }
      sla_level_actions: {
        Row: {
          id: string
          tenant_id: string
          sla_level_id: string
          action_type: string
          config: Json
          execution_order: number | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          sla_level_id: string
          action_type: string
          config?: Json
          execution_order?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          sla_level_id?: string
          action_type?: string
          config?: Json
          execution_order?: number | null
          created_at?: string
        }
        Relationships: []
      }
      sla_levels: {
        Row: {
          id: string
          tenant_id: string
          sla_id: string
          name: string
          execution_time: number
          is_before_breach: boolean | null
          actions: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          sla_id: string
          name: string
          execution_time: number
          is_before_breach?: boolean | null
          actions?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          sla_id?: string
          name?: string
          execution_time?: number
          is_before_breach?: boolean | null
          actions?: Json | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      slas: {
        Row: {
          id: string
          tenant_id: string
          name: string
          description: string | null
          type: "response" | "resolution" | "update"
          calendar_id: string | null
          target_critical: number
          target_high: number
          target_medium: number
          target_low: number
          is_active: boolean | null
          created_at: string
          updated_at: string
          organization_id: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          name: string
          description?: string | null
          type?: "response" | "resolution" | "update"
          calendar_id?: string | null
          target_critical?: number
          target_high?: number
          target_medium?: number
          target_low?: number
          is_active?: boolean | null
          created_at?: string
          updated_at?: string
          organization_id?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          name?: string
          description?: string | null
          type?: "response" | "resolution" | "update"
          calendar_id?: string | null
          target_critical?: number
          target_high?: number
          target_medium?: number
          target_low?: number
          is_active?: boolean | null
          created_at?: string
          updated_at?: string
          organization_id?: string | null
        }
        Relationships: []
      }
      support_contract_targets: {
        Row: {
          contract_id: string
          tenant_id: string
          severity: "low" | "medium" | "high" | "critical"
          first_response_minutes: number
          mitigation_same_day: boolean
          created_at: string
        }
        Insert: {
          contract_id: string
          tenant_id: string
          severity: "low" | "medium" | "high" | "critical"
          first_response_minutes: number
          mitigation_same_day?: boolean
          created_at?: string
        }
        Update: {
          contract_id?: string
          tenant_id?: string
          severity?: "low" | "medium" | "high" | "critical"
          first_response_minutes?: number
          mitigation_same_day?: boolean
          created_at?: string
        }
        Relationships: []
      }
      support_cycle_closures: {
        Row: {
          id: string
          tenant_id: string
          contract_id: string
          organization_id: string
          cycle_start: string
          cycle_end: string
          quota: number
          consumed: number
          quota_carried: number
          consumed_net: number
          overage: number
          overage_cop: number
          measurable: number
          met: number
          breached: number
          excluded_count: number
          compliance_pct: number | null
          credit_tickets: number
          credit_cop: number
          credit_suppressed: boolean
          closed_at: string
          closed_by_user_id: string | null
          notes: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          contract_id: string
          organization_id: string
          cycle_start: string
          cycle_end: string
          quota: number
          consumed: number
          quota_carried?: number
          consumed_net: number
          overage: number
          overage_cop: number
          measurable: number
          met: number
          breached: number
          excluded_count: number
          compliance_pct?: number | null
          credit_tickets: number
          credit_cop: number
          credit_suppressed?: boolean
          closed_at?: string
          closed_by_user_id?: string | null
          notes?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          contract_id?: string
          organization_id?: string
          cycle_start?: string
          cycle_end?: string
          quota?: number
          consumed?: number
          quota_carried?: number
          consumed_net?: number
          overage?: number
          overage_cop?: number
          measurable?: number
          met?: number
          breached?: number
          excluded_count?: number
          compliance_pct?: number | null
          credit_tickets?: number
          credit_cop?: number
          credit_suppressed?: boolean
          closed_at?: string
          closed_by_user_id?: string | null
          notes?: string | null
        }
        Relationships: []
      }
      support_plans: {
        Row: {
          id: string
          tenant_id: string
          name: string
          tier: number
          monthly_ticket_quota: number
          monthly_fee_cop: number
          ticket_unit_price_cop: number
          p0_minutes: number
          p1_minutes: number
          p2_minutes: number
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          name: string
          tier: number
          monthly_ticket_quota: number
          monthly_fee_cop: number
          ticket_unit_price_cop: number
          p0_minutes: number
          p1_minutes: number
          p2_minutes: number
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          name?: string
          tier?: number
          monthly_ticket_quota?: number
          monthly_fee_cop?: number
          ticket_unit_price_cop?: number
          p0_minutes?: number
          p1_minutes?: number
          p2_minutes?: number
          is_active?: boolean
          created_at?: string
        }
        Relationships: []
      }
      tenant_settings: {
        Row: {
          id: string
          tenant_id: string
          timezone: string | null
          date_format: string | null
          language: string | null
          ticket_prefix: string | null
          auto_assign: boolean | null
          require_category: boolean | null
          ai_auto_triage: boolean | null
          ai_auto_respond: boolean | null
          ai_confidence_threshold: number | null
          ai_model_preference: string | null
          notify_on_create: boolean | null
          notify_on_assign: boolean | null
          notify_on_update: boolean | null
          notify_on_close: boolean | null
          portal_enabled: boolean | null
          portal_ai_enabled: boolean | null
          portal_kb_enabled: boolean | null
          session_timeout: number | null
          mfa_required: boolean | null
          ip_whitelist: string[] | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          timezone?: string | null
          date_format?: string | null
          language?: string | null
          ticket_prefix?: string | null
          auto_assign?: boolean | null
          require_category?: boolean | null
          ai_auto_triage?: boolean | null
          ai_auto_respond?: boolean | null
          ai_confidence_threshold?: number | null
          ai_model_preference?: string | null
          notify_on_create?: boolean | null
          notify_on_assign?: boolean | null
          notify_on_update?: boolean | null
          notify_on_close?: boolean | null
          portal_enabled?: boolean | null
          portal_ai_enabled?: boolean | null
          portal_kb_enabled?: boolean | null
          session_timeout?: number | null
          mfa_required?: boolean | null
          ip_whitelist?: string[] | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          timezone?: string | null
          date_format?: string | null
          language?: string | null
          ticket_prefix?: string | null
          auto_assign?: boolean | null
          require_category?: boolean | null
          ai_auto_triage?: boolean | null
          ai_auto_respond?: boolean | null
          ai_confidence_threshold?: number | null
          ai_model_preference?: string | null
          notify_on_create?: boolean | null
          notify_on_assign?: boolean | null
          notify_on_update?: boolean | null
          notify_on_close?: boolean | null
          portal_enabled?: boolean | null
          portal_ai_enabled?: boolean | null
          portal_kb_enabled?: boolean | null
          session_timeout?: number | null
          mfa_required?: boolean | null
          ip_whitelist?: string[] | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      tenants: {
        Row: {
          id: string
          name: string
          slug: string
          domain: string | null
          plan: "free" | "starter" | "professional" | "enterprise"
          logo_url: string | null
          brand_colors: Json | null
          settings: Json | null
          features_enabled: string[] | null
          max_agents: number | null
          max_ai_queries: number | null
          ai_queries_used: number | null
          subscription_status: "active" | "trial" | "suspended" | "cancelled"
          trial_ends_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          domain?: string | null
          plan?: "free" | "starter" | "professional" | "enterprise"
          logo_url?: string | null
          brand_colors?: Json | null
          settings?: Json | null
          features_enabled?: string[] | null
          max_agents?: number | null
          max_ai_queries?: number | null
          ai_queries_used?: number | null
          subscription_status?: "active" | "trial" | "suspended" | "cancelled"
          trial_ends_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          domain?: string | null
          plan?: "free" | "starter" | "professional" | "enterprise"
          logo_url?: string | null
          brand_colors?: Json | null
          settings?: Json | null
          features_enabled?: string[] | null
          max_agents?: number | null
          max_ai_queries?: number | null
          ai_queries_used?: number | null
          subscription_status?: "active" | "trial" | "suspended" | "cancelled"
          trial_ends_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      ticket_attachments: {
        Row: {
          id: string
          tenant_id: string
          ticket_id: string
          file_name: string
          file_url: string | null
          mime_type: string | null
          file_size: number | null
          uploaded_by: string | null
          created_at: string
          file_path: string | null
          followup_id: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          ticket_id: string
          file_name: string
          file_url?: string | null
          mime_type?: string | null
          file_size?: number | null
          uploaded_by?: string | null
          created_at?: string
          file_path?: string | null
          followup_id?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          ticket_id?: string
          file_name?: string
          file_url?: string | null
          mime_type?: string | null
          file_size?: number | null
          uploaded_by?: string | null
          created_at?: string
          file_path?: string | null
          followup_id?: string | null
        }
        Relationships: []
      }
      ticket_costs: {
        Row: {
          id: string
          tenant_id: string
          ticket_id: string
          cost_type: string
          amount: number
          currency: string | null
          description: string | null
          agent_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          ticket_id: string
          cost_type: string
          amount: number
          currency?: string | null
          description?: string | null
          agent_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          ticket_id?: string
          cost_type?: string
          amount?: number
          currency?: string | null
          description?: string | null
          agent_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      ticket_followers: {
        Row: {
          id: string
          tenant_id: string
          ticket_id: string
          agent_id: string | null
          added_at: string
          added_reason: string | null
          is_auto: boolean
          contact_id: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          ticket_id: string
          agent_id?: string | null
          added_at?: string
          added_reason?: string | null
          is_auto?: boolean
          contact_id?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          ticket_id?: string
          agent_id?: string | null
          added_at?: string
          added_reason?: string | null
          is_auto?: boolean
          contact_id?: string | null
        }
        Relationships: []
      }
      ticket_followups: {
        Row: {
          id: string
          tenant_id: string
          ticket_id: string
          content: string
          content_html: string | null
          is_private: boolean | null
          author_id: string
          author_type: string | null
          created_at: string
          source_ref: string | null
          search_tsv: string | null
          email_message_id: string | null
          mentioned_agent_ids: string[]
          mentioned_contact_ids: string[]
        }
        Insert: {
          id?: string
          tenant_id: string
          ticket_id: string
          content: string
          content_html?: string | null
          is_private?: boolean | null
          author_id: string
          author_type?: string | null
          created_at?: string
          source_ref?: string | null
          search_tsv?: string | null
          email_message_id?: string | null
          mentioned_agent_ids?: string[]
          mentioned_contact_ids?: string[]
        }
        Update: {
          id?: string
          tenant_id?: string
          ticket_id?: string
          content?: string
          content_html?: string | null
          is_private?: boolean | null
          author_id?: string
          author_type?: string | null
          created_at?: string
          source_ref?: string | null
          search_tsv?: string | null
          email_message_id?: string | null
          mentioned_agent_ids?: string[]
          mentioned_contact_ids?: string[]
        }
        Relationships: []
      }
      ticket_metrics: {
        Row: {
          id: string
          tenant_id: string
          ticket_id: string
          first_response_minutes: number | null
          resolution_minutes: number | null
          sla_first_response_met: boolean | null
          sla_resolution_met: boolean | null
          reopen_count: number | null
          reassignment_count: number | null
          followup_count: number | null
          task_count: number | null
          agent_touch_count: number | null
          ai_interactions: number | null
          ai_resolved: boolean | null
          satisfaction_score: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          ticket_id: string
          first_response_minutes?: number | null
          resolution_minutes?: number | null
          sla_first_response_met?: boolean | null
          sla_resolution_met?: boolean | null
          reopen_count?: number | null
          reassignment_count?: number | null
          followup_count?: number | null
          task_count?: number | null
          agent_touch_count?: number | null
          ai_interactions?: number | null
          ai_resolved?: boolean | null
          satisfaction_score?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          ticket_id?: string
          first_response_minutes?: number | null
          resolution_minutes?: number | null
          sla_first_response_met?: boolean | null
          sla_resolution_met?: boolean | null
          reopen_count?: number | null
          reassignment_count?: number | null
          followup_count?: number | null
          task_count?: number | null
          agent_touch_count?: number | null
          ai_interactions?: number | null
          ai_resolved?: boolean | null
          satisfaction_score?: number | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      ticket_partner_assignments: {
        Row: {
          id: string
          tenant_id: string
          ticket_id: string
          partner_id: string
          partner_agent_id: string | null
          status: string
          notes: string | null
          assigned_at: string
          completed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          ticket_id: string
          partner_id: string
          partner_agent_id?: string | null
          status?: string
          notes?: string | null
          assigned_at?: string
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          ticket_id?: string
          partner_id?: string
          partner_agent_id?: string | null
          status?: string
          notes?: string | null
          assigned_at?: string
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      ticket_recurrents: {
        Row: {
          id: string
          tenant_id: string
          template_id: string | null
          name: string
          cron_expression: string
          is_active: boolean | null
          last_generated_at: string | null
          next_generate_at: string | null
          config: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          template_id?: string | null
          name: string
          cron_expression: string
          is_active?: boolean | null
          last_generated_at?: string | null
          next_generate_at?: string | null
          config?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          template_id?: string | null
          name?: string
          cron_expression?: string
          is_active?: boolean | null
          last_generated_at?: string | null
          next_generate_at?: string | null
          config?: Json | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      ticket_relations: {
        Row: {
          id: string
          tenant_id: string
          ticket_id: string
          related_ticket_id: string
          relation_type: string
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          ticket_id: string
          related_ticket_id: string
          relation_type: string
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          ticket_id?: string
          related_ticket_id?: string
          relation_type?: string
          created_at?: string
        }
        Relationships: []
      }
      ticket_satisfactions: {
        Row: {
          id: string
          tenant_id: string
          ticket_id: string
          score: number
          comment: string | null
          contact_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          ticket_id: string
          score: number
          comment?: string | null
          contact_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          ticket_id?: string
          score?: number
          comment?: string | null
          contact_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      ticket_solutions: {
        Row: {
          id: string
          tenant_id: string
          ticket_id: string
          content: string
          content_html: string | null
          is_approved: boolean | null
          author_id: string
          ai_generated: boolean | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          ticket_id: string
          content: string
          content_html?: string | null
          is_approved?: boolean | null
          author_id: string
          ai_generated?: boolean | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          ticket_id?: string
          content?: string
          content_html?: string | null
          is_approved?: boolean | null
          author_id?: string
          ai_generated?: boolean | null
          created_at?: string
        }
        Relationships: []
      }
      ticket_status_history: {
        Row: {
          id: string
          ticket_id: string
          tenant_id: string
          organization_id: string | null
          from_status: "new" | "assigned" | "in_progress" | "pending" | "testing" | "resolved" | "closed" | "cancelled" | "backlog" | "detenido" | "reopened" | "esperando_ventana" | null
          to_status: "new" | "assigned" | "in_progress" | "pending" | "testing" | "resolved" | "closed" | "cancelled" | "backlog" | "detenido" | "reopened" | "esperando_ventana"
          changed_at: string
          changed_by_user_id: string | null
          changed_by_agent_id: string | null
          reason: string | null
          created_at: string
          pause_reason: "espera_cliente_info" | "espera_cliente_validacion" | "dependencia_tercero" | "ventana_mantenimiento" | "fuerza_mayor" | "priorizacion_interna" | null
          pauses_sla: boolean
        }
        Insert: {
          id?: string
          ticket_id: string
          tenant_id: string
          organization_id?: string | null
          from_status?: "new" | "assigned" | "in_progress" | "pending" | "testing" | "resolved" | "closed" | "cancelled" | "backlog" | "detenido" | "reopened" | "esperando_ventana" | null
          to_status: "new" | "assigned" | "in_progress" | "pending" | "testing" | "resolved" | "closed" | "cancelled" | "backlog" | "detenido" | "reopened" | "esperando_ventana"
          changed_at?: string
          changed_by_user_id?: string | null
          changed_by_agent_id?: string | null
          reason?: string | null
          created_at?: string
          pause_reason?: "espera_cliente_info" | "espera_cliente_validacion" | "dependencia_tercero" | "ventana_mantenimiento" | "fuerza_mayor" | "priorizacion_interna" | null
          pauses_sla?: boolean
        }
        Update: {
          id?: string
          ticket_id?: string
          tenant_id?: string
          organization_id?: string | null
          from_status?: "new" | "assigned" | "in_progress" | "pending" | "testing" | "resolved" | "closed" | "cancelled" | "backlog" | "detenido" | "reopened" | "esperando_ventana" | null
          to_status?: "new" | "assigned" | "in_progress" | "pending" | "testing" | "resolved" | "closed" | "cancelled" | "backlog" | "detenido" | "reopened" | "esperando_ventana"
          changed_at?: string
          changed_by_user_id?: string | null
          changed_by_agent_id?: string | null
          reason?: string | null
          created_at?: string
          pause_reason?: "espera_cliente_info" | "espera_cliente_validacion" | "dependencia_tercero" | "ventana_mantenimiento" | "fuerza_mayor" | "priorizacion_interna" | null
          pauses_sla?: boolean
        }
        Relationships: []
      }
      ticket_tasks: {
        Row: {
          id: string
          tenant_id: string
          ticket_id: string
          title: string
          description: string | null
          status: string | null
          assigned_agent_id: string | null
          due_date: string | null
          estimated_hours: number | null
          actual_hours: number | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          ticket_id: string
          title: string
          description?: string | null
          status?: string | null
          assigned_agent_id?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          actual_hours?: number | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          ticket_id?: string
          title?: string
          description?: string | null
          status?: string | null
          assigned_agent_id?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          actual_hours?: number | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      ticket_templates: {
        Row: {
          id: string
          tenant_id: string
          name: string
          description: string | null
          predefined_fields: Json | null
          mandatory_fields: string[] | null
          hidden_fields: string[] | null
          readonly_fields: string[] | null
          is_active: boolean | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          name: string
          description?: string | null
          predefined_fields?: Json | null
          mandatory_fields?: string[] | null
          hidden_fields?: string[] | null
          readonly_fields?: string[] | null
          is_active?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          name?: string
          description?: string | null
          predefined_fields?: Json | null
          mandatory_fields?: string[] | null
          hidden_fields?: string[] | null
          readonly_fields?: string[] | null
          is_active?: boolean | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      ticket_type_history: {
        Row: {
          id: string
          ticket_id: string
          tenant_id: string
          organization_id: string | null
          from_type: "incident" | "request" | "warranty" | "support" | "backlog" | "desarrollo_pendiente" | null
          to_type: "incident" | "request" | "warranty" | "support" | "backlog" | "desarrollo_pendiente"
          consumed_quota_before: boolean | null
          consumed_quota_after: boolean
          changed_at: string
          changed_by_user_id: string | null
          changed_by_agent_id: string | null
          reason: string | null
          created_at: string
        }
        Insert: {
          id?: string
          ticket_id: string
          tenant_id: string
          organization_id?: string | null
          from_type?: "incident" | "request" | "warranty" | "support" | "backlog" | "desarrollo_pendiente" | null
          to_type: "incident" | "request" | "warranty" | "support" | "backlog" | "desarrollo_pendiente"
          consumed_quota_before?: boolean | null
          consumed_quota_after: boolean
          changed_at?: string
          changed_by_user_id?: string | null
          changed_by_agent_id?: string | null
          reason?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          ticket_id?: string
          tenant_id?: string
          organization_id?: string | null
          from_type?: "incident" | "request" | "warranty" | "support" | "backlog" | "desarrollo_pendiente" | null
          to_type?: "incident" | "request" | "warranty" | "support" | "backlog" | "desarrollo_pendiente"
          consumed_quota_before?: boolean | null
          consumed_quota_after?: boolean
          changed_at?: string
          changed_by_user_id?: string | null
          changed_by_agent_id?: string | null
          reason?: string | null
          created_at?: string
        }
        Relationships: []
      }
      ticket_validations: {
        Row: {
          id: string
          tenant_id: string
          ticket_id: string
          validator_id: string
          status: string | null
          comment: string | null
          validated_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          ticket_id: string
          validator_id: string
          status?: string | null
          comment?: string | null
          validated_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          ticket_id?: string
          validator_id?: string
          status?: string | null
          comment?: string | null
          validated_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      tickets: {
        Row: {
          id: string
          tenant_id: string
          ticket_number: string
          title: string
          description: string
          description_html: string | null
          type: "incident" | "request" | "warranty" | "support" | "backlog" | "desarrollo_pendiente"
          ai_classification: Json | null
          ai_classified_at: string | null
          ai_classified_by: string | null
          status: "new" | "assigned" | "in_progress" | "pending" | "testing" | "resolved" | "closed" | "cancelled" | "backlog" | "detenido" | "reopened" | "esperando_ventana"
          urgency: "low" | "medium" | "high" | "critical"
          impact: "low" | "medium" | "high" | "critical"
          priority: number
          requester_id: string | null
          requester_email: string | null
          assigned_agent_id: string | null
          assigned_group_id: string | null
          escalation_level: number | null
          sla_id: string | null
          ola_id: string | null
          sla_due_date: string | null
          ola_due_date: string | null
          sla_breached: boolean | null
          ola_breached: boolean | null
          category_id: string | null
          subcategory_id: string | null
          service_id: string | null
          channel: "portal" | "email" | "whatsapp" | "phone" | "api" | "ai_agent" | "web_widget" | null
          inbox_message_id: string | null
          ai_summary: string | null
          ai_suggested_solution: string | null
          ai_evidence: Json | null
          ai_repository_refs: Json | null
          tags: string[] | null
          custom_fields: Json | null
          internal_notes: string | null
          resolved_at: string | null
          closed_at: string | null
          first_response_at: string | null
          created_by: string | null
          updated_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          created_at: string
          updated_at: string
          organization_id: string | null
          search_tsv: string | null
          reopened_count: number
          last_reopened_at: string | null
          testing_strikes: number
          last_testing_strike_at: string | null
          mitigation_due_at: string | null
          mitigation_at: string | null
          mitigation_note: string | null
          correction_plan_at: string | null
          correction_committed_date: string | null
          correction_plan_note: string | null
          sla_applies: boolean
          sla_contract_id: string | null
          sla_target_minutes: number | null
          project_id: string | null
          effort_size: "S" | "M" | "L" | "XL" | null
          effort_points: number | null
        }
        Insert: {
          id?: string
          tenant_id: string
          ticket_number?: string
          title: string
          description: string
          description_html?: string | null
          type?: "incident" | "request" | "warranty" | "support" | "backlog" | "desarrollo_pendiente"
          ai_classification?: Json | null
          ai_classified_at?: string | null
          ai_classified_by?: string | null
          status?: "new" | "assigned" | "in_progress" | "pending" | "testing" | "resolved" | "closed" | "cancelled" | "backlog" | "detenido" | "reopened" | "esperando_ventana"
          urgency?: "low" | "medium" | "high" | "critical"
          impact?: "low" | "medium" | "high" | "critical"
          priority?: number
          requester_id?: string | null
          requester_email?: string | null
          assigned_agent_id?: string | null
          assigned_group_id?: string | null
          escalation_level?: number | null
          sla_id?: string | null
          ola_id?: string | null
          sla_due_date?: string | null
          ola_due_date?: string | null
          sla_breached?: boolean | null
          ola_breached?: boolean | null
          category_id?: string | null
          subcategory_id?: string | null
          service_id?: string | null
          channel?: "portal" | "email" | "whatsapp" | "phone" | "api" | "ai_agent" | "web_widget" | null
          inbox_message_id?: string | null
          ai_summary?: string | null
          ai_suggested_solution?: string | null
          ai_evidence?: Json | null
          ai_repository_refs?: Json | null
          tags?: string[] | null
          custom_fields?: Json | null
          internal_notes?: string | null
          resolved_at?: string | null
          closed_at?: string | null
          first_response_at?: string | null
          created_by?: string | null
          updated_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          created_at?: string
          updated_at?: string
          organization_id?: string | null
          search_tsv?: string | null
          reopened_count?: number
          last_reopened_at?: string | null
          testing_strikes?: number
          last_testing_strike_at?: string | null
          mitigation_due_at?: string | null
          mitigation_at?: string | null
          mitigation_note?: string | null
          correction_plan_at?: string | null
          correction_committed_date?: string | null
          correction_plan_note?: string | null
          sla_applies?: boolean
          sla_contract_id?: string | null
          sla_target_minutes?: number | null
          project_id?: string | null
          effort_size?: "S" | "M" | "L" | "XL" | null
          effort_points?: number | null
        }
        Update: {
          id?: string
          tenant_id?: string
          ticket_number?: string
          title?: string
          description?: string
          description_html?: string | null
          type?: "incident" | "request" | "warranty" | "support" | "backlog" | "desarrollo_pendiente"
          ai_classification?: Json | null
          ai_classified_at?: string | null
          ai_classified_by?: string | null
          status?: "new" | "assigned" | "in_progress" | "pending" | "testing" | "resolved" | "closed" | "cancelled" | "backlog" | "detenido" | "reopened" | "esperando_ventana"
          urgency?: "low" | "medium" | "high" | "critical"
          impact?: "low" | "medium" | "high" | "critical"
          priority?: number
          requester_id?: string | null
          requester_email?: string | null
          assigned_agent_id?: string | null
          assigned_group_id?: string | null
          escalation_level?: number | null
          sla_id?: string | null
          ola_id?: string | null
          sla_due_date?: string | null
          ola_due_date?: string | null
          sla_breached?: boolean | null
          ola_breached?: boolean | null
          category_id?: string | null
          subcategory_id?: string | null
          service_id?: string | null
          channel?: "portal" | "email" | "whatsapp" | "phone" | "api" | "ai_agent" | "web_widget" | null
          inbox_message_id?: string | null
          ai_summary?: string | null
          ai_suggested_solution?: string | null
          ai_evidence?: Json | null
          ai_repository_refs?: Json | null
          tags?: string[] | null
          custom_fields?: Json | null
          internal_notes?: string | null
          resolved_at?: string | null
          closed_at?: string | null
          first_response_at?: string | null
          created_by?: string | null
          updated_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          created_at?: string
          updated_at?: string
          organization_id?: string | null
          search_tsv?: string | null
          reopened_count?: number
          last_reopened_at?: string | null
          testing_strikes?: number
          last_testing_strike_at?: string | null
          mitigation_due_at?: string | null
          mitigation_at?: string | null
          mitigation_note?: string | null
          correction_plan_at?: string | null
          correction_committed_date?: string | null
          correction_plan_note?: string | null
          sla_applies?: boolean
          sla_contract_id?: string | null
          sla_target_minutes?: number | null
          project_id?: string | null
          effort_size?: "S" | "M" | "L" | "XL" | null
          effort_points?: number | null
        }
        Relationships: []
      }
      webhook_logs: {
        Row: {
          id: string
          webhook_id: string
          tenant_id: string
          event: string
          payload: Json | null
          response_status: number | null
          response_body: string | null
          duration_ms: number | null
          created_at: string
        }
        Insert: {
          id?: string
          webhook_id: string
          tenant_id: string
          event: string
          payload?: Json | null
          response_status?: number | null
          response_body?: string | null
          duration_ms?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          webhook_id?: string
          tenant_id?: string
          event?: string
          payload?: Json | null
          response_status?: number | null
          response_body?: string | null
          duration_ms?: number | null
          created_at?: string
        }
        Relationships: []
      }
      webhooks: {
        Row: {
          id: string
          tenant_id: string
          direction: string
          name: string
          url: string
          secret: string | null
          events: string[] | null
          headers: Json | null
          is_active: boolean | null
          last_triggered_at: string | null
          failure_count: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          direction: string
          name: string
          url: string
          secret?: string | null
          events?: string[] | null
          headers?: Json | null
          is_active?: boolean | null
          last_triggered_at?: string | null
          failure_count?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          direction?: string
          name?: string
          url?: string
          secret?: string | null
          events?: string[] | null
          headers?: Json | null
          is_active?: boolean | null
          last_triggered_at?: string | null
          failure_count?: number | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      workflow_executions: {
        Row: {
          id: string
          workflow_id: string
          tenant_id: string
          trigger_resource_type: string | null
          trigger_resource_id: string | null
          status: string
          current_step_id: string | null
          execution_data: Json | null
          started_at: string | null
          completed_at: string | null
          error: string | null
        }
        Insert: {
          id?: string
          workflow_id: string
          tenant_id: string
          trigger_resource_type?: string | null
          trigger_resource_id?: string | null
          status: string
          current_step_id?: string | null
          execution_data?: Json | null
          started_at?: string | null
          completed_at?: string | null
          error?: string | null
        }
        Update: {
          id?: string
          workflow_id?: string
          tenant_id?: string
          trigger_resource_type?: string | null
          trigger_resource_id?: string | null
          status?: string
          current_step_id?: string | null
          execution_data?: Json | null
          started_at?: string | null
          completed_at?: string | null
          error?: string | null
        }
        Relationships: []
      }
      workflow_step_logs: {
        Row: {
          id: string
          execution_id: string
          step_id: string
          status: string
          input_data: Json | null
          output_data: Json | null
          duration_ms: number | null
          created_at: string
        }
        Insert: {
          id?: string
          execution_id: string
          step_id: string
          status: string
          input_data?: Json | null
          output_data?: Json | null
          duration_ms?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          execution_id?: string
          step_id?: string
          status?: string
          input_data?: Json | null
          output_data?: Json | null
          duration_ms?: number | null
          created_at?: string
        }
        Relationships: []
      }
      workflow_steps: {
        Row: {
          id: string
          workflow_id: string
          step_type: string
          name: string | null
          config: Json | null
          position_x: number | null
          position_y: number | null
          next_step_id: string | null
          false_step_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          workflow_id: string
          step_type: string
          name?: string | null
          config?: Json | null
          position_x?: number | null
          position_y?: number | null
          next_step_id?: string | null
          false_step_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          workflow_id?: string
          step_type?: string
          name?: string | null
          config?: Json | null
          position_x?: number | null
          position_y?: number | null
          next_step_id?: string | null
          false_step_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      workflows: {
        Row: {
          id: string
          tenant_id: string
          name: string
          description: string | null
          trigger_type: string | null
          trigger_config: Json | null
          is_active: boolean | null
          version: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          name: string
          description?: string | null
          trigger_type?: string | null
          trigger_config?: Json | null
          is_active?: boolean | null
          version?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          name?: string
          description?: string | null
          trigger_type?: string | null
          trigger_config?: Json | null
          is_active?: boolean | null
          version?: number | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_business_minutes: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      business_minutes_between: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      call_cron_endpoint: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      close_support_cycle: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      end_of_business_day: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      gc_mcp_rate_buckets: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      gc_oauth_expired: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      get_current_tenant_id: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      immutable_unaccent: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      increment_rate_bucket: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      match_knowledge: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      redeem_authorization_code: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      resolve_pause_reason: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      search_global: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      set_pause_reason: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      set_status_change_reason: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      show_limit: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      show_trgm: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      sla_applies_for_ticket: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      sla_pause_reason_pauses: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      sla_tickets_at_risk: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      support_band_status: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      support_contract_at: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      support_cycle_compliance: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      support_cycle_daily_activity: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      support_cycle_for: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      support_cycle_quota_carryforward: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      support_cycle_reclassifications: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      support_cycle_usage: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      support_plan_band: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      support_termination_risk: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      test_imm: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      ticket_clause4_status: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      ticket_dates_plausible: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      ticket_paused_business_minutes: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      ticket_sla_status: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      ticket_type_consumes_quota: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      ticket_type_counts_for_sla: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      verify_api_key: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      verify_oauth_token: {
        Args: Record<string, unknown>
        Returns: unknown
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
