"use client";

import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** A number typed in millimetres or points. Keeps what is being typed until the field is left. */
export function NumberField({
  label,
  value,
  onChange,
  step = 0.5,
  min,
  max,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
  disabled?: boolean;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        dir="ltr"
        step={step}
        min={min}
        max={max}
        disabled={disabled}
        className="h-9"
        value={draft ?? String(value)}
        onChange={(event) => {
          setDraft(event.target.value);
          const parsed = Number(event.target.value);
          if (event.target.value.trim() !== "" && Number.isFinite(parsed)) onChange(parsed);
        }}
        onBlur={() => setDraft(null)}
      />
    </div>
  );
}

/** A plain drop-down, styled like the inputs. */
export function SelectField({
  label,
  value,
  onChange,
  disabled,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-lg border border-input bg-card px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
      >
        {children}
      </select>
    </div>
  );
}

/** A few choices side by side, one chosen. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="space-y-1">
      <span id={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={id} className="flex rounded-lg bg-muted p-0.5">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "h-8 flex-1 rounded-md px-2 text-xs font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
              value === option.value
                ? "bg-card text-foreground shadow-card"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
