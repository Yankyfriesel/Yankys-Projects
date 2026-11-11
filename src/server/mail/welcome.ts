import type { MailMessage } from "./index";

export interface WelcomeInput {
  to: string;
  name: string;
  temporaryPassword: string;
  /** The address of the system, for example https://app.example.com */
  appUrl: string;
  locale: "he" | "en";
}

const escapeHtml = (text: string) =>
  text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** The email a new user gets: the link to sign in, the email to sign in with and the temporary password. */
export function welcomeEmail({
  to,
  name,
  temporaryPassword,
  appUrl,
  locale,
}: WelcomeInput): MailMessage {
  const link = `${appUrl.replace(/\/+$/, "")}/login`;
  const he = locale === "he";

  const subject = he ? "פרטי הכניסה שלך למערכת נורת׳פילד פודס" : "Your sign-in details for Northfield Foods";
  const lines = he
    ? [
        `שלום ${name},`,
        "נפתח עבורך משתמש במערכת נורת׳פילד פודס.",
        `קישור להתחברות: ${link}`,
        `אימייל: ${to}`,
        `סיסמה זמנית: ${temporaryPassword}`,
        "בכניסה הראשונה תתבקש/י לבחור סיסמה חדשה. אל תעביר/י את הסיסמה הזמנית הלאה.",
      ]
    : [
        `Hello ${name},`,
        "A user was created for you in the Northfield Foods system.",
        `Sign in here: ${link}`,
        `Email: ${to}`,
        `Temporary password: ${temporaryPassword}`,
        "You will be asked to choose a new password the first time you sign in. Do not share the temporary password.",
      ];

  const html = `<div dir="${he ? "rtl" : "ltr"}" style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#1f2a24">
<p>${escapeHtml(lines[0])}</p>
<p>${escapeHtml(lines[1])}</p>
<p><a href="${escapeHtml(link)}" style="display:inline-block;background:#1f6f78;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">${he ? "כניסה למערכת" : "Sign in"}</a></p>
<p>${he ? "אימייל" : "Email"}: <b dir="ltr">${escapeHtml(to)}</b><br>${he ? "סיסמה זמנית" : "Temporary password"}: <b dir="ltr" style="font-family:monospace;font-size:17px">${escapeHtml(temporaryPassword)}</b></p>
<p style="color:#5b6b61">${escapeHtml(lines[5])}</p>
</div>`;

  return { to, subject, text: lines.join("\n"), html };
}
