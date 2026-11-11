"use client";

import { ScanLine } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * The big scan bar at the top of a scanning screen: an icon (or a step number), a title and a
 * hint, and the input the scanner types into. Enter hands the text over and empties nothing by
 * itself; the screen decides.
 */
export function ScanBar({
  id,
  label,
  title,
  hint,
  placeholder,
  value,
  onChange,
  onEnter,
  disabled,
  inputRef,
  step,
  children,
}: {
  id: string;
  /** What the input is called (read by screen readers; the title is what is seen). */
  label: string;
  title: string;
  hint: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onEnter: () => void;
  disabled?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
  /** A step number shown in place of the scan icon. */
  step?: number;
  /** Messages shown under the bar. */
  children?: React.ReactNode;
}) {
  return (
    <div className="rise space-y-4 rounded-2xl border border-border bg-card p-5 shadow-card">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary/10 font-serif text-xl font-semibold text-primary">
            {step ?? <ScanLine className="size-6" aria-hidden />}
          </span>
          <div className="space-y-0.5">
            <h2 className="font-serif text-lg font-semibold">{title}</h2>
            <p className="text-sm text-muted-foreground">{hint}</p>
          </div>
        </div>
        <div className="relative w-full md:max-w-md">
          <Label htmlFor={id} className="sr-only">
            {label}
          </Label>
          <ScanLine
            aria-hidden
            className="pointer-events-none absolute end-3.5 top-1/2 size-5 -translate-y-1/2 text-primary"
          />
          <Input
            id={id}
            ref={inputRef}
            dir="ltr"
            autoFocus
            autoComplete="off"
            disabled={disabled}
            value={value}
            placeholder={placeholder}
            className="h-12 border-primary/40 pe-11 text-base focus-visible:border-primary"
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              onEnter();
            }}
          />
        </div>
      </div>
      {children}
    </div>
  );
}
