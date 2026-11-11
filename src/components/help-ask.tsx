"use client";

import { Bot, Send, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { askAssistantAction, helpStatusAction } from "@/app/(app)/help-actions";
import { Button } from "@/components/ui/button";
import type { HelpTopic } from "@/lib/help-topics";

interface Turn {
  role: "user" | "assistant";
  text: string;
}

/** The helper writes **bold** for button names; everything else is shown as it comes. */
function Answer({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/(\*\*[^*]+\*\*)/g)
        .map((part, index) =>
          part.startsWith("**") && part.endsWith("**") ? (
            <strong key={index}>{part.slice(2, -2)}</strong>
          ) : (
            <span key={index}>{part}</span>
          ),
        )}
    </>
  );
}

/** Ask a question about the page or about how to do something, and get an answer from the manual. */
export function HelpAsk({
  topic,
  onSendToAdmin,
}: {
  topic: HelpTopic;
  onSendToAdmin: (question: string) => void;
}) {
  const t = useTranslations("contact.ask");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    helpStatusAction().then((status) => alive && setConfigured(status.assistant));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [turns, pending]);

  function ask() {
    const text = question.trim();
    if (text.length < 2 || pending) return;
    setError(null);
    startTransition(async () => {
      const result = await askAssistantAction({ question: text, topic, history: turns });
      if (!result.ok) {
        if (result.error === "NOT_CONFIGURED") setConfigured(false);
        setError(
          result.error === "RATE_LIMITED"
            ? t("rate")
            : result.error === "NOT_CONFIGURED"
              ? t("notConfigured")
              : result.error === "INVALID_INPUT"
                ? t("invalid")
                : t("unavailable"),
        );
        return;
      }
      setTurns((all) => [
        ...all,
        { role: "user", text },
        { role: "assistant", text: result.answer },
      ]);
      setQuestion("");
    });
  }

  const lastQuestion = [...turns].reverse().find((turn) => turn.role === "user")?.text ?? question;

  if (configured === false) {
    return (
      <section className="space-y-3" data-testid="ask-unavailable">
        <p className="rounded-xl border border-border bg-muted/50 p-4 text-sm leading-relaxed">
          {t("notConfigured")}
        </p>
        <Button type="button" variant="outline" onClick={() => onSendToAdmin(question)}>
          {t("toAdmin")}
        </Button>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("intro")}</p>

      {turns.length > 0 ? (
        <div className="max-h-72 space-y-3 overflow-y-auto rounded-xl border border-border bg-muted/30 p-3">
          {turns.map((turn, index) => (
            <div key={index} className="flex items-start gap-2.5" data-testid={`ask-${turn.role}`}>
              <span
                aria-hidden
                className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-sidebar text-sidebar-primary [&_svg]:size-4"
              >
                {turn.role === "user" ? <UserRound /> : <Bot />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-muted-foreground">
                  {turn.role === "user" ? t("you") : t("helper")}
                </p>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  <Answer text={turn.text} />
                </p>
              </div>
            </div>
          ))}
          <div ref={end} />
        </div>
      ) : null}

      <div className="space-y-2">
        <label htmlFor="help-question" className="text-sm font-medium">
          {t("label")}
        </label>
        <textarea
          id="help-question"
          value={question}
          maxLength={600}
          rows={3}
          disabled={pending}
          placeholder={t("placeholder")}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              ask();
            }
          }}
          className="w-full resize-y rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
        />
        {error ? (
          <p role="alert" className="text-sm text-destructive" data-testid="ask-error">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" onClick={ask} disabled={pending || question.trim().length < 2}>
            <Send data-icon="inline-start" className="rtl:-scale-x-100" />
            {pending ? t("asking") : t("send")}
          </Button>
          {turns.length > 0 ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setTurns([])}>
              {t("clear")}
            </Button>
          ) : null}
        </div>
      </div>

      {turns.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3 text-sm">
          <span className="text-muted-foreground">{t("notSure")}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onSendToAdmin(lastQuestion)}
          >
            {t("toAdmin")}
          </Button>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">{t("note")}</p>
    </section>
  );
}
