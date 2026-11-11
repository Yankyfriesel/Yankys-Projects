import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";

/** Also what a user sees for a screen they have no permission for: it simply does not exist for them. */
export default async function NotFound() {
  const t = await getTranslations("common");
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-8 text-center">
      <h1 className="text-2xl font-bold">{t("notFound")}</h1>
      <Button variant="outline" nativeButton={false} render={<Link href="/" />}>
        {t("back")}
      </Button>
    </main>
  );
}
