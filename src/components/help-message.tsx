"use client";

import { CheckCircle2, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { myMessagesAction, sendMessageAction, type MyMessage } from "@/app/(app)/help-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/i18n/format";
import { screenOfTopic, type HelpTopic } from "@/lib/help-topics";
import {
  MAX_DETAILS,
  MESSAGE_KINDS,
  MESSAGE_SCREENS,
  MESSAGE_SUBJECTS,
  MIN_DETAILS,
  type MessageKind,
  type MessageScreen,
} from "@/lib/messages";
import { cn } from "@/lib/utils";

const SELECT_CLASS =
  "h-11 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60";

/**
 * The form that sends a question, request, problem or suggestion to the administrators. It is
 * divided: what it is, which screen it is about, and what about it, so the administrator reads
 * exactly what is meant. Below it the person's own earlier messages, with the answers.
 */
export function HelpMessage({
  topic,
  draft,
  onDraftUsed,
}: {
  topic: HelpTopic;
  draft: string | null;
  onDraftUsed: () => void;
}) {
  const t = useTranslations("contact.message");
  const pathname = usePathname();
  const [kind, setKind] = useState<MessageKind>("question");
  const [screen, setScreen] = useState<MessageScreen>(screenOfTopic(topic));
  const [subject, setSubject] = useState<string>(MESSAGE_SUBJECTS.question[0]);
  const [urgent, setUrgent] = useState(false);
  const [details, setDetails] = useState(draft ?? "");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();
  const [mine, setMine] = useState<MyMessage[] | null>(null);

  useEffect(() => {
    if (draft !== null) onDraftUsed();
  }, [draft, onDraftUsed]);

  useEffect(() => {
    let alive = true;
    myMessagesAction().then((rows) => alive && setMine(rows));
    return () => {
      alive = false;
    };
  }, [sent]);

  function chooseKind(next: MessageKind) {
    setKind(next);
    setSubject(MESSAGE_SUBJECTS[next][0]);
  }

  function send() {
    setError(null);
    startTransition(async () => {
      const result = await sendMessageAction({
        kind,
        screen,
        subject,
        urgent,
        details,
        pagePath: pathname,
      });
      if (!result.ok) {
        setError(
          result.error === "INVALID_INPUT"
            ? t("invalid")
            : result.error === "RATE_LIMITED"
              ? t("rate")
              : t("failed"),
        );
        return;
      }
      setSent(true);
      setDetails("");
      setUrgent(false);
    });
  }

  const ready = details.trim().length >= MIN_DETAILS;
  const kindName = (value: string) => t(`kinds.${value}` as never);
  const screenName = (value: string) => t(`screens.${value}` as never);
  const subjectName = (k: string, value: string) => t(`subjects.${k}.${value}` as never);

  return (
    <section className="space-y-5">
      {sent ? (
        <div
          className="space-y-3 rounded-xl border border-success/30 bg-success-soft p-4"
          data-testid="message-sent"
        >
          <p className="flex items-start gap-2 text-sm leading-relaxed text-success">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden />
            {t("sent")}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => setSent(false)}>
            {t("another")}
          </Button>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{t("intro")}</p>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t("kind")}</legend>
            <div role="radiogroup" aria-label={t("kind")} className="grid gap-2 sm:grid-cols-2">
              {MESSAGE_KINDS.map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={kind === value}
                  data-testid={`message-kind-${value}`}
                  onClick={() => chooseKind(value)}
                  className={cn(
                    "rounded-xl border p-3 text-start transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    kind === value
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border bg-card hover:border-gold/60",
                  )}
                >
                  <span className="block text-sm font-semibold">{kindName(value)}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t(`kindHints.${value}`)}
                  </span>
                </button>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="message-screen" className="text-sm font-medium">
                {t("screen")}
              </label>
              <select
                id="message-screen"
                className={SELECT_CLASS}
                value={screen}
                onChange={(event) => setScreen(event.target.value as MessageScreen)}
              >
                {MESSAGE_SCREENS.map((value) => (
                  <option key={value} value={value}>
                    {screenName(value)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="message-subject" className="text-sm font-medium">
                {t("subject")}
              </label>
              <select
                id="message-subject"
                className={SELECT_CLASS}
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
              >
                {MESSAGE_SUBJECTS[kind].map((value) => (
                  <option key={value} value={value}>
                    {subjectName(kind, value)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t("urgency")}</legend>
            <div role="radiogroup" aria-label={t("urgency")} className="flex flex-wrap gap-2">
              {[false, true].map((value) => (
                <button
                  key={String(value)}
                  type="button"
                  role="radio"
                  aria-checked={urgent === value}
                  data-testid={value ? "message-urgent" : "message-normal"}
                  onClick={() => setUrgent(value)}
                  className={cn(
                    "rounded-full border px-4 py-1.5 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    urgent === value
                      ? value
                        ? "border-destructive bg-destructive/10 font-semibold text-destructive"
                        : "border-primary bg-primary/5 font-semibold"
                      : "border-border bg-card hover:border-gold/60",
                  )}
                >
                  {value ? t("urgent") : t("normal")}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="space-y-1.5">
            <label htmlFor="message-details" className="text-sm font-medium">
              {t("details")}
            </label>
            <textarea
              id="message-details"
              value={details}
              maxLength={MAX_DETAILS}
              rows={4}
              disabled={pending}
              onChange={(event) => setDetails(event.target.value)}
              className="w-full resize-y rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
            />
            <p className="text-xs text-muted-foreground">{t("detailsHint")}</p>
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive" data-testid="message-error">
              {error}
            </p>
          ) : null}
          <Button type="button" onClick={send} disabled={pending || !ready}>
            <Send data-icon="inline-start" className="rtl:-scale-x-100" />
            {pending ? t("sending") : t("send")}
          </Button>
        </>
      )}

      <div className="space-y-2 border-t border-border pt-4" data-testid="my-messages">
        <h3 className="text-xs font-semibold tracking-wide text-gold uppercase">{t("mine")}</h3>
        {mine === null ? null : mine.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("none")}</p>
        ) : (
          <ul className="space-y-2">
            {mine.map((message) => (
              <li
                key={message.id}
                data-status={message.status}
                className="space-y-1.5 rounded-xl border border-border bg-card p-3 text-sm"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="info">{kindName(message.kind)}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {screenName(message.screen)} · {subjectName(message.kind, message.subject)}
                  </span>
                  <Badge
                    variant={message.status === "done" ? "success" : "warning"}
                    className="ms-auto"
                  >
                    {message.status === "done" ? t("answered") : t("waiting")}
                  </Badge>
                </div>
                <p className="leading-relaxed whitespace-pre-wrap">{message.details}</p>
                <p className="text-xs text-muted-foreground" dir="ltr">
                  {formatDateTime(message.createdAt)}
                </p>
                {message.reply ? (
                  <p className="rounded-lg bg-success-soft p-2 leading-relaxed whitespace-pre-wrap text-success">
                    <span className="block text-xs font-semibold">
                      {t("answer", { name: message.handledByDisplay ?? "" })}
                    </span>
                    {message.reply}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
