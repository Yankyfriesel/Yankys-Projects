import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getAccess } from "@/server/permissions";
import { SCREENS } from "@/server/permissions/registry";

/** The landing page is the first screen in the user's menu. */
export default async function HomePage() {
  const access = await getAccess();
  const [first] = access.visibleScreens();
  if (first) redirect(SCREENS[first].path);

  const t = await getTranslations("access");
  return (
    <Alert>
      <AlertDescription>{t("noScreens")}</AlertDescription>
    </Alert>
  );
}
