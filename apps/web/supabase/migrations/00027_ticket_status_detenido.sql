-- Add 'detenido' as a valid ticket_status value — distinct from 'pending'
-- because the Podenza customer journey differentiates Pendiente (blocked
-- waiting for someone) from Detenido (explicitly paused by decision).
ALTER TYPE ticket_status ADD VALUE IF NOT EXISTS 'detenido';
