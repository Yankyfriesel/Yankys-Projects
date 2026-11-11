import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { IdleLogout } from "@/components/idle-logout";
import { LanguageSwitcher } from "@/components/language-switcher";
import { MessageWatcher } from "@/components/message-watcher";
import { AppShell } from "@/components/shell/app-shell";
import { SignOutButton } from "@/components/sign-out-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { db } from "@/server/db";
import { countNewMessages } from "@/server/messages";
import { getAccess } from "@/server/permissions";
import { SCREENS } from "@/server/permissions/registry";
import { getIdleMinutes } from "@/server/security";
import { getUnseenAlertCount } from "@/server/security/alerts";

/**
 * Everything inside the app requires a logged-in, enabled user who has already
 * replaced a temporary password, and who is allowed on this device type.
 * The shell shows only the screens that user may open.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const access = await getAccess();
  if (!access.deviceAllowed) return <DeviceNotAllowed deviceType={access.deviceType} />;

  const t = await getTranslations();
  const store = await cookies();
  const idleMinutes = await getIdleMinutes(db);
  const alertCount =
    access.isOwner || access.can("admin.security") ? await getUnseenAlertCount(db) : 0;
  const canMessages = access.isOwner || access.can("admin.messages");
  const messageCount = canMessages ? await countNewMessages(db) : 0;
  const items = access.visibleScreens().map((key) => ({
    badge: key === "admin" ? alertCount + messageCount : 0,
    key,
    href: SCREENS[key].path,
    label: t(`nav.${key}`),
    group: SCREENS[key].group,
  }));

  return (
    <AppShell
      items={items}
      user={{
        displayName: access.user.displayName,
        subtitle: access.isOwner ? t("access.owner") : access.user.jobTitle || "",
      }}
      company={t("app.company")}
      defaultCollapsed={store.get("sidebar")?.value === "collapsed"}
    >
      {children}
      <IdleLogout minutes={idleMinutes} />
      {canMessages ? <MessageWatcher initialCount={messageCount} /> : null}
    </AppShell>
  );
}

async function DeviceNotAllowed({ deviceType }: { deviceType: "desktop" | "phone" }) {
  const t = await getTranslations("access");
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4 py-8">
      <Alert variant="destructive">
        <AlertTitle>{t("deviceNotAllowed.title")}</AlertTitle>
        <AlertDescription>
          {t("deviceNotAllowed.body", { device: t(`device.${deviceType}`) })}
        </AlertDescription>
      </Alert>
      <div className="flex items-center justify-between gap-2">
        <LanguageSwitcher />
        <SignOutButton />
      </div>
    </main>
  );
}
