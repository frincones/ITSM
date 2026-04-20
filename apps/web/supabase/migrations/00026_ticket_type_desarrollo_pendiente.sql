-- Add 'desarrollo_pendiente' as a valid ticket_type value for work items that
-- are not yet built (not the same as "backlog", which implies a triaged queue
-- entry; desarrollo_pendiente covers features/fixes still waiting on dev).
ALTER TYPE ticket_type ADD VALUE IF NOT EXISTS 'desarrollo_pendiente';
