"use client";

import { ShieldCheck, ShieldOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { PasswordInput } from "@/components/password-input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { qrSvg } from "@/lib/labels/codes";

type Step =
  | { name: "idle" }
  | { name: "password"; goal: "enable" | "disable" | "codes" }
  | { name: "scan"; uri: string; secret: string; backupCodes: string[] }
  | { name: "codes"; backupCodes: string[] };

type Problem = "password" | "code" | "generic" | null;

/** The secret inside the otpauth link, for typing by hand when the picture cannot be scanned. */
function secretOf(uri: string): string {
  try {
    return new URL(uri).searchParams.get("secret") ?? "";
  } catch {
    return "";
  }
}

/**
 * Two-step verification for the signed-in person: turn it on (password, scan the picture,
 * type one code), turn it off (password), or get new backup codes (password).
 */
export function TwoFactorCard({ enabled }: { enabled: boolean }) {
  const t = useTranslations("account.twoFactor");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<Step>({ name: "idle" });
  const [problem, setProblem] = useState<Problem>(null);

  function begin(goal: "enable" | "disable" | "codes") {
    setProblem(null);
    setStep({ name: "password", goal });
  }

  function cancel() {
    setProblem(null);
    setStep({ name: "idle" });
  }

  function submitPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step.name !== "password") return;
    const goal = step.goal;
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    if (!password) return;
    setProblem(null);
    startTransition(async () => {
      if (goal === "enable") {
        const result = await authClient.twoFactor.enable({ password });
        if (result.error || !result.data || !("totpURI" in result.data)) {
          return void setProblem(
            result.error?.code === "INVALID_PASSWORD" ? "password" : "generic",
          );
        }
        const uri = String(result.data.totpURI);
        setStep({
          name: "scan",
          uri,
          secret: secretOf(uri),
          backupCodes: result.data.backupCodes ?? [],
        });
      } else if (goal === "disable") {
        const result = await authClient.twoFactor.disable({ password });
        if (result.error) {
          return void setProblem(result.error.code === "INVALID_PASSWORD" ? "password" : "generic");
        }
        toast.success(t("turnedOff"));
        setStep({ name: "idle" });
        router.refresh();
      } else {
        const result = await authClient.twoFactor.generateBackupCodes({ password });
        if (result.error || !result.data) {
          return void setProblem(
            result.error?.code === "INVALID_PASSWORD" ? "password" : "generic",
          );
        }
        setStep({ name: "codes", backupCodes: result.data.backupCodes });
      }
    });
  }

  function confirmCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step.name !== "scan") return;
    const backupCodes = step.backupCodes;
    const code = String(new FormData(event.currentTarget).get("code") ?? "").replace(/\s/g, "");
    if (!code) return;
    setProblem(null);
    startTransition(async () => {
      const result = await authClient.twoFactor.verifyTotp({ code });
      if (result.error) return void setProblem("code");
      toast.success(t("turnedOn"));
      // The backup codes stay on screen until the person has saved them.
      setStep({ name: "codes", backupCodes });
      router.refresh();
    });
  }

  return (
    <Card className="rise max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-2xl">
          {enabled ? (
            <ShieldCheck className="size-6 text-success" />
          ) : (
            <ShieldOff className="size-6 text-muted-foreground" />
          )}
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm font-medium" data-testid="two-factor-status">
          {enabled ? t("statusOn") : t("statusOff")}
        </p>

        {problem ? (
          <Alert variant="destructive">
            <AlertDescription>{t(`problems.${problem}`)}</AlertDescription>
          </Alert>
        ) : null}

        {step.name === "idle" ? (
          <div className="flex flex-wrap gap-2">
            {enabled ? (
              <>
                <Button type="button" variant="outline" onClick={() => begin("codes")}>
                  {t("newCodes")}
                </Button>
                <Button type="button" variant="destructive" onClick={() => begin("disable")}>
                  {t("turnOff")}
                </Button>
              </>
            ) : (
              <Button type="button" data-testid="two-factor-start" onClick={() => begin("enable")}>
                {t("turnOn")}
              </Button>
            )}
          </div>
        ) : null}

        {step.name === "password" ? (
          <form onSubmit={submitPassword} className="space-y-3" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="two-factor-password">{t("passwordLabel")}</Label>
              <PasswordInput
                id="two-factor-password"
                name="password"
                autoComplete="current-password"
                dir="ltr"
                autoFocus
                required
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={pending} data-testid="two-factor-continue">
                {t("continue")}
              </Button>
              <Button type="button" variant="outline" onClick={cancel} disabled={pending}>
                {t("cancel")}
              </Button>
            </div>
          </form>
        ) : null}

        {step.name === "scan" ? (
          <form onSubmit={confirmCode} className="space-y-4" noValidate>
            <ol className="list-decimal space-y-1 ps-5 text-sm text-muted-foreground">
              <li>{t("stepInstall")}</li>
              <li>{t("stepScan")}</li>
              <li>{t("stepType")}</li>
            </ol>
            <div className="flex flex-wrap items-start gap-5">
              <QrPicture uri={step.uri} label={t("qrLabel")} />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-xs text-muted-foreground">{t("manual")}</p>
                <p
                  dir="ltr"
                  data-testid="two-factor-secret"
                  className="rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-sm break-all select-all"
                >
                  {step.secret}
                </p>
              </div>
            </div>
            <BackupCodes codes={step.backupCodes} />
            <div className="space-y-1.5">
              <Label htmlFor="two-factor-code">{t("codeLabel")}</Label>
              <Input
                id="two-factor-code"
                name="code"
                autoComplete="one-time-code"
                inputMode="numeric"
                dir="ltr"
                className="max-w-48 text-center font-mono text-lg tracking-widest"
                required
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={pending} data-testid="two-factor-confirm">
                {t("confirm")}
              </Button>
              <Button type="button" variant="outline" onClick={cancel} disabled={pending}>
                {t("cancel")}
              </Button>
            </div>
          </form>
        ) : null}

        {step.name === "codes" ? (
          <div className="space-y-3">
            <BackupCodes codes={step.backupCodes} />
            <Button type="button" onClick={cancel} data-testid="two-factor-done">
              {t("done")}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function QrPicture({ uri, label }: { uri: string; label: string }) {
  const svg = qrSvg(uri);
  if (!svg) return null;
  return (
    // A picture from data, so no markup is injected into the page.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`}
      alt={label}
      className="size-44 shrink-0 rounded-lg border border-border bg-white p-2"
    />
  );
}

function BackupCodes({ codes }: { codes: string[] }) {
  const t = useTranslations("account.twoFactor");
  if (codes.length === 0) return null;
  return (
    <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-4">
      <p className="text-sm font-medium">{t("backupTitle")}</p>
      <p className="text-xs text-muted-foreground">{t("backupHint")}</p>
      <ul
        dir="ltr"
        data-testid="backup-codes"
        className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-sm select-all"
      >
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
    </div>
  );
}
