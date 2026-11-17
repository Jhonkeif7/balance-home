// Edge Function: notify-family-invite
// Envía un correo de invitación familiar vía SMTP de Gmail (sustituye Resend).
//
// Secrets:
//   GMAIL_USER, GMAIL_APP_PASSWORD  (obligatorios)
//   FROM_EMAIL, APP_URL, WEBHOOK_SECRET  (opcionales)

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import nodemailer from "npm:nodemailer@6.9.16"

type WebhookPayload = {
  type?: string
  table?: string
  schema?: string
  record?: {
    id?: string
    family_id?: string
    invited_by?: string
    invitee_user_id?: string
    status?: string
  }
  invitee_user_id?: string
  family_id?: string
  invited_by?: string
  status?: string
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const expectedSecret = Deno.env.get("WEBHOOK_SECRET")
    if (expectedSecret) {
      const got = req.headers.get("x-webhook-secret")
      if (got !== expectedSecret) {
        return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders })
      }
    }

    const payload = (await req.json()) as WebhookPayload
    const record = payload.record ?? payload
    const inviteeUserId = record.invitee_user_id
    const familyId = record.family_id
    const invitedBy = record.invited_by
    const status = "status" in record ? record.status : "pending"

    if (!inviteeUserId) {
      return Response.json(
        { error: "Falta invitee_user_id" },
        { status: 400, headers: corsHeaders }
      )
    }

    if (status && status !== "pending") {
      return Response.json({ ok: true, skipped: true, reason: "status_not_pending" }, {
        headers: corsHeaders,
      })
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY")
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: userData, error: userError } =
      await admin.auth.admin.getUserById(inviteeUserId)
    if (userError) throw userError

    const toEmail = userData.user?.email
    if (!toEmail) {
      return Response.json(
        { error: "El invitado no tiene email" },
        { status: 404, headers: corsHeaders }
      )
    }

    let familyName = "una familia"
    let inviterName = "Alguien"

    if (familyId) {
      const { data: fam } = await admin
        .from("families")
        .select("name")
        .eq("id", familyId)
        .maybeSingle()
      if (fam?.name) familyName = fam.name
    }

    if (invitedBy) {
      const { data: profile } = await admin
        .from("profiles")
        .select("full_name")
        .eq("id", invitedBy)
        .maybeSingle()
      if (profile?.full_name) inviterName = profile.full_name
    }

    const appUrl = (Deno.env.get("APP_URL") ?? "http://localhost:5173").replace(/\/$/, "")
    const familyUrl = `${appUrl}/family`
    const safeInviter = escapeHtml(inviterName)
    const safeFamily = escapeHtml(familyName)

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invitación a Balance Home</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f4f8;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f0f4f8;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(8,26,51,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#00847D 0%,#006b66 100%);padding:28px 32px;text-align:center;">
              <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;letter-spacing:0.02em;color:#ffffff;">
                Balance Home
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 32px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#081A33;">
              <p style="margin:0 0 8px;font-size:13px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#00847D;">
                Nueva invitación
              </p>
              <h1 style="margin:0 0 20px;font-size:22px;font-weight:700;line-height:1.3;color:#081A33;">
                Te invitaron a una familia
              </h1>
              <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#2c3e55;">
                <strong style="color:#081A33;">${safeInviter}</strong>
                te invita a unirte a
                <strong style="color:#081A33;">${safeFamily}</strong>
                en Balance Home.
              </p>
              <p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:#4a5d78;">
                Abre la sección Familia para aceptar o rechazar la invitación.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 8px;">
                <tr>
                  <td align="center" style="border-radius:8px;background-color:#00847D;">
                    <a href="${familyUrl}"
                       target="_blank"
                       style="display:inline-block;padding:14px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
                      Abrir Familia
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:20px 0 0;font-size:12px;line-height:1.5;color:#8a9bb0;text-align:center;">
                O copia este enlace:<br>
                <a href="${familyUrl}" style="color:#00847D;word-break:break-all;text-decoration:underline;">${escapeHtml(familyUrl)}</a>
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
                Si no esperabas esta invitación, puedes ignorar este correo.
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
      to: toEmail,
      subject: `${inviterName} te invitó a ${familyName} en Balance Home`,
      html,
      text: `${inviterName} te invitó a ${familyName} en Balance Home. Abre ${familyUrl}`,
    })

    return Response.json({ ok: true, to: toEmail }, { headers: corsHeaders })
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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}
