"use client";

import { CheckCircle2, Inbox } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";
import { handleMessageAction } from "./actions";

export interface MessageItem {
  id: string;
  createdAt: string;
  senderDisplay: string;
  kind: "question" | "request" | "problem" | "suggestion";
  screen: string;
  subject: string;
  urgent: boolean;
  details: string;
  pagePath: string;
  deviceType: "desktop" | "phone" | null;
  status: "new" | "done";
  handledByDisplay: string | null;
  handledAt: string | null;
  reply: string | null;
}

const KIND_BADGE = {
  question: "info",
  request: "soft",
  problem: "destructive",
  suggestion: "success",
} as const;

const FILTERS = ["new", "done", "all"] as const;

/** The messages people sent, each one divided into kind, screen and subject, with the person's words. */
export function MessagesPanel({
  messages,
  filter,
  counts,
  helperOn,
}: {
  messages: MessageItem[];
  filter: (typeof FILTERS)[number];
  counts: { new: number; done: number };
  helperOn: boolean;
}) {
  const t = useTranslations("admin.messages");
  const c = useTranslations("contact.message");
  const users = useTranslations("admin.users");
  const router = useRouter();

  return (
    <div className="space-y-4">
      <Card className="rise" style={{ "--i": 1 } as React.CSSProperties}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <Inbox className="size-6 text-gold" aria-hidden />
            {t("title")}
            {counts.new > 0 ? (
              <Badge variant="destructive" data-testid="messages-new">
                {counts.new}
              </Badge>
            ) : null}
          </CardTitle>
          <CardDescription>{t("subtitle")}</CardDescription>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            {FILTERS.map((key) => (
              <Link
                key={key}
                href={key === "new" ? "/admin?tab=messages" : `/admin?tab=messages&status=${key}`}
                data-testid={`messages-filter-${key}`}
                aria-current={filter === key ? "page" : undefined}
                className={cn(
                  "rounded-full border px-4 py-1.5 text-sm transition-colors",
                  filter === key
                    ? "border-primary bg-primary/5 font-semibold"
                    : "border-border bg-card hover:border-gold/60",
                )}
              >
                {t(`filters.${key}`)}
                {key === "new" ? ` (${counts.new})` : key === "done" ? ` (${counts.done})` : ""}
              </Link>
            ))}
          </div>
          <p className="pt-1 text-xs text-muted-foreground" data-testid="helper-state">
            {helperOn ? t("helperOn") : t("helperOff")}
          </p>
        </CardHeader>
      </Card>

      {messages.length === 0 ? (
        <p
          className="rounded-xl border border-dashed border-border px-5 py-10 text-center text-muted-foreground"
          data-testid="messages-empty"
        >
          {t("empty")}
        </p>
      ) : (
        <ul className="space-y-3" aria-label={t("title")}>
          {messages.map((message, index) => (
            <li
              key={message.id}
              data-testid="message-card"
              data-status={message.status}
              data-kind={message.kind}
              className={cn(
                "rise space-y-3 rounded-2xl border bg-card p-5 shadow-card",
                message.urgent && message.status === "new"
                  ? "border-destructive/50"
                  : "border-border",
              )}
              style={{ "--i": 2 + index } as React.CSSProperties}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={KIND_BADGE[message.kind]}>{c(`kinds.${message.kind}`)}</Badge>
                {message.urgent ? <Badge variant="destructive">{t("urgent")}</Badge> : null}
                <span className="text-sm font-semibold">
                  {c(`screens.${message.screen}` as never)}
                </span>
                <span className="text-sm text-muted-foreground">
                  · {c(`subjects.${message.kind}.${message.subject}` as never)}
                </span>
                <span className="ms-auto text-xs text-muted-foreground" dir="ltr">
                  {formatDateTime(message.createdAt)}
                </span>
              </div>

              <p className="text-sm text-muted-foreground">
                {t("from")}:{" "}
                <span className="font-medium text-foreground">{message.senderDisplay}</span>
                {message.deviceType ? ` · ${users(message.deviceType)}` : ""}
                {message.pagePath ? (
                  <>
                    {" · "}
                    {t("page")}:{" "}
                    <Link href={message.pagePath} className="underline" dir="ltr">
                      {message.pagePath}
                    </Link>
                  </>
                ) : null}
              </p>

              <p className="rounded-xl bg-muted/50 p-3 text-sm leading-relaxed whitespace-pre-wrap">
                {message.details}
              </p>

              {message.status === "done" ? (
                <div className="space-y-1 text-sm">
                  <p className="flex items-center gap-1.5 text-success">
                    <CheckCircle2 className="size-4" aria-hidden />
                    {t("handled", { name: message.handledByDisplay ?? "" })}
                    {message.handledAt ? (
                      <span className="text-xs text-muted-foreground" dir="ltr">
                        {formatDateTime(message.handledAt)}
                      </span>
                    ) : null}
                  </p>
                  {message.reply ? (
                    <p className="rounded-xl bg-success-soft p-3 leading-relaxed whitespace-pre-wrap">
                      {message.reply}
                    </p>
                  ) : null}
                </div>
              ) : (
                <Answer id={message.id} onDone={() => router.refresh()} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Answer({ id, onDone }: { id: string; onDone: () => void }) {
  const t = useTranslations("admin.messages");
  const [reply, setReply] = useState("");
  const [pending, startTransition] = useTransition();

  function done() {
    startTransition(async () => {
      const result = await handleMessageAction(id, reply);
      if (!result.ok) return void toast.error(t("failed"));
      toast.success(t("saved"));
      onDone();
    });
  }

  return (
    <div className="space-y-2">
      <label htmlFor={`reply-${id}`} className="text-sm font-medium">
        {t("answer")}
      </label>
      <textarea
        id={`reply-${id}`}
        value={reply}
        rows={2}
        maxLength={1000}
        placeholder={t("answerPlaceholder")}
        disabled={pending}
        onChange={(event) => setReply(event.target.value)}
        className="w-full resize-y rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
      />
      <Button type="button" size="sm" onClick={done} disabled={pending} data-testid="message-done">
        <CheckCircle2 data-icon="inline-start" />
        {pending ? t("saving") : t("markDone")}
      </Button>
    </div>
  );
}
