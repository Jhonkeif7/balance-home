// Edge Function: admin-create-user
// Crea un usuario Auth con contraseña temporal fija y envía correo de bienvenida
// vía SMTP de Gmail (sustituye Resend).
//
// Secrets (Edge Functions → Secrets):
//   GMAIL_USER          — tu Gmail (ej. jhonkeifyd7@gmail.com)
//   GMAIL_APP_PASSWORD  — App Password de 16 caracteres (sin espacios)
//   FROM_EMAIL          — opcional; p. ej. Balance Home <tu@gmail.com>
//   APP_URL             — opcional; enlace al login

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import nodemailer from "npm:nodemailer@6.9.16"

const SETTINGS_ADMIN_EMAIL = "jhonkeifyd7@gmail.com"
/** Auth de Supabase exige mínimo 6 caracteres; "123" no es válido. */
const TEMP_PASSWORD = "123456"

type CreateUserBody = {
  email?: string
  full_name?: string
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")
    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      throw new Error("Faltan variables de entorno de Supabase")
    }

    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return Response.json({ error: "No autenticado" }, { status: 401, headers: corsHeaders })
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const {
      data: { user: caller },
      error: callerError,
    } = await callerClient.auth.getUser()
    if (callerError || !caller) {
      return Response.json({ error: "No autenticado" }, { status: 401, headers: corsHeaders })
    }
    if (caller.email?.toLowerCase() !== SETTINGS_ADMIN_EMAIL.toLowerCase()) {
      return Response.json({ error: "No autorizado" }, { status: 403, headers: corsHeaders })
    }

    const body = (await req.json()) as CreateUserBody
    const email = (body.email ?? "").trim().toLowerCase()
    const fullName = (body.full_name ?? "").trim()

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json(
        { error: "Correo inválido" },
        { status: 400, headers: corsHeaders }
      )
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: TEMP_PASSWORD,
      email_confirm: true,
      user_metadata: fullName ? { full_name: fullName } : undefined,
    })
    if (createError) {
      const msg = createError.message || "No se pudo crear el usuario"
      const status = /already|registered|exists/i.test(msg) ? 409 : 400
      return Response.json({ error: msg }, { status, headers: corsHeaders })
    }

    const userId = created.user?.id
    if (!userId) {
      throw new Error("Usuario creado sin id")
    }

    if (fullName) {
      const { error: profileError } = await admin.from("profiles").upsert(
        {
          id: userId,
          full_name: fullName,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      )
      if (profileError) {
        console.error("Profile upsert:", profileError)
      }
    }

    let emailSent = false
    let emailError: string | null = null
    try {
      await sendWelcomeEmail({
        toEmail: email,
        fullName: fullName || email.split("@")[0],
      })
      emailSent = true
    } catch (err) {
      console.error(err)
      emailError = err instanceof Error ? err.message : "Error al enviar correo"
    }

    return Response.json(
      {
        ok: true,
        userId,
        email,
        tempPassword: TEMP_PASSWORD,
        emailSent,
        emailError,
      },
      { headers: corsHeaders }
    )
  } catch (err) {
    console.error(err)
    const message = err instanceof Error ? err.message : "Error desconocido"
    return Response.json({ error: message }, { status: 500, headers: corsHeaders })
  }
})

const LOGO_LIGHT_CID = "bh-logo-light"
const LOGO_DARK_CID = "bh-logo-dark"

async function fetchLogoAttachment(
  url: string,
  filename: string,
  cid: string
) {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`No se pudo cargar el logo (${res.status}): ${url}`)
  }
  const content = new Uint8Array(await res.arrayBuffer())
  return {
    filename,
    content,
    cid,
    contentType: "image/png",
    contentDisposition: "inline" as const,
  }
}

async function loadLogoAttachments() {
  const appUrl = (
    Deno.env.get("APP_URL") ?? "https://balancehomerd.netlify.app"
  ).replace(/\/$/, "")
  const lightUrl =
    Deno.env.get("LOGO_URL_LIGHT")?.trim() ||
    `${appUrl}/BalanceHome_logo_lightmode.png`
  const darkUrl =
    Deno.env.get("LOGO_URL_DARK")?.trim() ||
    `${appUrl}/BalanceHome_logo_darkmode.png`

  return await Promise.all([
    fetchLogoAttachment(lightUrl, "BalanceHome_logo_lightmode.png", LOGO_LIGHT_CID),
    fetchLogoAttachment(darkUrl, "BalanceHome_logo_darkmode.png", LOGO_DARK_CID),
  ])
}

function logoHeaderHtml(font: string): string {
  return `<td style="padding:28px 32px 18px;font-family:${font};">
              <!--[if !mso]><!-->
              <img class="bh-logo-light"
                   src="cid:${LOGO_LIGHT_CID}"
                   alt="Balance Home"
                   width="220"
                   style="display:block;width:220px;max-width:85%;height:auto;border:0;outline:none;text-decoration:none;" />
              <img class="bh-logo-dark"
                   src="cid:${LOGO_DARK_CID}"
                   alt="Balance Home"
                   width="220"
                   style="display:none;width:220px;max-width:85%;height:auto;border:0;outline:none;text-decoration:none;" />
              <!--<![endif]-->
              <!--[if mso]>
              <img src="cid:${LOGO_LIGHT_CID}" alt="Balance Home" width="220" style="display:block;width:220px;height:auto;border:0;" />
              <![endif]-->
            </td>`
}

async function sendGmail(opts: {
  to: string
  subject: string
  html: string
  text?: string
}) {
  const user = Deno.env.get("GMAIL_USER")?.trim()
  const pass = Deno.env.get("GMAIL_APP_PASSWORD")?.replace(/\s+/g, "")
  if (!user || !pass) {
    throw new Error("Faltan secrets GMAIL_USER o GMAIL_APP_PASSWORD")
  }
  const from = Deno.env.get("FROM_EMAIL")?.trim() || `Balance Home <${user}>`
  const logos = await loadLogoAttachments()

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  })

  await transporter.sendMail({
    from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    attachments: logos,
  })
}

async function sendWelcomeEmail(opts: { toEmail: string; fullName: string }) {
  const appUrl = (
    Deno.env.get("APP_URL") ?? "https://balancehomerd.netlify.app"
  ).replace(/\/$/, "")
  const loginUrl = `${appUrl}/login`
  const firstName =
    opts.fullName.trim().split(/\s+/).filter(Boolean)[0] || "hola"
  const safeFirst = escapeHtml(firstName)
  const safeEmail = escapeHtml(opts.toEmail)
  const safePass = escapeHtml(TEMP_PASSWORD)
  const safeLoginUrl = escapeHtml(loginUrl)
  const font =
    "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>Bienvenido a Balance Home</title>
  <style>
    :root { color-scheme: light dark; }
    .bh-logo-dark { display: none !important; max-height: 0 !important; overflow: hidden !important; mso-hide: all; }
    @media (prefers-color-scheme: dark) {
      .bh-logo-light { display: none !important; max-height: 0 !important; overflow: hidden !important; }
      .bh-logo-dark { display: block !important; max-height: none !important; overflow: visible !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#eceff3;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#eceff3;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background-color:#ffffff;border-radius:16px;overflow:hidden;">
          <!-- Logo: light por defecto, dark con prefers-color-scheme -->
          <tr>
            ${logoHeaderHtml(font)}
          </tr>
          <tr>
            <td style="padding:0 32px;">
              <div style="height:1px;background-color:#e6ebf0;line-height:1px;font-size:1px;">&nbsp;</div>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:28px 32px 8px;font-family:${font};color:#081A33;">
              <h1 style="margin:0 0 14px;font-size:28px;font-weight:700;line-height:1.25;color:#081A33;">
                ¡Hola, ${safeFirst}!
              </h1>
              <p style="margin:0 0 28px;font-size:16px;line-height:1.6;color:#4a5d78;">
                Tu cuenta de <strong style="color:#00847D;">Balance Home</strong> está lista. Organiza las finanzas, las compras y las tareas de tu hogar en un solo lugar.
              </p>

              <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#52657E;">
                Correo de acceso
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;">
                <tr>
                  <td style="padding:14px 16px;background-color:#f3f5f8;border-radius:10px;font-family:${font};font-size:15px;color:#081A33;">
                    ${safeEmail}
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#52657E;">
                Contraseña temporal
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px;">
                <tr>
                  <td style="padding:14px 16px;background-color:#f3f5f8;border-radius:10px;font-family:${font};font-size:15px;font-weight:700;letter-spacing:0.12em;color:#081A33;">
                    ${safePass}
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;">
                <tr>
                  <td style="padding:10px 12px;background-color:#fff8e8;border-radius:8px;border:1px solid #f0e0b8;font-family:${font};font-size:13px;line-height:1.5;color:#7a5b12;">
                    <span style="font-size:14px;line-height:1;">⚠️</span>
                    &nbsp;Cambia tu contraseña después de iniciar sesión.
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;">
                <tr>
                  <td align="center" style="border-radius:10px;background-color:#00847D;">
                    <a href="${loginUrl}"
                       target="_blank"
                       style="display:block;padding:16px 24px;font-family:${font};font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">
                      Iniciar sesión
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 6px;font-size:13px;line-height:1.5;color:#52657E;text-align:center;">
                Si el botón no funciona, copia y pega el enlace en tu navegador.
              </p>
              <p style="margin:0 0 8px;font-size:13px;line-height:1.5;text-align:center;">
                <a href="${loginUrl}" style="color:#00847D;text-decoration:underline;word-break:break-all;">${safeLoginUrl}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 0;">
              <div style="height:1px;background-color:#e6ebf0;line-height:1px;font-size:1px;">&nbsp;</div>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 32px 28px;font-family:${font};text-align:center;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#52657E;">
                Si no esperabas esta invitación, puedes ignorar este correo.
              </p>
              <p style="margin:8px 0 0;font-size:12px;line-height:1.5;color:#52657E;">
                © Balance Home
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  await sendGmail({
    to: opts.toEmail,
    subject: "Bienvenido a Balance Home — tus datos de acceso",
    html,
    text: `Hola ${firstName}, tu cuenta de Balance Home está lista. Correo: ${opts.toEmail}. Contraseña temporal: ${TEMP_PASSWORD}. Entra en ${loginUrl}`,
  })
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}
