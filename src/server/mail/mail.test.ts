import { describe, expect, it } from "vitest";
import { mailConfigured, senderOf, sendMail } from "./index";
import { welcomeEmail } from "./welcome";

describe("mail", () => {
  it("is not configured without the mail account, and then sends nothing", async () => {
    expect(mailConfigured({})).toBe(false);
    expect(mailConfigured({ SMTP_HOST: "smtp.example.com", SMTP_USER: "a@b.c" })).toBe(false);
    expect(mailConfigured({ SMTP_HOST: "h", SMTP_USER: "u", SMTP_PASSWORD: "p" })).toBe(true);
    expect(await sendMail({ to: "x@y.z", subject: "s", text: "t", html: "<p>t</p>" }, {})).toBe(
      false,
    );
  });

  it("writes the welcome email with the link, the email and the temporary password", () => {
    const mail = welcomeEmail({
      to: "dana@example.com",
      name: "Dana <b>",
      temporaryPassword: "Ab12Cd34Ef",
      appUrl: "https://app.example.com/",
      locale: "en",
    });
    expect(mail.to).toBe("dana@example.com");
    expect(mail.text).toContain("https://app.example.com/login");
    expect(mail.text).toContain("Ab12Cd34Ef");
    expect(mail.html).toContain("Dana &lt;b&gt;");
    expect(mail.html).not.toContain("Dana <b>");
  });

  it("writes it in Hebrew for a Hebrew user", () => {
    const mail = welcomeEmail({
      to: "a@b.co",
      name: "דנה",
      temporaryPassword: "Ab12Cd34Ef",
      appUrl: "https://x.example",
      locale: "he",
    });
    expect(mail.subject).toContain("נורת׳פילד פודס");
    expect(mail.html).toContain('dir="rtl"');
  });

  it("always shows the system name as the sender, whatever name SMTP_FROM has", () => {
    expect(senderOf({ SMTP_FROM: "Northfield Foods <a@gmail.com>", SMTP_USER: "u@x.y" })).toEqual({
      name: "Northfield Foods System",
      address: "a@gmail.com",
    });
    expect(senderOf({ SMTP_FROM: "a@gmail.com" }).address).toBe("a@gmail.com");
    expect(senderOf({ SMTP_USER: "u@x.y" }).address).toBe("u@x.y");
  });
});
