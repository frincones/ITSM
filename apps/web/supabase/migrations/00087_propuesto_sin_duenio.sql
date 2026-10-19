-- ---------------------------------------------------------------------------
-- 00087 · «Por iniciar» no tiene dueño
-- ---------------------------------------------------------------------------
-- La fase `propuesto` se sembró con owner = 'cliente' en 00076, heredado de
-- cuando era la bandeja del portal donde el cliente proponía trabajo.
--
-- Pero ahora significa otra cosa: «está en el ciclo y todavía no arranca». Y
-- con dueño cliente, su tiempo se suma a client_delay_minutes aunque no tenga
-- plazo. Hoy son 12,5 horas de cinco entregables que nadie ha empezado, y
-- crecen solas cada día.
--
-- Eso contradice la regla del propio tablero: no haber empezado es legítimo,
-- no un atraso de nadie. Pasa a 'ninguno', como despliegue y entregado.
-- ---------------------------------------------------------------------------

UPDATE delivery_phases SET owner = 'ninguno' WHERE phase = 'propuesto';

-- Los tramos ya abiertos conservan el dueño congelado, así que hay que
-- corregirlos a mano: el trigger solo lo fija al abrirlos.
UPDATE ticket_phase_log
   SET owner = 'ninguno'
 WHERE phase = 'propuesto' AND exited_at IS NULL;
