# Setup ngrok + webhook server (POC)

Pasos para tener una URL pública que Meta pueda llamar.

## 1. Instalar ngrok (5 minutos)

### Opción A — winget (recomendado, Windows 10+)
```powershell
winget install Ngrok.Ngrok
```

### Opción B — descarga directa
1. https://ngrok.com/download → descargar Windows ZIP
2. Extraer `ngrok.exe` a `C:\Program Files\ngrok\` (o donde prefieras)
3. Agregarlo al PATH (Sistema → Variables de entorno) o usarlo con ruta completa

### Verificar
```bash
ngrok version
```
Debe responder algo tipo `ngrok version 3.x.x`.

## 2. Crear cuenta gratuita y configurar authtoken

1. https://dashboard.ngrok.com/signup → registrarte (gratis)
2. https://dashboard.ngrok.com/get-started/your-authtoken → copiar tu authtoken
3. En terminal:
   ```bash
   ngrok config add-authtoken <TU_AUTHTOKEN>
   ```

> El plan gratuito da: 1 sesión simultánea, URLs efímeras (cambian cada vez que reinicias ngrok), 40 conexiones/min — más que suficiente para POC.

## 3. Levantar el webhook server local

En **terminal 1** (déjalo corriendo):
```bash
cd C:\Users\freddyrs\Desktop\ITSM\ITSM\Contexto\POC_Whatsapp_Calling_API
node scripts/03a-webhook-server.mjs
```

Salida esperada:
```
✓ Escuchando en http://localhost:3001
```

## 4. Exponer con ngrok

En **terminal 2** (déjalo corriendo):
```bash
ngrok http 3001
```

Salida esperada:
```
Session Status                online
Account                       <tu-email>
Version                       3.x.x
Region                        United States (us)
Forwarding                    https://abcd-1-2-3-4.ngrok-free.app -> http://localhost:3001
```

**Copia la URL `https://...ngrok-free.app`** (la que dice "Forwarding").

## 5. Pegar la URL en .env.local

Edita `Contexto/POC_Whatsapp_Calling_API/.env.local` y setea:

```
WEBHOOK_CALLBACK_URL=https://abcd-1-2-3-4.ngrok-free.app/webhook
```

⚠️ **Importante**: agregá `/webhook` al final. La URL completa es la de ngrok + ruta `/webhook`.

## 6. Configurar el webhook en TixFlow vía API

En **terminal 3**:
```bash
cd C:\Users\freddyrs\Desktop\ITSM\ITSM\Contexto\POC_Whatsapp_Calling_API
node scripts/03b-configure-webhook.mjs
```

El script:
1. Hace un pre-flight: simula la verificación de Meta para asegurarse que tu URL responde bien antes de gastar la petición a Meta.
2. Lee subscriptions actuales en TixFlow.
3. Hace `POST /{APP_ID}/subscriptions` (Meta llamará a tu ngrok con un challenge).
4. Verifica que la subscription quedó activa.

Si todo OK verás `✓ Webhook configurado en TixFlow`.

## 7. Re-correr la activación de Calling

```bash
node scripts/04-enable-calling.mjs
```

Ahora debería pasar (ya no falta el prerequisito).

## Notas

- Si cierras ngrok y lo vuelves a abrir, la URL CAMBIA (plan gratuito). Tendrás que repetir pasos 4-6.
- Si esto te molesta: el plan ngrok pago ($8/mes) tiene URL fija. O migramos a Vercel (Opción B) para POC más estable.
- El log de webhooks recibidos queda en `logs/webhook-events.jsonl`.
