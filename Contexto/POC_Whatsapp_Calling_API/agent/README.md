# Python Agent — TixFlow WhatsApp Calling + OpenAI Realtime

Reemplaza al webhook server Node y agrega manejo de llamadas WebRTC con OpenAI Realtime.

## Arquitectura

```
WhatsApp (Opus 48k) ──webhook──► Python agent (puerto 3010)
                          │           │
                          │           ├─► aiortc RTCPeerConnection
                          │           │     (negocia SDP con Meta vía POST /calls)
                          │           │
                          │           ├─► OpenAI Realtime WS (PCM16 24k)
                          │           │
                          │           └─► resample 48k↔24k bidireccional
                          ▼
                    cloudflared tunnel
                          │
                          ▼
                  https://...trycloudflare.com/webhook
```

## Estructura

| Archivo | Propósito |
|---|---|
| `main.py` | aiohttp HTTP server, webhook handlers, dispatch por call_id |
| `call_handler.py` | Una clase por llamada: peer aiortc, accept Meta, bridge audio |
| `openai_realtime.py` | Cliente WebSocket OpenAI Realtime (session, audio in/out) |
| `audio.py` | Resampling 48k↔24k + custom AudioSender track |

## Cómo correrlo

### 1. Asegurar venv y dependencias

```bash
cd Contexto/POC_Whatsapp_Calling_API
py -3.11 -m venv agent/.venv
agent/.venv/Scripts/pip install -r agent/requirements.txt
```

### 2. Asegurar prerequisitos

- `.env.local` debe tener: `META_APP_SECRET`, `META_SYSTEM_USER_TOKEN`, `WEBHOOK_VERIFY_TOKEN`, `PHONE_NUMBER_ID`, `OPENAI_API_KEY`
- El webhook Node (puerto 3010) NO debe estar corriendo
- cloudflared debe estar corriendo apuntando a localhost:3010
- La URL de cloudflared debe estar configurada en Meta (ya hecho en script 03b)
- Calling debe estar ENABLED en el número (ya hecho en script 04)

### 3. Arrancar el agente

```bash
agent/.venv/Scripts/python.exe agent/main.py
```

Verás:
```
TixFlow WhatsApp Calling Agent (Python)
  Port:        3010
  Phone:       685418921311130 (+57 312 3626283)
  OpenAI:      gpt-realtime (voice=alloy)
  ...
```

### 4. Hacer una llamada de prueba

Desde tu WhatsApp personal, llama al **+57 312 3626283**.

En los logs verás:
```
webhook calls event=connect id=wacid.IhggMD…
[wacid.IhggMD…] start, from=573153041548
[wacid.IhggMD…] track recibido: audio
[wacid.IhggMD…] connection state: connected
[wacid.IhggMD…] Meta accept OK
OpenAI: WebSocket conectado
OpenAI: session.created model=gpt-realtime voice=alloy
[wacid.IhggMD…] setup OK, llamada activa
OpenAI assistant: Hola, gracias por llamar a TDX...
```

Y deberías oír al agente saludándote en español.

## Logs

- stdout — para debugging interactivo
- `Contexto/POC_Whatsapp_Calling_API/logs/agent.log` — archivo persistente

## Modelos OpenAI alternativos

En `.env.local` cambia `OPENAI_REALTIME_MODEL`:
- `gpt-realtime` — calidad estándar (default)
- `gpt-realtime-mini` — más barato y rápido
- `gpt-realtime-1.5` — versión más reciente

Voces: `alloy`, `ash`, `ballad`, `coral`, `echo`, `sage`, `shimmer`, `verse`.

## Troubleshooting

| Síntoma | Posible causa |
|---|---|
| Llamada timbra eternamente | El agente no respondió al webhook con accept. Ver logs de errores. |
| Audio entrecortado | Lag en resampling o pacing de AudioSender — bajar `OPENAI_REALTIME_MODEL` a `mini` |
| "OpenAI: timeout esperando session.created" | Key inválida o sin acceso al modelo |
| "Meta accept FAIL 400" | El SDP answer es incompatible con la oferta de Meta. Revisar SDP en logs. |
| Puerto 3010 ocupado | Otro server escuchando ahí (ej. el Node webhook viejo) |

## Modificaciones útiles

- Cambiar el saludo inicial: editar `INITIAL_GREETING` en `call_handler.py`
- Cambiar instrucciones del asistente: editar `DEFAULT_INSTRUCTIONS`
- Activar transcripts en log: ya está activo en `openai_realtime.py`
