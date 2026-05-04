# POC — WhatsApp Business Calling API + AI Voice

POC para integrar WhatsApp Calling API (Meta) con un servicio AI voice realtime (LiveKit + Claude).

## Estado

| Paso | Estado |
|---|---|
| Investigación AI Voice (LiveKit, Vapi, Retell, etc.) | ✅ |
| Investigación requisitos WhatsApp Calling API | ✅ |
| App Meta TixFlow creada (937124135788343) | ✅ |
| App Secret guardado en .env.local | ✅ |
| User Access Token / System User Token | ⏳ pendiente — ver `GUIA_TOKENS.md` |
| Scripts de validación read-only | ⏳ |
| Suscripción de TixFlow a WABA | ⏳ |
| Activación de Calling en +57 312 3626283 | ⏳ |
| Setup LiveKit + SIP trunk a wa.meta.vc | ⏳ |
| Agente Claude conectado | ⏳ |
| Llamada end-to-end de prueba | ⏳ |

## Archivos

- `.env.local` — credenciales (gitignored)
- `GUIA_TOKENS.md` — cómo obtener los tokens faltantes
- `scripts/` — scripts de validación y setup (próximamente)

## Recursos Meta

- **App**: TixFlow — `937124135788343` (modo desarrollo)
- **Negocio**: Tdx Sas
- **WABA**: `649404611299992` (TDX, USD billing)
- **Phone**: +57 312 3626283 — `685418921311130` (Cloud API, GREEN, APPROVED)

## Próximo paso

Generar User Access Token siguiendo `GUIA_TOKENS.md` → pegarlo en `.env.local` → correr scripts de validación.
