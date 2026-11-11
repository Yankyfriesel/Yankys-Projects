import { CloudUpload, History, Inbox, ShieldCheck, UsersRound } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { SectionLayout } from "@/components/section-menu";
import { SCREEN_ICONS } from "@/components/screen-icons";
import { listUsers } from "@/server/auth/admin-queries";
import { assistantConfigured } from "@/server/assistant";
import { db } from "@/server/db";
import { countNewMessages, listMessages } from "@/server/messages";
import { requireScreen } from "@/server/permissions";
import { getIdleMinutes } from "@/server/security";
import { listActiveSessions } from "@/server/security/sessions";
import { countUnseen, getAlertsSeenAt, getSecurityAlerts } from "@/server/security/alerts";
import { ActivityLog, type LogSearch } from "./activity-log";
import { AlertsCard } from "./alerts-card";
import { SecurityCard } from "./security-card";
import { SessionsCard } from "./sessions-card";
import { SendsPanel } from "./sends-panel";
import { MessagesPanel } from "./messages-panel";
import { UsersPanel } from "./users-panel";

type Search = LogSearch & { tab?: string; status?: string };
type Tab = "users" | "log" | "sends" | "security" | "messages";

const TAB_ICONS: Record<Tab, React.ComponentType> = {
  users: UsersRound,
  log: History,
  sends: CloudUpload,
  security: ShieldCheck,
  messages: Inbox,
};

/**
 * Administration: the people who use the system and what they may do, and the
 * activity log. Each part appears only for those holding its permissions.
 */
export default async function AdminPage({ searchParams }: { searchParams: Promise<Search> }) {
  const access = await requireScreen("admin");
  const t = await getTranslations("nav");
  const tabs = await getTranslations("admin.tabs");
  const screens = await getTranslations("screens");
  const shell = await getTranslations("shell.groups");
  const search = await searchParams;

  const canUsers =
    access.isOwner ||
    (
      [
        "admin.view",
        "admin.users.create",
        "admin.users.edit",
        "admin.users.disable",
        "admin.users.delete",
        "admin.permissions",
        "admin.resetPassword",
      ] as const
    ).some((permission) => access.can(permission));
  const canLog = access.isOwner || access.can("admin.activityLog");

  const canSends = access.isOwner || access.can("admin.sends");

  const canSecurity = access.isOwner || access.can("admin.security");

  const canMessages = access.isOwner || access.can("admin.messages");
  const newMessages = canMessages ? await countNewMessages(db) : 0;

  // Warnings about attempts to break in: the newest ones open this screen on the security tab.
  const alerts = canSecurity ? await getSecurityAlerts(db) : [];
  const seenAt = canSecurity ? await getAlertsSeenAt(db) : null;
  const hasNewAlerts = countUnseen(alerts, seenAt) > 0;

  const available = [
    canUsers && "users",
    canLog && "log",
    canSends && "sends",
    canSecurity && "security",
    canMessages && "messages",
  ].filter((key): key is Tab => key !== false);
  const tab: Tab =
    available.find((key) => key === search.tab) ??
    (hasNewAlerts && canSecurity
      ? "security"
      : newMessages > 0 && canMessages
        ? "messages"
        : available[0]) ??
    "users";
  const Icon = SCREEN_ICONS.admin;

  const items = [
    canUsers ? { key: "users", href: "/admin?tab=users" } : null,
    canLog ? { key: "log", href: "/admin?tab=log" } : null,
    canSends ? { key: "sends", href: "/admin?tab=sends" } : null,
    canSecurity ? { key: "security", href: "/admin?tab=security" } : null,
    canMessages ? { key: "messages", href: "/admin?tab=messages" } : null,
  ].filter((item): item is { key: Tab; href: string } => item !== null);

  async function messagesBody() {
    const filter = (["new", "done", "all"] as const).find((f) => f === search.status) ?? "new";
    const rows = await listMessages(db, filter);
    const all = await listMessages(db, "done", 1000);
    return (
      <MessagesPanel
        filter={filter}
        counts={{ new: newMessages, done: all.length }}
        helperOn={assistantConfigured()}
        messages={rows.map((row) => ({
          id: row.id,
          createdAt: row.createdAt.toISOString(),
          senderDisplay: row.senderDisplay,
          kind: row.kind,
          screen: row.screen,
          subject: row.subject,
          urgent: row.urgent,
          details: row.details,
          pagePath: row.pagePath,
          deviceType: row.deviceType,
          status: row.status,
          handledByDisplay: row.handledByDisplay,
          handledAt: row.handledAt ? row.handledAt.toISOString() : null,
          reply: row.reply,
        }))}
      />
    );
  }

  const body =
    tab === "messages" ? (
      await messagesBody()
    ) : tab === "log" ? (
      <ActivityLog search={search} />
    ) : tab === "sends" ? (
      <SendsPanel canRetry={access.isOwner || access.can("admin.sends")} />
    ) : tab === "security" ? (
      <div className="space-y-6">
        <AlertsCard
          alerts={alerts.map((alert) => ({
            ...alert,
            lastAt: alert.lastAt.toISOString(),
            unseen: !seenAt || alert.lastAt > seenAt,
          }))}
        />
        <SessionsCard
          sessions={(await listActiveSessions(db)).map((row) => ({
            ...row,
            signedInAt: row.signedInAt.toISOString(),
            lastSeenAt: row.lastSeenAt.toISOString(),
            current: row.id === access.session.id,
          }))}
        />
        <SecurityCard minutes={await getIdleMinutes(db)} />
      </div>
    ) : (
      <UsersPanel
        users={await listUsers(db)}
        can={{
          create: access.can("admin.users.create"),
          edit: access.can("admin.users.edit"),
          permissions: access.can("admin.permissions"),
          disable: access.can("admin.users.disable"),
          delete: access.can("admin.users.delete"),
          reset: access.can("admin.resetPassword"),
        }}
        currentUserId={access.user.id}
        actorIsOwner={access.isOwner}
        grantable={access.isOwner ? null : Array.from(access.permissions)}
      />
    );

  return (
    <>
      <PageHeader
        icon={<Icon />}
        eyebrow={shell("system")}
        title={t("admin")}
        description={screens("admin")}
        help={
          tab === "log"
            ? "adminLog"
            : tab === "sends"
              ? "adminSends"
              : tab === "security"
                ? "adminSecurity"
                : tab === "messages"
                  ? "adminMessages"
                  : "adminUsers"
        }
      />

      {items.length > 1 ? (
        <SectionLayout
          label={tabs("menu")}
          current={tab}
          items={items.map((item) => {
            const TabIcon = TAB_ICONS[item.key];
            return {
              key: item.key,
              href: item.href,
              title: tabs(item.key),
              hint: tabs(`hints.${item.key}`),
              icon: <TabIcon />,
            };
          })}
        >
          {body}
        </SectionLayout>
      ) : (
        body
      )}
    </>
  );
}
