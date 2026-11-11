"use client";

import { LogIn } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/password-input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { authClient } from "@/lib/auth-client";

type LoginError =
  | "invalid"
  | "disabled"
  | "rateLimited"
  | "locked"
  | "invalidCode"
  | "codeExpired"
  | "twoFactorRequired"
  | "googleNotRegistered"
  | "generic";

function errorFromQuery(code: string | null): LoginError | null {
  if (!code) return null;
  if (code === "disabled") return "disabled";
  if (code === "two_factor_required") return "twoFactorRequired";
  if (code === "signup_disabled" || code === "email_not_found" || code === "account_not_linked") {
    return "googleNotRegistered";
  }
  return "generic";
}

export function LoginForm({
  googleEnabled,
  initialError,
  signedOutForIdle,
  nextPath,
}: {
  googleEnabled: boolean;
  initialError: string | null;
  /** The person was signed out because the screen was left untouched for too long. */
  signedOutForIdle: boolean;
  nextPath: string;
}) {
  const t = useTranslations("auth.login");
  const router = useRouter();
  const [error, setError] = useState<LoginError | null>(errorFromQuery(initialError));
  // False until the page's code has loaded (slow over a remote link). Until then the button waits,
  // so the browser never sends the form by itself with the password in the address.
  const ready = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [pending, startTransition] = useTransition();
  // After the password, a person with two-step verification types the code from the phone.
  const [askCode, setAskCode] = useState(false);
  const [useBackup, setUseBackup] = useState(false);

  function onCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") ?? "")
      .replace(/\s/g, "")
      .trim();
    if (!code) return;
    setError(null);
    startTransition(async () => {
      const result = useBackup
        ? await authClient.twoFactor.verifyBackupCode({ code })
        : await authClient.twoFactor.verifyTotp({ code });
      if (result.error) {
        const reason = result.error.code ?? "";
        if (reason === "INVALID_TWO_FACTOR_COOKIE") {
          setAskCode(false);
          setError("codeExpired");
        } else if (result.error.status === 429) setError("rateLimited");
        else if (reason.startsWith("INVALID") || reason === "TOO_MANY_ATTEMPTS") {
          setError("invalidCode");
        } else setError("generic");
        return;
      }
      router.push(nextPath);
      router.refresh();
    });
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    setError(null);

    startTransition(async () => {
      const result = await authClient.signIn.email({ email, password });
      if (result.error) {
        const code = result.error.code ?? "";
        if (code === "ACCOUNT_LOCKED") setError("locked");
        else if (result.error.status === 429) setError("rateLimited");
        else if (code === "USER_DISABLED") setError("disabled");
        else if (
          code === "INVALID_EMAIL_OR_PASSWORD" ||
          code === "INVALID_PASSWORD" ||
          code === "USER_NOT_FOUND"
        ) {
          setError("invalid");
        } else setError("generic");
        return;
      }
      if (result.data && "twoFactorRedirect" in result.data && result.data.twoFactorRedirect) {
        setAskCode(true);
        return;
      }
      router.push(nextPath);
      router.refresh();
    });
  }

  function onGoogle() {
    startTransition(async () => {
      await authClient.signIn.social({
        provider: "google",
        callbackURL: nextPath,
        errorCallbackURL: "/login",
      });
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-3xl">{t("title")}</CardTitle>
        <CardDescription>{t("subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {signedOutForIdle && !error ? (
          <Alert data-testid="idle-notice">
            <AlertDescription>{t("idleSignedOut")}</AlertDescription>
          </Alert>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{t(`errors.${error}`)}</AlertDescription>
          </Alert>
        ) : null}

        {askCode ? (
          <form method="post" onSubmit={onCode} className="space-y-4" noValidate>
            <p className="text-sm text-muted-foreground">
              {useBackup ? t("code.backupHint") : t("code.hint")}
            </p>
            <div className="space-y-2">
              <Label htmlFor="code">{useBackup ? t("code.backupLabel") : t("code.label")}</Label>
              <Input
                id="code"
                name="code"
                key={useBackup ? "backup" : "app"}
                autoComplete="one-time-code"
                inputMode={useBackup ? "text" : "numeric"}
                dir="ltr"
                className="text-center font-mono text-lg tracking-widest"
                autoFocus
                required
              />
            </div>
            <Button type="submit" className="w-full" size="lg" disabled={pending}>
              <LogIn data-icon="inline-start" />
              {t("code.submit")}
            </Button>
            <div className="flex items-center justify-between gap-3 text-sm">
              <button
                type="button"
                className="text-primary underline-offset-4 hover:underline"
                onClick={() => {
                  setUseBackup(!useBackup);
                  setError(null);
                }}
              >
                {useBackup ? t("code.useApp") : t("code.useBackup")}
              </button>
              <button
                type="button"
                className="text-muted-foreground underline-offset-4 hover:underline"
                onClick={() => {
                  setAskCode(false);
                  setUseBackup(false);
                  setError(null);
                }}
              >
                {t("code.back")}
              </button>
            </div>
          </form>
        ) : null}

        <form
          method="post"
          onSubmit={onSubmit}
          className={askCode ? "hidden" : "space-y-4"}
          noValidate
        >
          <div className="space-y-2">
            <Label htmlFor="email">{t("email")}</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              inputMode="email"
              dir="ltr"
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t("password")}</Label>
            <PasswordInput
              id="password"
              name="password"
              autoComplete="current-password"
              dir="ltr"
              required
            />
          </div>
          <Button type="submit" className="w-full" size="lg" disabled={pending || !ready}>
            <LogIn data-icon="inline-start" />
            {t("submit")}
          </Button>
        </form>

        {googleEnabled && !askCode ? (
          <>
            <div className="flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground">{t("or")}</span>
              <Separator className="flex-1" />
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              size="lg"
              onClick={onGoogle}
              disabled={pending}
            >
              <GoogleMark />
              {t("google")}
            </Button>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.27-4.74 3.27-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.11V7.05H2.18A11 11 0 0 0 1 12c0 1.77.42 3.45 1.18 4.95l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}
