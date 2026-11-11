import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { SCREEN_ICONS } from "@/components/screen-icons";
import { Card } from "@/components/ui/card";
import { SCREENS, type ScreenKey } from "@/server/permissions/registry";

/** Stand-in for a screen that a later step or phase builds. Shown only to users allowed on that screen. */
export async function ScreenPlaceholder({ screen }: { screen: ScreenKey }) {
  const t = await getTranslations();
  const { builtIn, group } = SCREENS[screen];
  const when =
    "step" in builtIn
      ? t("placeholder.comingInStep", { step: builtIn.step })
      : t("placeholder.comingSoon", { phase: builtIn.phase });
  const Icon = SCREEN_ICONS[screen];

  return (
    <>
      <PageHeader
        icon={<Icon />}
        eyebrow={t(`shell.groups.${group}`)}
        title={t(`nav.${screen}`)}
        description={t(`screens.${screen}`)}
      />
      <Card className="rise" style={{ "--i": 2 } as React.CSSProperties}>
        <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-14 text-center">
          <span className="grid size-20 place-items-center rounded-full border border-gold/40 bg-gold-soft text-gold [&_svg]:size-9">
            <Icon />
          </span>
          <h2 className="font-serif text-2xl font-semibold">{t("placeholder.title")}</h2>
          <p className="text-muted-foreground">{when}</p>
        </div>
      </Card>
    </>
  );
}
