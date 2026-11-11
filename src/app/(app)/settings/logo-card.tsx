"use client";

import { ImageUp, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { BRAND_VARIANTS, MAX_LOGO_BYTES, type BrandVariant } from "@/server/brand/shared";

/** The shape each preview is shown in, matching where the logo appears in the interface. */
const PREVIEW: Record<BrandVariant, { box: string; image: string; width: number; height: number }> =
  {
    light: { box: "bg-sidebar", image: "w-44", width: 1000, height: 500 },
    full: { box: "bg-card", image: "w-44 mix-blend-multiply", width: 1000, height: 500 },
    mark: { box: "bg-background", image: "size-20", width: 320, height: 320 },
  };

type UploadError = "INVALID_TYPE" | "TOO_LARGE" | "EMPTY" | "NOT_ALLOWED" | "GENERIC";

/** Replace or restore each of the three logo files. Reloads the page afterwards so the menu and login show the change. */
export function LogoCard({
  custom,
  canEdit,
}: {
  custom: Record<BrandVariant, boolean>;
  canEdit: boolean;
}) {
  const t = useTranslations("settings.logo");
  const [busy, setBusy] = useState<BrandVariant | null>(null);
  const inputs = useRef<Partial<Record<BrandVariant, HTMLInputElement | null>>>({});

  function fail(code: string) {
    const known: UploadError[] = ["INVALID_TYPE", "TOO_LARGE", "EMPTY", "NOT_ALLOWED"];
    toast.error(
      t(`errors.${known.includes(code as UploadError) ? (code as UploadError) : "GENERIC"}`),
    );
  }

  async function send(variant: BrandVariant, init: RequestInit) {
    setBusy(variant);
    try {
      const response = await fetch(`/api/brand/${variant}`, init);
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        fail(body.error ?? "GENERIC");
        return;
      }
      window.location.reload();
    } catch {
      fail("GENERIC");
    } finally {
      setBusy(null);
    }
  }

  function upload(variant: BrandVariant, file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_LOGO_BYTES) return fail("TOO_LARGE");
    const form = new FormData();
    form.set("file", file);
    void send(variant, { method: "POST", body: form });
  }

  return (
    <Card className="rise" style={{ "--i": 1 } as React.CSSProperties}>
      <CardHeader>
        <CardTitle className="text-2xl">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          {BRAND_VARIANTS.map((variant) => {
            const preview = PREVIEW[variant];
            return (
              <div
                key={variant}
                className="flex flex-col gap-3 rounded-2xl border border-border p-3"
              >
                <div className={cn("grid h-32 place-items-center rounded-xl", preview.box)}>
                  <Image
                    src={`/api/brand/${variant}`}
                    alt=""
                    width={preview.width}
                    height={preview.height}
                    unoptimized
                    className={cn("h-auto object-contain", preview.image)}
                  />
                </div>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{t(`variants.${variant}.name`)}</p>
                    <p className="text-xs text-muted-foreground">{t(`variants.${variant}.hint`)}</p>
                  </div>
                  <Badge variant={custom[variant] ? "info" : "soft"}>
                    {custom[variant] ? t("custom") : t("original")}
                  </Badge>
                </div>
                {canEdit ? (
                  <div className="mt-auto flex flex-wrap gap-2">
                    <input
                      ref={(el) => {
                        inputs.current[variant] = el;
                      }}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="sr-only"
                      tabIndex={-1}
                      aria-label={t(`variants.${variant}.name`)}
                      onChange={(event) => {
                        upload(variant, event.target.files?.[0]);
                        event.target.value = "";
                      }}
                    />
                    <Button
                      variant="outline"
                      disabled={busy !== null}
                      onClick={() => inputs.current[variant]?.click()}
                    >
                      <ImageUp data-icon="inline-start" />
                      {busy === variant ? t("uploading") : t("upload")}
                    </Button>
                    {custom[variant] ? (
                      <Button
                        variant="ghost"
                        disabled={busy !== null}
                        onClick={() => void send(variant, { method: "DELETE" })}
                      >
                        <Undo2 data-icon="inline-start" />
                        {t("restore")}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">{canEdit ? t("rules") : t("readOnly")}</p>
      </CardContent>
    </Card>
  );
}
