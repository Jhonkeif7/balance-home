# Familia y correos electrónicos

## Aplicar la migración

1. Abre **SQL Editor** en tu proyecto Supabase.
2. Pega y ejecuta el contenido de  
   `supabase/migrations/20261118_family.sql`.
3. En **Database → Replication**, asegúrate de que la tabla  
   `family_messages` esté habilitada para Realtime.

---

## Correos con SMTP de Gmail (sin dominio propio)

Sustituye Resend. Los correos salen desde tu Gmail hacia **cualquier destinatario**.

### 1. Crear una App Password de Google

1. En tu cuenta Google: [https://myaccount.google.com/security](https://myaccount.google.com/security)
2. Activa **Verificación en 2 pasos** (obligatorio).
3. Busca **Contraseñas de aplicaciones** / *App passwords*.
4. Crea una para “Correo” / “Otro” → nombre `Balance Home`.
5. Copia la clave de **16 caracteres** (puedes pegarla con o sin espacios).

### 2. Secrets en Supabase

**Edge Functions → Secrets** (o Project Settings → Edge Functions → Secrets):

| Nombre | Valor |
|---|---|
| `GMAIL_USER` | `jhonkeifyd7@gmail.com` |
| `GMAIL_APP_PASSWORD` | la App Password de 16 caracteres |
| `FROM_EMAIL` | `Balance Home <jhonkeifyd7@gmail.com>` *(recomendado)* |
| `APP_URL` | URL del frontend, p. ej. `https://balancehomerd.netlify.app` |
| `WEBHOOK_SECRET` | opcional; si lo usas, el trigger/webhook debe enviarlo |

Ya **no** hace falta `RESEND_API_KEY` (puedes borrarlo).

`SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` los inyecta Supabase solo.

### 3. Desplegar Edge Functions

Pega el código completo de cada archivo (son autocontenidos):

| Función | Archivo |
|---|---|
| `notify-family-invite` | `supabase/functions/notify-family-invite/index.ts` |
| `admin-create-user` | `supabase/functions/admin-create-user/index.ts` |

### 4. Trigger / webhook de invitaciones

Si ya tienes el trigger `pg_net` o el Database Webhook apuntando a `notify-family-invite`, no lo cambies: solo redespliega la función.

Si aún no: al insertar en `family_invitations` debe hacer POST a  
`https://wditsxoxypzncoscddxx.supabase.co/functions/v1/notify-family-invite`  
con `Authorization: Bearer <anon key>`.

### 5. Crear usuarios desde Configuración

1. Despliega `admin-create-user`.
2. En la app: **Configuración → Crear usuario**.
3. Contraseña temporal: `123456`.
4. Se envía bienvenida por Gmail SMTP.

### Límites / avisos

- Gmail tiene cupos diarios (~100–500 según la cuenta); no es para marketing masivo.
- Algunos destinatarios pueden marcar el correo como spam.
- No subas la App Password al chat ni a git.

---

## Otras notas

**Authentication → SMTP** de Supabase sirve para reset de contraseña de Auth, no para estos correos de la app. Esos van por las Edge Functions + Gmail.
