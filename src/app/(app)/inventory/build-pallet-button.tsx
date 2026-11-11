"use client";

import { PackagePlus } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

/** The address flag that opens the pallet builder below the filters. */
export const BUILD_PARAM = "build";

/** Sets or clears the builder flag in the address, without asking the server for the page again. */
export function setBuilding(on: boolean) {
  const params = new URLSearchParams(window.location.search);
  if (on) params.set(BUILD_PARAM, "1");
  else params.delete(BUILD_PARAM);
  const query = params.toString();
  const url = `${window.location.pathname}${query ? `?${query}` : ""}`;
  if (on) window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
}

/** "Build a pallet", at the top of the inventory: opens the pallet builder. */
export function BuildPalletButton() {
  const t = useTranslations("pallets.create");
  const building = useSearchParams().get(BUILD_PARAM) === "1";
  return (
    <Button
      type="button"
      variant={building ? "default" : "outline"}
      aria-pressed={building}
      onClick={() => setBuilding(true)}
    >
      <PackagePlus data-icon="inline-start" />
      {t("start")}
    </Button>
  );
}
