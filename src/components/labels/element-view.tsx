"use client";

import { useMemo } from "react";
import { barcodeSvg, qrSvg } from "@/lib/labels/codes";
import { extraFontFamily } from "@/lib/labels/fonts";
import { pointsToMm } from "@/lib/labels/geometry";
import {
  lineText,
  type ElementStyle,
  type LabelElement,
  type LabelValues,
} from "@/lib/labels/model";
import { cn } from "@/lib/utils";

/** The class of the three screen typefaces; the others are set by font-family (see fontStyle). */
const FONT_CLASS = (font: ElementStyle["font"]): string | undefined =>
  ({ sans: "font-sans", serif: "font-serif", mono: "font-mono" })[font as string];

/** The font-family of one of the typefaces added for labels, as a style. */
const fontStyle = (font: ElementStyle["font"]): React.CSSProperties | undefined => {
  const family = extraFontFamily(font);
  return family ? { fontFamily: family } : undefined;
};

const ALIGN_CLASS: Record<ElementStyle["align"], string> = {
  start: "text-start",
  center: "text-center",
  end: "text-end",
};

/** Where a line's value sits when the line has no words before it. */
const LINE_JUSTIFY: Record<ElementStyle["align"], string> = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
};

/** What a text, field, barcode or QR element shows or encodes, from the label's values. */
export function elementText(element: LabelElement, values: LabelValues): string {
  switch (element.type) {
    case "text":
      return element.text;
    case "field":
    case "barcode":
      return values[element.field];
    case "qr":
      if (element.source === "itemLabel") return values.qrItemLabel;
      if (element.source === "pallet") return values.qrPallet;
      return values[element.source];
    default:
      return "";
  }
}

/** `scale` is pixels per millimetre (the editor), or "mm" to size everything in real millimetres and points (printing). */
export type Scale = number | "mm";

/**
 * One element drawn inside the label. The editor and the test print use the same
 * drawing; only the unit differs.
 */
export function ElementView({
  element,
  scale,
  values,
}: {
  element: LabelElement;
  scale: Scale;
  values: LabelValues;
}) {
  const len = (mm: number): string | number => (scale === "mm" ? `${mm}mm` : mm * scale);
  const frame: React.CSSProperties = {
    position: "absolute",
    left: len(element.x),
    top: len(element.y),
    width: len(element.w),
    height: len(element.h),
  };

  switch (element.type) {
    case "line":
      return <div style={frame} className="bg-black" />;
    case "box":
      return (
        <div
          style={{ ...frame, borderWidth: len(element.borderMm) }}
          className="box-border border-solid border-black"
        />
      );
    case "lines": {
      // A length inside a "border-bottom: 0.25 dotted black" needs its unit, which a bare number lacks.
      const css = (mm: number) => (scale === "mm" ? `${mm}mm` : `${mm * scale}px`);
      const points = (size: number) => (scale === "mm" ? `${size}pt` : pointsToMm(size) * scale);
      return (
        <div
          style={{
            ...frame,
            borderWidth: len(element.borderMm),
            borderRadius: len(element.radiusMm),
          }}
          className="box-border flex flex-col overflow-hidden border-solid border-black text-black"
        >
          {element.lines.map((line, index) => {
            const last = index === element.lines.length - 1;
            return (
              <div
                key={index}
                dir={line.style.dir}
                style={{
                  ...fontStyle(line.style.font),
                  fontSize: points(line.style.fontSize),
                  lineHeight: 1.15,
                  paddingInline: len(0.8),
                  columnGap: len(1),
                  borderBottom:
                    last || element.separator === "none"
                      ? undefined
                      : `${css(0.25)} ${element.separator} black`,
                }}
                className={cn(
                  "box-border flex min-h-0 flex-1 items-center overflow-hidden",
                  line.label
                    ? line.style.align === "center"
                      ? "justify-center"
                      : "justify-between"
                    : LINE_JUSTIFY[line.style.align],
                  FONT_CLASS(line.style.font),
                  line.style.bold && "font-bold",
                )}
              >
                {line.label ? (
                  <span dir="auto" className="shrink-0">
                    {line.label}
                  </span>
                ) : null}
                <span
                  dir="auto"
                  style={{ textAlign: line.label ? undefined : line.style.align }}
                  className="min-w-0 break-words whitespace-pre-line"
                >
                  {lineText(line, values)}
                </span>
              </div>
            );
          })}
        </div>
      );
    }
    case "logo":
      return (
        // eslint-disable-next-line @next/next/no-img-element -- the label is drawn at exact millimetres
        <img
          src={`/api/brand/${element.variant}`}
          alt=""
          draggable={false}
          style={frame}
          className="object-contain select-none"
        />
      );
    case "barcode":
      return (
        <Code
          frame={frame}
          svg={(text) => barcodeSvg(text, element.showText)}
          text={elementText(element, values)}
          showText={element.showText}
        />
      );
    case "qr":
      return <Code frame={frame} svg={qrSvg} text={elementText(element, values)} />;
    default: {
      const { style } = element;
      return (
        <div
          style={{
            ...frame,
            ...fontStyle(style.font),
            fontSize: scale === "mm" ? `${style.fontSize}pt` : pointsToMm(style.fontSize) * scale,
            lineHeight: 1.15,
          }}
          dir={style.dir}
          className={cn(
            "overflow-hidden break-words text-black",
            FONT_CLASS(style.font),
            ALIGN_CLASS[style.align],
            style.bold && "font-bold",
          )}
        >
          {elementText(element, values)}
        </div>
      );
    }
  }
}

/** A barcode or QR code filling its box; an empty dashed box when the text cannot be encoded. */
function Code({
  frame,
  svg,
  text,
  showText,
}: {
  frame: React.CSSProperties;
  svg: (text: string) => string | null;
  text: string;
  showText?: boolean;
}) {
  // The picture depends only on the text (and whether the digits show), not on position or size.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `svg` is a fresh closure on every render
  const markup = useMemo(() => svg(text), [text, showText]);
  if (!markup) return <div style={frame} className="border border-dashed border-black/40" />;
  return <div style={frame} dangerouslySetInnerHTML={{ __html: markup }} />;
}
