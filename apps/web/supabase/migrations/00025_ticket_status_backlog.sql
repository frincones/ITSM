-- Add 'backlog' as a valid ticket_status value so clients can park
-- tickets that are queued but not yet actively worked on.
ALTER TYPE ticket_status ADD VALUE IF NOT EXISTS 'backlog';
