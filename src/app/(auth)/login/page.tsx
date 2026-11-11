import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { googleSignInEnabled } from "@/server/auth";
import { getSession } from "@/server/auth/session";
import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.login");
  return { title: t("title") };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; reason?: string }>;
}) {
  const session = await getSession();
  if (session && !session.user.isDisabled) redirect("/");

  const { error, next, reason } = await searchParams;
  return (
    <LoginForm
      googleEnabled={googleSignInEnabled}
      initialError={error ?? null}
      signedOutForIdle={reason === "idle"}
      nextPath={next && next.startsWith("/") ? next : "/"}
    />
  );
}
