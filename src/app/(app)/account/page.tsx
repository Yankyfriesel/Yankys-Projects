import { KeyRound, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireActiveUser } from "@/server/auth/session";
import { TwoFactorCard } from "./two-factor-card";

/** A person's own account: their password and two-step verification. Open to everyone who is signed in. */
export default async function AccountPage() {
  const { user } = await requireActiveUser();
  const t = await getTranslations("account");
  const shell = await getTranslations("shell.groups");

  return (
    <>
      <PageHeader
        icon={<ShieldCheck />}
        eyebrow={shell("system")}
        title={t("title")}
        description={t("description")}
        help="account"
      />
      <Card className="rise" style={{ "--i": 1 } as React.CSSProperties}>
        <CardHeader>
          <CardTitle className="text-2xl">{t("password.title")}</CardTitle>
          <CardDescription>{t("password.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/change-password" data-testid="change-password" />}
          >
            <KeyRound data-icon="inline-start" />
            {t("password.change")}
          </Button>
        </CardContent>
      </Card>
      <TwoFactorCard enabled={Boolean(user.twoFactorEnabled)} />
    </>
  );
}
