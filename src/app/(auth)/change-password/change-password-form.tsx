"use client";

import { KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PasswordInput } from "@/components/password-input";
import { Label } from "@/components/ui/label";
import { changePasswordAction, type ChangePasswordState } from "@/server/auth/actions";
import { SignOutButton } from "@/components/sign-out-button";

const initialState: ChangePasswordState = { error: null };

export function ChangePasswordForm({
  forced,
  displayName,
}: {
  forced: boolean;
  displayName: string;
}) {
  const t = useTranslations("auth.changePassword");
  const [state, formAction, pending] = useActionState(changePasswordAction, initialState);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-3xl">{t("title")}</CardTitle>
        <CardDescription>
          {forced ? t("introForced", { name: displayName }) : t("intro")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {state.error ? (
          <Alert variant="destructive">
            <AlertDescription>{t(`errors.${state.error}`)}</AlertDescription>
          </Alert>
        ) : null}

        <form action={formAction} className="space-y-4" noValidate>
          {forced ? null : (
            <div className="space-y-2">
              <Label htmlFor="currentPassword">{t("current")}</Label>
              <PasswordInput
                id="currentPassword"
                name="currentPassword"
                autoComplete="current-password"
                dir="ltr"
                required
                autoFocus
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="newPassword">{t("new")}</Label>
            <PasswordInput
              id="newPassword"
              name="newPassword"
              autoComplete="new-password"
              dir="ltr"
              required
              autoFocus={forced}
            />
            <p className="text-xs text-muted-foreground">{t("rules")}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">{t("confirm")}</Label>
            <PasswordInput
              id="confirmPassword"
              name="confirmPassword"
              autoComplete="new-password"
              dir="ltr"
              required
            />
          </div>
          <Button type="submit" className="w-full" size="lg" disabled={pending}>
            <KeyRound data-icon="inline-start" />
            {t("submit")}
          </Button>
        </form>

        <div className="flex justify-center">
          <SignOutButton variant="ghost" size="sm" />
        </div>
      </CardContent>
    </Card>
  );
}
