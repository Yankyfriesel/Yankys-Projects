"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { LabelElement, LabelValues } from "@/lib/labels/model";
import { ElementView } from "./element-view";

/** What is printed: the label's size and elements, the values to fill it with, and how many copies. */
export interface PrintJob {
  widthMm: number;
  heightMm: number;
  elements: LabelElement[];
  values: LabelValues;
  copies: number;
}

/**
 * Several items printed in one go, on the same label type: each item's labels in turn,
 * with one empty label between one item and the next so the person at the printer sees
 * where an item ends.
 */
export interface BatchPrintJob {
  widthMm: number;
  heightMm: number;
  elements: LabelElement[];
  groups: { values: LabelValues; copies: number }[];
}

/**
 * Labels that each have their own values, one after the other: the labels of a shipping order,
 * "1 / 10", "2 / 10" and so on.
 */
export interface SequencePrintJob {
  widthMm: number;
  heightMm: number;
  elements: LabelElement[];
  pages: LabelValues[];
}

/** The pages of a job in print order: a label's values, or null for an empty label. */
export function jobPages(job: PrintJob | BatchPrintJob | SequencePrintJob): (LabelValues | null)[] {
  if ("pages" in job) return job.pages;
  if (!("groups" in job)) return Array.from({ length: job.copies }, () => job.values);
  return job.groups.flatMap((group, index) => [
    ...(index > 0 ? [null] : []),
    ...Array.from({ length: group.copies }, () => group.values),
  ]);
}

/**
 * The labels as they will print, drawn at exact millimetres into a copy of the page
 * kept under <body> and never shown on screen (see globals.css). One block per copy;
 * each one is a page of its own, the size of the label. Render it while a job exists.
 */
export function LabelPrintSheet({ job }: { job: PrintJob | BatchPrintJob | SequencePrintJob }) {
  // False while the page is rendered on the server, true in the browser: the copy needs <body>.
  const inBrowser = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  if (!inBrowser) return null;

  return createPortal(
    <div id="label-print-root" aria-hidden>
      {jobPages(job).map((values, page) => (
        <div
          key={page}
          className="label-copy"
          data-blank={values === null ? "true" : undefined}
          style={{
            position: "relative",
            width: `${job.widthMm}mm`,
            height: `${job.heightMm}mm`,
            overflow: "hidden",
            background: "white",
          }}
        >
          {values === null
            ? null
            : job.elements.map((element) => (
                <ElementView key={element.id} element={element} scale="mm" values={values} />
              ))}
        </div>
      ))}
    </div>,
    document.body,
  );
}

/**
 * Opens the browser's print window for the sheet on the page, on paper of the label's
 * size with no margin, with everything else hidden. Puts the screen back afterwards
 * (and calls `done`). The sheet must already be rendered.
 */
export function printLabelSheet(widthMm: number, heightMm: number, done?: () => void): void {
  const waiting = fontsToLoad();
  if (waiting.length === 0) return startPrint(widthMm, heightMm, done);
  // A typeface is fetched when it is first used, and the labels are not shown on screen: ask for
  // each one now and print when they have arrived (or after a few seconds, so a slow link still prints).
  void Promise.race([
    Promise.all(waiting.map((font) => document.fonts.load(font).catch(() => []))),
    new Promise((resolve) => setTimeout(resolve, FONT_WAIT_MS)),
  ]).then(() => startPrint(widthMm, heightMm, done));
}

const FONT_WAIT_MS = 4000;

/** The typefaces (regular and bold) used by the labels on the page that have not arrived yet. */
function fontsToLoad(): string[] {
  const root = document.getElementById("label-print-root");
  if (!root || !document.fonts) return [];
  const used = new Set<string>();
  for (const element of root.querySelectorAll<HTMLElement>("*")) {
    const style = getComputedStyle(element);
    used.add(`${style.fontWeight} 1em ${style.fontFamily}`);
  }
  return [...used].filter((font) => !document.fonts.check(font));
}

function startPrint(widthMm: number, heightMm: number, done?: () => void): void {
  const page = document.createElement("style");
  page.textContent = `@page { size: ${widthMm}mm ${heightMm}mm; margin: 0 }`;
  document.head.append(page);
  document.body.classList.add("printing-label");

  const finish = () => {
    document.body.classList.remove("printing-label");
    page.remove();
    window.removeEventListener("afterprint", finish);
    done?.();
  };
  window.addEventListener("afterprint", finish);
  window.print();
}
