"use client";

import { CircleQuestionMark, Lightbulb } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { DialogTitleBlock } from "@/components/dialog-parts";
import { HelpAsk } from "@/components/help-ask";
import { HelpMessage } from "@/components/help-message";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import type { HelpTopic } from "@/lib/help-topics";
import { cn } from "@/lib/utils";

export type { HelpTopic } from "@/lib/help-topics";

type Tab = "how" | "ask" | "message";
const TABS: Tab[] = ["how", "ask", "message"];

/** A message of several lines, one line to a list item. */
const lines = (text: string) => text.split("\n").filter((line) => line.trim() !== "");

/**
 * The round question mark in the corner of a page. Pressing it opens a window with three parts:
 * what the page is for and how it works; a place to ask a question and get an answer from the
 * manual; and a form to send a question, request, problem or suggestion to the administrators.
 */
export function PageHelp({ topic }: { topic: HelpTopic }) {
  const t = useTranslations("help");
  const c = useTranslations("contact");
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("how");
  /** A question carried from the "Ask" part into the form for the admin. */
  const [draft, setDraft] = useState<string | null>(null);

  function show(next: boolean) {
    setOpen(next);
    if (next) setTab("how");
  }

  return (
    <>
      <button
        type="button"
        data-testid="page-help"
        aria-label={t("open")}
        title={t("open")}
        onClick={() => show(true)}
        className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-full border border-gold/50 bg-gold-soft text-gold transition-colors outline-none hover:bg-gold hover:text-white focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-6"
      >
        <CircleQuestionMark aria-hidden />
      </button>
      <Dialog open={open} onOpenChange={show}>
        <DialogContent
          className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl"
          data-testid="page-help-window"
        >
          <DialogTitleBlock
            icon={<CircleQuestionMark />}
            title={t(`pages.${topic}.title`)}
            description={t("about")}
          />
          <div role="tablist" className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
            {TABS.map((key) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                data-testid={`help-tab-${key}`}
                onClick={() => setTab(key)}
                className={cn(
                  "rounded-lg px-2 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  tab === key
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {c(`tabs.${key}`)}
              </button>
            ))}
          </div>

          {tab === "how" ? <How topic={topic} /> : null}
          {tab === "ask" ? (
            <HelpAsk
              topic={topic}
              onSendToAdmin={(question) => {
                setDraft(question);
                setTab("message");
              }}
            />
          ) : null}
          {tab === "message" ? (
            <HelpMessage topic={topic} draft={draft} onDraftUsed={() => setDraft(null)} />
          ) : null}

          <DialogFooter>
            <Button type="button" size="lg" onClick={() => show(false)}>
              {t("close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function How({ topic }: { topic: HelpTopic }) {
  const t = useTranslations("help");
  const steps = lines(t(`pages.${topic}.steps`));
  const tips = lines(t(`pages.${topic}.tips`));
  return (
    <>
      <section className="space-y-1.5">
        <h3 className="text-xs font-semibold tracking-wide text-gold uppercase">
          {t("purposeTitle")}
        </h3>
        <p className="text-[0.95rem] leading-relaxed">{t(`pages.${topic}.purpose`)}</p>
      </section>
      <section className="space-y-2">
        <h3 className="text-xs font-semibold tracking-wide text-gold uppercase">
          {t("stepsTitle")}
        </h3>
        <ol className="space-y-2.5">
          {steps.map((step, index) => (
            <li key={index} className="flex items-start gap-3 text-[0.95rem] leading-relaxed">
              <span
                aria-hidden
                className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-sidebar text-xs font-bold text-sidebar-primary"
              >
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </section>
      {tips.length > 0 ? (
        <section className="space-y-2 rounded-xl border border-gold/30 bg-gold-soft/50 p-4">
          <h3 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-gold uppercase">
            <Lightbulb className="size-4" aria-hidden />
            {t("tipsTitle")}
          </h3>
          <ul className="list-disc space-y-1.5 ps-5 text-sm leading-relaxed marker:text-gold">
            {tips.map((tip, index) => (
              <li key={index}>{tip}</li>
            ))}
          </ul>
        </section>
      ) : null}
      <p className="text-sm text-muted-foreground">{t("more")}</p>
    </>
  );
}
