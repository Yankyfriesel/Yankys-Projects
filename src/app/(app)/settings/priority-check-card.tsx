"use client";

import { CircleCheck, CircleX, ClipboardCopy, SearchCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FormProbe } from "@/server/priority/odata";
import {
  checkPriorityFormsAction,
  checkPriorityWriteAction,
  sendTestBoxAction,
  findItemTextsAction,
  listPriorityFormsAction,
  type FormsCheck,
  type FormsList,
  type TestBox,
  type WriteCheck,
} from "./actions";

/** The forms the plan names; each is asked once. */
const FORMS = [
  "LOGPART",
  "WAREHOUSES",
  "PARTBAL",
  "DOCUMENTS_H/TRANSORDER_H_SUBFORM",
  "WAREHOUSESZOOM",
  "WARHSTYPE",
  "USERWARHS",
  "FLOORWARHS",
  "LOCATIONSINWARHS",
  "STORAGEZONES",
] as const;

/** The answers as plain text, to paste into a message. Never contains the access key. */
function asText(probes: FormProbe[]): string {
  return probes
    .map((probe) => {
      if (probe.skipped) return `${probe.form}: NOT ASKED (to protect the account)`;
      const head = `${probe.form}: ${probe.ok ? "OK" : `FAILED ${probe.status ?? ""} ${probe.code ?? ""}`.trim()}`;
      if (!probe.ok) return `${head}\n  ${probe.error ?? ""}`;
      const lines = probe.fields.map((field) => `  ${field} = ${probe.sample[field] ?? ""}`);
      const varying = Object.entries(probe.varying ?? {}).map(
        ([field, values]) => `  DIFFERS ${field}: ${values.join(" | ")}`,
      );
      return [head, probe.error ? `  (${probe.error})` : "", ...lines, ...varying]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

/**
 * Asks the real Priority which forms and fields it has, so what the system reads is checked
 * against Priority and never guessed. Reads only; nothing is changed in Priority.
 */
export function PriorityCheckCard({ configured }: { configured: boolean }) {
  const t = useTranslations("settings.priorityCheck");
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState("");
  const [item, setItem] = useState("");
  const [list, setList] = useState<FormsList | null>(null);

  async function copyList(forms: string[]) {
    try {
      await navigator.clipboard.writeText(forms.join("\n"));
      toast.success(t("copied"));
    } catch {
      toast.error(t("copyFailed"));
    }
  }
  const [result, setResult] = useState<FormsCheck | null>(null);
  const [writeResult, setWriteResult] = useState<WriteCheck | null>(null);
  const [testDoc, setTestDoc] = useState("AS26000062");
  const [testItem, setTestItem] = useState("N2015D-S");
  const [testResult, setTestResult] = useState<TestBox | null>(null);

  function check(forms: string[], item?: string) {
    startTransition(async () => setResult(await checkPriorityFormsAction(forms, item)));
  }

  async function copy(probes: FormProbe[]) {
    try {
      await navigator.clipboard.writeText(asText(probes));
      toast.success(t("copied"));
    } catch {
      toast.error(t("copyFailed"));
    }
  }

  return (
    <Card className="rise" style={{ "--i": 3 } as React.CSSProperties}>
      <CardHeader>
        <CardTitle className="text-2xl">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!configured ? <p className="text-sm text-muted-foreground">{t("notConfigured")}</p> : null}

        <div className="space-y-3 rounded-xl border border-border p-4">
          <p className="text-sm text-muted-foreground">{t("listHelp")}</p>
          <Button
            disabled={pending || !configured}
            onClick={() => startTransition(async () => setList(await listPriorityFormsAction()))}
          >
            <SearchCheck data-icon="inline-start" />
            {pending ? t("checking") : t("listForms")}
          </Button>
          {list && !list.ok ? (
            <Alert variant="destructive" role="alert" data-testid="priority-list-error">
              <AlertDescription>
                {list.error === "COOLDOWN"
                  ? t("errors.COOLDOWN", { minutes: list.minutes })
                  : list.error === "REFUSED"
                    ? t("listRefused")
                    : t(`errors.${list.error}`)}
              </AlertDescription>
            </Alert>
          ) : null}
          {list?.ok ? (
            <div className="space-y-2" data-testid="priority-forms-list">
              <Button variant="outline" size="sm" onClick={() => copyList(list.forms)}>
                <ClipboardCopy data-icon="inline-start" />
                {t("copyList", { count: list.forms.length })}
              </Button>
              <p
                dir="ltr"
                className="max-h-40 overflow-auto font-mono text-xs text-muted-foreground"
              >
                {list.forms.join(", ")}
              </p>
            </div>
          ) : null}
        </div>

        <div className="space-y-3 rounded-xl border border-border p-4">
          <p className="text-sm text-muted-foreground">{t("writeHelp")}</p>
          <Button
            variant="outline"
            disabled={pending || !configured}
            onClick={() =>
              startTransition(async () => setWriteResult(await checkPriorityWriteAction()))
            }
          >
            <SearchCheck data-icon="inline-start" />
            {pending ? t("checking") : t("checkWrite")}
          </Button>
          <form
            className="flex flex-wrap items-end gap-2 border-t border-border pt-3"
            onSubmit={(event) => {
              event.preventDefault();
              startTransition(async () =>
                setTestResult(await sendTestBoxAction(testDoc, testItem)),
              );
            }}
          >
            <p className="w-full text-sm text-muted-foreground">{t("testBoxHelp")}</p>
            <div className="space-y-1.5">
              <Label htmlFor="test-doc" className="text-xs">
                {t("testDoc")}
              </Label>
              <Input
                id="test-doc"
                dir="ltr"
                value={testDoc}
                onChange={(event) => setTestDoc(event.target.value)}
                className="h-10 w-44"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="test-item" className="text-xs">
                {t("testItem")}
              </Label>
              <Input
                id="test-item"
                dir="ltr"
                value={testItem}
                onChange={(event) => setTestItem(event.target.value)}
                className="h-10 w-44"
                autoComplete="off"
              />
            </div>
            <Button type="submit" variant="outline" disabled={pending || !configured}>
              {t("sendTestBox")}
            </Button>
          </form>
          {testResult ? (
            <p
              dir="ltr"
              data-testid="priority-test-box-result"
              className="rounded-lg bg-muted px-3 py-2 font-mono text-xs break-words"
            >
              {testResult.ok
                ? `OK · ${testResult.barcode}`
                : `${testResult.error} · ${testResult.words ?? ""}`}
            </p>
          ) : null}
          {writeResult ? (
            <p
              dir="ltr"
              data-testid="priority-write-result"
              className="rounded-lg bg-muted px-3 py-2 font-mono text-xs break-words"
            >
              {writeResult.ok
                ? `${writeResult.status ?? "no answer"} · ${writeResult.detail} · ${writeResult.ms} ms`
                : writeResult.error}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <Button disabled={pending || !configured} onClick={() => check([...FORMS])}>
            <SearchCheck data-icon="inline-start" />
            {pending ? t("checking") : t("checkAll", { forms: FORMS.join(", ") })}
          </Button>
          <form
            className="flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const names = form
                .split(/[\s,;]+/)
                .map((name) => name.trim())
                .filter(Boolean);
              if (names.length > 0) check(names);
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="priority-form-name" className="text-xs">
                {t("another")}
              </Label>
              <Input
                id="priority-form-name"
                dir="ltr"
                value={form}
                onChange={(event) => setForm(event.target.value)}
                placeholder="LOGPART, PARTPARAM"
                autoComplete="off"
                className="h-10 w-72"
              />
            </div>
            <Button
              type="submit"
              variant="outline"
              disabled={pending || !configured || !form.trim()}
            >
              {t("checkOne")}
            </Button>
          </form>
        </div>

        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (item.trim()) check(["LOGPART", "PARTBAL"], item.trim());
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="priority-item-number" className="text-xs">
              {t("itemNumber")}
            </Label>
            <Input
              id="priority-item-number"
              dir="ltr"
              value={item}
              onChange={(event) => setItem(event.target.value)}
              placeholder="I2536F-S"
              autoComplete="off"
              className="h-10 w-48"
            />
          </div>
          <Button
            type="submit"
            variant="outline"
            disabled={pending || !configured || !/^[A-Za-z0-9._-]{1,40}$/.test(item.trim())}
          >
            {t("checkItem")}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending || !configured || !/^[A-Za-z0-9._-]{1,40}$/.test(item.trim())}
            onClick={() =>
              startTransition(async () => setResult(await findItemTextsAction(item.trim())))
            }
          >
            <SearchCheck data-icon="inline-start" />
            {t("findTexts")}
          </Button>
        </form>

        {result && !result.ok ? (
          <Alert variant="destructive" role="alert" data-testid="priority-check-error">
            <AlertDescription>
              {result.error === "COOLDOWN"
                ? t("errors.COOLDOWN", { minutes: result.minutes })
                : t(`errors.${result.error}`)}
            </AlertDescription>
          </Alert>
        ) : null}

        {result?.ok ? (
          <div className="space-y-3" data-testid="priority-probes">
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => copy(result.probes)}>
                <ClipboardCopy data-icon="inline-start" />
                {t("copy")}
              </Button>
            </div>
            {result.probes.map((probe) => (
              <details
                key={probe.form}
                className="rounded-xl border border-border bg-card"
                open={!probe.ok && !probe.skipped}
              >
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-4 py-3 outline-none focus-visible:bg-muted/60 [&::-webkit-details-marker]:hidden">
                  <span dir="ltr" className="font-mono text-sm font-semibold">
                    {probe.form}
                  </span>
                  <span className="flex items-center gap-2">
                    {probe.skipped ? (
                      <Badge variant="outline">{t("skipped")}</Badge>
                    ) : probe.ok ? (
                      <Badge variant="success">
                        <CircleCheck />
                        {t("fieldsFound", { count: probe.fields.length })}
                      </Badge>
                    ) : (
                      <Badge variant="destructive">
                        <CircleX />
                        {probe.status ?? t("noAnswer")}
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {t("time", { ms: probe.ms })}
                    </span>
                  </span>
                </summary>
                <div className="space-y-2 border-t border-border px-4 py-3 text-sm">
                  {probe.skipped ? (
                    <p className="text-muted-foreground">{t("skippedWhy")}</p>
                  ) : null}
                  {probe.error ? <p className="text-muted-foreground">{probe.error}</p> : null}
                  {probe.code === "AUTH_FAILED" || probe.code === "RATE_LIMITED" ? (
                    <p className="font-medium" data-testid="priority-refusal">
                      {t(`refusal.${probe.code}`)}
                    </p>
                  ) : null}
                  {probe.varying && Object.keys(probe.varying).length > 0 ? (
                    <dl dir="ltr" className="space-y-1 font-mono text-xs">
                      {Object.entries(probe.varying).map(([field, values]) => (
                        <div key={field} className="flex min-w-0 gap-2">
                          <dt className="shrink-0 font-semibold">{field}</dt>
                          <dd className="text-muted-foreground">{values.join(" | ")}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                  {probe.fields.length > 0 ? (
                    <dl dir="ltr" className="grid gap-x-6 gap-y-1 font-mono text-xs sm:grid-cols-2">
                      {probe.fields.map((field) => (
                        <div key={field} className="flex min-w-0 gap-2">
                          <dt className="shrink-0 font-semibold">{field}</dt>
                          <dd className="truncate text-muted-foreground">{probe.sample[field]}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                </div>
              </details>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
