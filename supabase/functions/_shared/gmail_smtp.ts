/**
 * Envío de correo vía SMTP de Gmail (App Password).
 *
 * Secrets:
 *   GMAIL_USER          — tu Gmail (ej. jhonkeifyd7@gmail.com)
 *   GMAIL_APP_PASSWORD  — contraseña de aplicación de 16 caracteres
 *   FROM_EMAIL          — opcional; por defecto "Balance Home <GMAIL_USER>"
 */
import nodemailer from "npm:nodemailer@6.9.16"

export type SendMailInput = {
  to: string
  subject: string
  html: string
  text?: string
}

export async function sendGmail(input: SendMailInput): Promise<void> {
  const user = Deno.env.get("GMAIL_USER")?.trim()
  const pass = Deno.env.get("GMAIL_APP_PASSWORD")?.replace(/\s+/g, "")
  if (!user || !pass) {
    throw new Error("Faltan secrets GMAIL_USER o GMAIL_APP_PASSWORD")
  }

  const from =
    Deno.env.get("FROM_EMAIL")?.trim() || `Balance Home <${user}>`

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  })

  await transporter.sendMail({
    from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  })
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}
