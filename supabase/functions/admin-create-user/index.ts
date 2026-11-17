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
  })
}

async function sendWelcomeEmail(opts: { toEmail: string; fullName: string }) {
  const appUrl = (Deno.env.get("APP_URL") ?? "http://localhost:5173").replace(/\/$/, "")
  const loginUrl = `${appUrl}/login`
  const logoUrl = `${appUrl}/BalanceHome_logo_darkmode.png`
  const safeName = escapeHtml(opts.fullName)
  const safeEmail = escapeHtml(opts.toEmail)
  const safePass = escapeHtml(TEMP_PASSWORD)

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bienvenido a Balance Home</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f4f8;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f0f4f8;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(8,26,51,0.08);">
          <tr>
            <td align="center" style="background-color:#000000;padding:22px 32px;">
              <img src="${logoUrl}"
                   alt="Balance Home"
                   width="220"
                   style="display:block;margin:0 auto;width:220px;max-width:80%;height:auto;border:0;outline:none;text-decoration:none;" />
            </td>
          </tr>
          <tr>
            <td style="padding:36px 32px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#081A33;">
              <p style="margin:0 0 8px;font-size:13px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#00847D;">
                Bienvenida
              </p>
              <h1 style="margin:0 0 20px;font-size:22px;font-weight:700;line-height:1.3;color:#081A33;">
                ¡Hola, ${safeName}!
              </h1>
              <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#2c3e55;">
                Se creó tu cuenta en <strong style="color:#081A33;">Balance Home</strong>.
                Ya puedes iniciar sesión con estos datos:
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;background-color:#f5f8fb;border-radius:10px;">
                <tr>
                  <td style="padding:18px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                    <p style="margin:0 0 10px;font-size:13px;color:#4a5d78;">
                      <span style="display:block;font-size:11px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:#8a9bb0;margin-bottom:4px;">Correo</span>
                      <strong style="color:#081A33;font-size:15px;">${safeEmail}</strong>
                    </p>
                    <p style="margin:0;font-size:13px;color:#4a5d78;">
                      <span style="display:block;font-size:11px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:#8a9bb0;margin-bottom:4px;">Contraseña temporal</span>
                      <strong style="color:#081A33;font-size:15px;letter-spacing:0.08em;">${safePass}</strong>
                    </p>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 28px;font-size:14px;line-height:1.6;color:#4a5d78;">
                Te recomendamos cambiar la contraseña después del primer acceso.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 8px;">
                <tr>
                  <td align="center" style="border-radius:8px;background-color:#00847D;">
                    <a href="${loginUrl}"
                       target="_blank"
                       style="display:inline-block;padding:14px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
                      Iniciar sesión
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:20px 0 0;font-size:12px;line-height:1.5;color:#8a9bb0;text-align:center;">
                O copia este enlace:<br>
                <a href="${loginUrl}" style="color:#00847D;word-break:break-all;text-decoration:underline;">${escapeHtml(loginUrl)}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px;">
              <div style="height:1px;background-color:#e8eef4;line-height:1px;font-size:1px;">&nbsp;</div>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;text-align:center;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#8a9bb0;">
                Si no esperabas esta cuenta, ignora este correo.
              </p>
              <p style="margin:8px 0 0;font-size:12px;line-height:1.5;color:#a8b5c4;">
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
    text: `Hola ${opts.fullName}, tu cuenta en Balance Home está lista. Correo: ${opts.toEmail}. Contraseña temporal: ${TEMP_PASSWORD}. Entra en ${loginUrl}`,
  })
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}
