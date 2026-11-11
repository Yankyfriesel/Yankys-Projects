import { ArrowRight, Tag } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** The way into the label designer: how many layouts there are, and a link to the list. */
export async function LabelsCard({ count, index }: { count: number; index: number }) {
  const t = await getTranslations("settings.labelsCard");
  return (
    <Card className="rise" style={{ "--i": index } as React.CSSProperties}>
      <CardHeader>
        <div className="flex items-start gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-full border border-gold/40 bg-gold-soft text-gold [&_svg]:size-5">
            <Tag />
          </span>
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-2xl">{t("title")}</CardTitle>
              <Badge variant="soft">{t("count", { count })}</Badge>
            </div>
            <CardDescription>{t("description")}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Button nativeButton={false} render={<Link href="/settings/labels" />}>
          {t("open")}
          <ArrowRight data-icon="inline-end" className="rtl:rotate-180" />
        </Button>
      </CardContent>
    </Card>
  );
}
