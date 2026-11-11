"use client";

import { CircleCheck, CircleX, PlugZap, Settings2, Unplug } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { DialogTitleBlock } from "@/components/dialog-parts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  savePriorityConnectionAction,
  testPriorityConnectionAction,
  type ConnectionTest,
  type SettingsErrorCode,
} from "./actions";

export interface PriorityCardProps {
  /** Whether this system reads the real Priority (PRIORITY_MODE=live) or the stand-in with sample data. */
  live: boolean;
  baseUrl: string;
  /** Whether an access key is saved; the key itself never reaches the browser. */
  hasKey: boolean;
  hasPassword: boolean;
  canEdit: boolean;
}

/** How to reach Priority. Until phase 6 the stand-in answers; the details are stored for then. */
export function PriorityCard(props: PriorityCardProps) {
  const t = useTranslations("settings.priority");
  const [open, setOpen] = useState(false);
  const [testing, startTest] = useTransition();
  const [result, setResult] = useState<ConnectionTest | null>(null);

  const notSet = t("notSet");

  return (
    <Card className="rise" style={{ "--i": 2 } as React.CSSProperties}>
      <CardHeader>
        <CardTitle className="text-2xl">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <Row label={t("mode")}>
            <Badge variant={props.live ? "success" : "info"} data-testid="priority-mode">
              <PlugZap />
              {props.live ? t("modeLive") : t("modeFake")}
            </Badge>
          </Row>
          <Row label={t("address")}>
            {props.baseUrl ? (
              <span dir="ltr" className="break-all">
                {props.baseUrl}
              </span>
            ) : (
              <span className="text-muted-foreground">{notSet}</span>
            )}
          </Row>
          <Row label={t("key")}>
            {props.hasKey ? (
              <Badge variant="success">
                <CircleCheck />
                {t("keySaved")}
              </Badge>
            ) : (
              <span className="text-muted-foreground">{notSet}</span>
            )}
          </Row>
          <Row label={t("password")}>
            {props.hasPassword ? (
              <Badge variant="success">
                <CircleCheck />
                {t("passwordSaved")}
              </Badge>
            ) : (
              <span className="text-muted-foreground">{notSet}</span>
            )}
          </Row>
        </dl>

        <p className="text-sm text-muted-foreground">
          {props.live ? t("liveNoteLive") : t("liveNote")}
        </p>

        {result ? (
          <Alert variant={result.ok ? "default" : "destructive"}>
            {result.ok ? <CircleCheck /> : <CircleX />}
            <AlertDescription>
              {result.ok
                ? t("testOk", { count: result.warehouses, ms: result.ms })
                : t(`errors.${result.error}`)}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={testing}
            onClick={() => startTest(async () => setResult(await testPriorityConnectionAction()))}
          >
            <Unplug data-icon="inline-start" />
            {testing ? t("testing") : t("test")}
          </Button>
          {props.canEdit ? (
            <Button onClick={() => setOpen(true)}>
              <Settings2 data-icon="inline-start" />
              {t("edit")}
            </Button>
          ) : null}
        </div>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        {open ? <ConnectionForm {...props} onClose={() => setOpen(false)} /> : null}
      </Dialog>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs font-semibold tracking-[0.16em] text-gold uppercase">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function ConnectionForm({
  baseUrl: initialUrl,
  hasKey,
  hasPassword,
  onClose,
}: PriorityCardProps & { onClose: () => void }) {
  const t = useTranslations("settings.priority");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<SettingsErrorCode | null>(null);
  const [baseUrl, setBaseUrl] = useState(initialUrl);
  const [apiUser, setApiUser] = useState("");
  const [removeKey, setRemoveKey] = useState(false);
  const [password, setPassword] = useState("");
  const [removePassword, setRemovePassword] = useState(false);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await savePriorityConnectionAction({
        baseUrl,
        // Untouched leaves the saved key and password; typing replaces them; the boxes remove them.
        apiUser: removeKey ? "" : apiUser || undefined,
        password: removePassword ? "" : password || undefined,
      });
      if (!result.ok) return setError(result.error);
      toast.success(t("saved"));
      router.refresh();
      onClose();
    });
  }

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogTitleBlock
        icon={<Settings2 />}
        title={t("editTitle")}
        description={t("editDescription")}
      />
      <form id="priority-form" onSubmit={submit} className="space-y-4" noValidate>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{t(`errors.${error}`)}</AlertDescription>
          </Alert>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="priority-url">{t("address")}</Label>
          <Input
            id="priority-url"
            dir="ltr"
            inputMode="url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://"
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">{t("addressHint")}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="priority-user">{t("key")}</Label>
          <Input
            id="priority-user"
            type="password"
            dir="ltr"
            value={apiUser}
            onChange={(e) => setApiUser(e.target.value)}
            disabled={removeKey}
            placeholder={hasKey ? t("keyKeep") : undefined}
            autoComplete="new-password"
          />
          <p className="text-xs text-muted-foreground">{t("keyHint")}</p>
          {hasKey ? (
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={removeKey}
                onCheckedChange={(checked) => setRemoveKey(checked === true)}
              />
              {t("keyRemove")}
            </label>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="priority-password">{t("password")}</Label>
          <Input
            id="priority-password"
            type="password"
            dir="ltr"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={removePassword}
            placeholder={hasPassword ? t("passwordKeep") : undefined}
            autoComplete="new-password"
          />
          <p className="text-xs text-muted-foreground">{t("passwordHint")}</p>
          {hasPassword ? (
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={removePassword}
                onCheckedChange={(checked) => setRemovePassword(checked === true)}
              />
              {t("passwordRemove")}
            </label>
          ) : null}
        </div>
      </form>
      <DialogFooter>
        <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={pending}>
          {t("cancel")}
        </Button>
        <Button type="submit" form="priority-form" size="lg" disabled={pending}>
          {pending ? t("saving") : t("save")}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
