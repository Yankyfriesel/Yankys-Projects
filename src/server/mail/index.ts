import nodemailer from "nodemailer";

/**
 * Sending email through the company's mail account (SMTP). Everything comes from the environment,
 * so nothing secret is stored in the code or the database:
 * SMTP_HOST, SMTP_PORT (465 = secure from the start), SMTP_USER, SMTP_PASSWORD, SMTP_FROM.
 * Without them the system works as before and people are told the email was not sent.
 */

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** The name people see as the sender; the address comes from SMTP_FROM or SMTP_USER. */
export const SENDER_NAME = "Northfield Foods System";

/** "Northfield Foods System <address>", with the address taken from SMTP_FROM ("Name <address>" or just the address). */
export function senderOf(env: Record<string, string | undefined>): {
  name: string;
  address: string;
} {
  const configured = env.SMTP_FROM?.trim();
  const address = configured?.match(/<([^<>]+)>/)?.[1] ?? configured ?? env.SMTP_USER ?? "";
  return { name: SENDER_NAME, address };
}

export function mailConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD);
}

/** True when the message was handed to the mail server; false when mail is not set up or failed. */
export async function sendMail(
  message: MailMessage,
  env: Record<string, string | undefined> = process.env,
): Promise<boolean> {
  if (!mailConfigured(env)) return false;
  const port = Number(env.SMTP_PORT) || 465;
  try {
    const transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
    await transport.sendMail({ from: senderOf(env), ...message });
    return true;
  } catch (error) {
    console.error("[mail] sending failed", error instanceof Error ? error.message : error);
    return false;
  }
}
