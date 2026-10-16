-- ROLLBACK de agent_organizations
-- Respaldo tomado el 2026-10-16T19:42:57.488Z
--
-- Restaura las filas de Freddy y Emma que se borraron para darles
-- visibilidad de todo el tenant. Pegar en el SQL Editor de Supabase.
--
-- Tras restaurar, Freddy vuelve a ver 713 y Emma 710 en /home/tickets.

INSERT INTO agent_organizations (id, tenant_id, agent_id, organization_id, access_level, is_default, created_at)
VALUES ('dfb4ed41-34ee-4409-9ee3-8fcdd670b55d', '8be06573-2e43-4d8f-b81d-48b9cddb060d', '2c38f449-ec8d-4e99-882a-78602ae47b0d', '7336ab13-209c-4fc5-922f-dff97897fdc2', 'full', 'false', '2026-04-16T23:13:18.979Z')
ON CONFLICT (id) DO NOTHING;  -- Emma Castillo -> Podenza
INSERT INTO agent_organizations (id, tenant_id, agent_id, organization_id, access_level, is_default, created_at)
VALUES ('94a7eb4e-de32-445d-a30e-35f20b202b1b', '8be06573-2e43-4d8f-b81d-48b9cddb060d', '2c38f449-ec8d-4e99-882a-78602ae47b0d', '5c32a495-68f5-4f83-aff2-d8050347bb71', 'full', 'false', '2026-04-16T23:13:19.494Z')
ON CONFLICT (id) DO NOTHING;  -- Emma Castillo -> Prosuministros
INSERT INTO agent_organizations (id, tenant_id, agent_id, organization_id, access_level, is_default, created_at)
VALUES ('a48033ea-660c-4a80-aeec-6734ed7db7be', '8be06573-2e43-4d8f-b81d-48b9cddb060d', '9f44a9cf-a058-4adc-af6b-b351e66ff25d', '2f7b4c5e-69ff-417b-aba8-b1174bbeedf2', 'full', 'false', '2026-06-19T17:06:37.960Z')
ON CONFLICT (id) DO NOTHING;  -- Freddy Rincones -> ITSM- TDX
INSERT INTO agent_organizations (id, tenant_id, agent_id, organization_id, access_level, is_default, created_at)
VALUES ('239c73c8-cc72-4d75-8ced-201617f9dba6', '8be06573-2e43-4d8f-b81d-48b9cddb060d', '9f44a9cf-a058-4adc-af6b-b351e66ff25d', '7336ab13-209c-4fc5-922f-dff97897fdc2', 'full', 'false', '2026-03-27T21:13:03.943Z')
ON CONFLICT (id) DO NOTHING;  -- Freddy Rincones -> Podenza
INSERT INTO agent_organizations (id, tenant_id, agent_id, organization_id, access_level, is_default, created_at)
VALUES ('ac77c4c8-e2d6-4876-ab2e-ada0890ee59c', '8be06573-2e43-4d8f-b81d-48b9cddb060d', '9f44a9cf-a058-4adc-af6b-b351e66ff25d', '5c32a495-68f5-4f83-aff2-d8050347bb71', 'full', 'false', '2026-06-19T17:06:37.960Z')
ON CONFLICT (id) DO NOTHING;  -- Freddy Rincones -> Prosuministros

-- Verificar tras restaurar:
--   SELECT a.name, count(*) FROM agent_organizations ao
--     JOIN agents a ON a.id=ao.agent_id GROUP BY a.name;