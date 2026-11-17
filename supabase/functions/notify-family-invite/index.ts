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
    let inviteeName =
      (userData.user?.user_metadata?.full_name as string | undefined) ||
      toEmail.split("@")[0]

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

    {
      const { data: inviteeProfile } = await admin
        .from("profiles")
        .select("full_name")
        .eq("id", inviteeUserId)
        .maybeSingle()
      if (inviteeProfile?.full_name) inviteeName = inviteeProfile.full_name
    }

    const appUrl = (
      Deno.env.get("APP_URL") ?? "https://balancehomerd.netlify.app"
    ).replace(/\/$/, "")
    const familyUrl = `${appUrl}/family`
    const displayHost = appUrl.replace(/^https?:\/\//, "")
    const firstName =
      inviteeName.trim().split(/\s+/).filter(Boolean)[0] || "hola"
    const safeFirst = escapeHtml(firstName)
    const safeInviter = escapeHtml(inviterName)
    const safeFamily = escapeHtml(familyName)
    const font =
      "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invitación a Balance Home</title>
</head>
<body style="margin:0;padding:0;background-color:#eceff3;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#eceff3;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background-color:#ffffff;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:28px 32px 18px;font-family:${font};">
              <img src="cid:${LOGO_CID}"
                   alt="Balance Home"
                   width="180"
                   style="display:block;width:180px;max-width:70%;height:auto;border:0;outline:none;text-decoration:none;" />
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px;">
              <div style="height:1px;background-color:#e6ebf0;line-height:1px;font-size:1px;">&nbsp;</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 8px;font-family:${font};color:#081A33;">
              <h1 style="margin:0 0 14px;font-size:28px;font-weight:700;line-height:1.25;color:#081A33;">
                ¡Hola, ${safeFirst}!
              </h1>
              <p style="margin:0 0 28px;font-size:16px;line-height:1.6;color:#4a5d78;">
                <strong style="color:#081A33;">${safeInviter}</strong>
                te invita a unirte a
                <strong style="color:#081A33;">${safeFamily}</strong>
                en Balance Home. Organiza las finanzas, las compras y las tareas de tu hogar en un solo lugar.
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;">
                <tr>
                  <td style="padding:12px 14px;background-color:#eef8f7;border-radius:10px;border:1px solid #cfe8e5;font-family:${font};font-size:13px;line-height:1.5;color:#0f5c58;">
                    Abre la sección Familia para aceptar o rechazar la invitación.
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;">
                <tr>
                  <td align="center" style="border-radius:10px;background-color:#00847D;">
                    <a href="${familyUrl}"
                       target="_blank"
                       style="display:block;padding:16px 24px;font-family:${font};font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">
                      Abrir Familia
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 6px;font-size:13px;line-height:1.5;color:#8a9bb0;text-align:center;">
                Si el botón no funciona, copia y pega el enlace en tu navegador.
              </p>
              <p style="margin:0 0 8px;font-size:13px;line-height:1.5;text-align:center;">
                <a href="${familyUrl}" style="color:#00847D;text-decoration:underline;word-break:break-all;">${escapeHtml(displayHost)}</a>
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

const LOGO_CID = "bh-logo"

async function loadLogoAttachment() {
  const appUrl = (
    Deno.env.get("APP_URL") ?? "https://balancehomerd.netlify.app"
  ).replace(/\/$/, "")
  const logoUrl =
    Deno.env.get("LOGO_URL")?.trim() ||
    `${appUrl}/BalanceHome_logo_lightmode.png`

  const res = await fetch(logoUrl)
  if (!res.ok) {
    throw new Error(`No se pudo cargar el logo (${res.status}): ${logoUrl}`)
  }
  const content = new Uint8Array(await res.arrayBuffer())
  return {
    filename: "BalanceHome_logo_lightmode.png",
    content,
    cid: LOGO_CID,
    contentType: "image/png",
    contentDisposition: "inline" as const,
  }
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
  const logo = await loadLogoAttachment()

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
    attachments: [logo],
  })
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}
