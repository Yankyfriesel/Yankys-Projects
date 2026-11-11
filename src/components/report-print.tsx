"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

/**
 * A report as it prints: the children, drawn into a copy of the page kept under <body> and
 * never shown on screen (see globals.css). Render it while a report is being printed.
 */
export function ReportPrintSheet({
  children,
  dir,
}: {
  children: React.ReactNode;
  dir: "rtl" | "ltr";
}) {
  // False while the page is rendered on the server, true in the browser: the copy needs <body>.
  const inBrowser = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  if (!inBrowser) return null;
  return createPortal(
    <div id="report-print-root" dir={dir} aria-hidden>
      {children}
    </div>,
    document.body,
  );
}

/**
 * Opens the browser's print window for the report on the page (choosing "Save as PDF" there
 * makes the file), on A4 across the page. Puts the screen back afterwards and calls `done`.
 */
export function printReport(done?: () => void): void {
  const page = document.createElement("style");
  page.textContent = "@page { size: A4 landscape; margin: 10mm }";
  document.head.append(page);
  document.body.classList.add("printing-report");

  const finish = () => {
    document.body.classList.remove("printing-report");
    page.remove();
    window.removeEventListener("afterprint", finish);
    done?.();
  };
  window.addEventListener("afterprint", finish);
  window.print();
}
