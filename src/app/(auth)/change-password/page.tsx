import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/server/auth/session";
import { ChangePasswordForm } from "./change-password-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.changePassword");
  return { title: t("title") };
}

export default async function ChangePasswordPage() {
  const { user } = await requireUser();
  return (
    <ChangePasswordForm forced={Boolean(user.mustChangePassword)} displayName={user.displayName} />
  );
}
