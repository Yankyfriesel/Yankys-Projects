"use client";

import { Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import { LabelPrintSheet, printLabelSheet } from "@/components/labels/label-print";
import { Button } from "@/components/ui/button";
import type { LabelElement, LabelValues } from "@/lib/labels/model";

/**
 * Prints the label as it is on the screen (saved or not) through the browser's print
 * window, at its exact size in millimetres, one copy. Direct printing to the TSC printer
 * comes in phase 3; this is for looking at a design.
 */
export function TestPrint({
  widthMm,
  heightMm,
  elements,
  values,
}: {
  widthMm: number;
  heightMm: number;
  elements: LabelElement[];
  values: LabelValues;
}) {
  const t = useTranslations("labels.editor");
  return (
    <>
      <Button variant="outline" onClick={() => printLabelSheet(widthMm, heightMm)}>
        <Printer data-icon="inline-start" />
        {t("testPrint")}
      </Button>
      <LabelPrintSheet job={{ widthMm, heightMm, elements, values, copies: 1 }} />
    </>
  );
}
