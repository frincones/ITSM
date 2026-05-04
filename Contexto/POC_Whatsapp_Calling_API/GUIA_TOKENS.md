# Guía: cómo obtener los tokens de Meta para el POC

Hay dos tokens a conseguir. **Para el POC arranca con el User Access Token (rápido). Para producción genera el System User Token (no expira).**

---

## Opción A — User Access Token (Graph Explorer) — RÁPIDO, expira en ~1-2h

Sirve para validar inmediatamente. Pasos:

1. Abre **Graph API Explorer**: https://developers.facebook.com/tools/explorer/
2. Arriba a la derecha, en el dropdown **"Meta App"**, selecciona **TixFlow** (App ID `937124135788343`).
   - Si no aparece, primero entra como admin a https://developers.facebook.com/apps/937124135788343/ y aparecerá.
3. En **"User or Page"** elige **"User Token"**.
4. Click en **"Add a Permission"** y agrega los siguientes scopes (uno por uno o pegando):
   - `whatsapp_business_management`
   - `whatsapp_business_messaging`
   - `business_management`
   - `pages_show_list` (opcional, ayuda a debug)
5. Click en **"Generate Access Token"**.
6. Te abrirá un popup de Facebook pidiendo permisos — acepta.
7. Aparecerá un token largo (empieza por `EAAN...`). **Cópialo completo.**
8. Pégalo en `.env.local` en la variable `META_USER_ACCESS_TOKEN=...`.

> ⚠️ Este token **expira en ~1-2 horas**. Sirve para validar el POC ahora, no para producción.

### (Opcional) Convertirlo en token de larga duración (~60 días)

```bash
curl "https://graph.facebook.com/v21.0/oauth/access_token?\
grant_type=fb_exchange_token&\
client_id=937124135788343&\
client_secret=9de44d40eb0053e34d9abd09eae8311e&\
fb_exchange_token=<TOKEN_CORTO>"
```

Esto extiende el token a ~60 días. Útil para POC extendido.

---

## Opción B — System User Token (Business Settings) — NO EXPIRA, recomendado para prod

Es lo correcto para una integración real. Pasos:

### 1. Crear (o reusar) un System User en el business "Tdx Sas"

1. Abre https://business.facebook.com/settings/system-users?business_id=<BUSINESS_ID_TDX>
   - Si no sabes el `BUSINESS_ID_TDX`, entra a https://business.facebook.com/settings/, asegúrate que estás en **"Tdx Sas"** (selector arriba a la izquierda) y la URL te lo muestra.
2. Click en **"Add"** (botón azul).
3. Nombre: `tixflow-calling-poc` (o el que prefieras). Rol: **Admin**.
4. Click en **"Create system user"**.

### 2. Asignar la app TixFlow al System User

1. En la lista de System Users, selecciona el que creaste.
2. Click en **"Add Assets"** → pestaña **"Apps"**.
3. Busca **TixFlow** (App ID `937124135788343`), selecciónala y marca **"Develop app"** y **"Manage app"**.
4. Click **"Save Changes"**.

### 3. Asignar la WhatsApp Business Account al System User

1. Mismo System User → **"Add Assets"** → pestaña **"WhatsApp Accounts"**.
2. Busca la WABA `649404611299992` (TDX), selecciónala y marca **"Manage WhatsApp account"** (full control).
3. **"Save Changes"**.

### 4. Generar el token

1. En el System User, click en **"Generate New Token"**.
2. **App**: selecciona **TixFlow** (937124135788343).
3. **Token expiration**: elige **"Never"**.
4. **Permissions** (marca todos los siguientes):
   - `whatsapp_business_management` ✅
   - `whatsapp_business_messaging` ✅
   - `business_management` ✅
5. Click en **"Generate Token"**.
6. Aparecerá el token (empieza con `EAAN...`). **Cópialo. NO lo verás de nuevo.**
7. Pégalo en `.env.local` en la variable `META_SYSTEM_USER_TOKEN=...`.

> ✅ Este token **NO expira** (mientras el System User exista y la app no sea borrada).

---

## ¿Cuál uso primero?

**Recomendación**: genera el **User Access Token (Opción A)** ahora mismo (toma 2 minutos) → me lo pegas en `.env.local` → corremos los scripts de validación → vemos qué funciona y qué no.

Si todo OK, generas el **System User Token (Opción B)** para que el POC pueda quedar corriendo sin recauchar tokens cada hora.

---

## Verificación rápida del token (sin scripts)

Cuando tengas un token, prueba en navegador o curl:

```
https://graph.facebook.com/v21.0/me?access_token=<TOKEN>
```

Debería responder con `{"name": "...", "id": "..."}`. Si responde error 190, el token está mal o expiró.

```
https://graph.facebook.com/v21.0/debug_token?input_token=<TOKEN>&access_token=937124135788343|9de44d40eb0053e34d9abd09eae8311e
```

Devuelve metadata del token: scopes, expiración, app_id, type. Útil para confirmar que tiene los scopes correctos antes de gastar tiempo.

---

## Notas de seguridad

- El App Secret (`9de44d40eb0053e34d9abd09eae8311e`) ya está en `.env.local` (gitignored).
- Los tokens también se guardan en `.env.local`. **Nunca los pegues en commits, issues, mensajes a terceros.**
- Si en algún momento un token se filtra: en https://developers.facebook.com/apps/937124135788343/settings/basic/ → "Reset App Secret"; o en Business Settings → System User → "Revoke Token".
