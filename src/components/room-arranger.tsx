"use client";

import { ArrowDown, ArrowUp, GripVertical, ListOrdered } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveRoomOrderAction } from "@/app/(app)/dashboard/room-order-actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Arranging the storage rooms by hand: a button turns arranging on, each room can then be dragged
 * to a new place (or moved with the arrows), and Done saves the order for everyone, on the
 * dashboard and in the inventory.
 */
export function useRoomArranger(codes: string[]) {
  const t = useTranslations("rooms");
  const [draft, setDraft] = useState<string[] | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const editing = draft !== null;
  const order = draft ?? codes;

  function place(code: string, target: number) {
    setDraft((current) => {
      const list = [...(current ?? codes)];
      const from = list.indexOf(code);
      if (from < 0) return list;
      list.splice(from, 1);
      list.splice(Math.max(0, Math.min(target, list.length)), 0, code);
      return list;
    });
  }

  function save() {
    if (!draft) return;
    startSaving(async () => {
      const result = await saveRoomOrderAction(draft);
      if (!result.ok) return void toast.error(t("saveFailed"));
      toast.success(t("saved"));
      setDraft(null);
    });
  }

  /** What a room's wrapper needs to be dragged and dropped. */
  function dropProps(code: string) {
    return {
      draggable: editing,
      onDragStart: (event: React.DragEvent) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", code);
        setDragging(code);
      },
      onDragEnd: () => {
        setDragging(null);
        setOver(null);
      },
      onDragOver: (event: React.DragEvent) => {
        if (!editing || !dragging) return;
        event.preventDefault();
        setOver(code);
      },
      onDrop: (event: React.DragEvent) => {
        if (!editing || !dragging) return;
        event.preventDefault();
        if (dragging !== code) place(dragging, order.indexOf(code));
        setDragging(null);
        setOver(null);
      },
      "data-dragging": dragging === code || undefined,
      "data-over": (over === code && dragging !== code) || undefined,
    };
  }

  return {
    order,
    editing,
    saving,
    start: () => setDraft([...codes]),
    cancel: () => setDraft(null),
    save,
    move: (code: string, by: -1 | 1) => place(code, order.indexOf(code) + by),
    dropProps,
  };
}

export type RoomArranger = ReturnType<typeof useRoomArranger>;

/** The button that turns arranging on, and Done / Cancel while it is on. */
export function ArrangeBar({ arranger }: { arranger: RoomArranger }) {
  const t = useTranslations("rooms");
  if (!arranger.editing) {
    return (
      <div className="flex justify-end">
        <Button type="button" variant="outline" size="sm" onClick={arranger.start}>
          <ListOrdered data-icon="inline-start" />
          {t("arrange")}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold/40 bg-gold-soft/40 px-4 py-3">
      <p className="text-sm text-muted-foreground">{t("hint")}</p>
      <div className="flex gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={arranger.cancel}>
          {t("cancel")}
        </Button>
        <Button type="button" size="sm" disabled={arranger.saving} onClick={arranger.save}>
          {t("done")}
        </Button>
      </div>
    </div>
  );
}

/** The handle and arrows laid over a room while arranging. */
export function RoomHandle({
  arranger,
  code,
  name,
}: {
  arranger: RoomArranger;
  code: string;
  name: string;
}) {
  const t = useTranslations("rooms");
  const index = arranger.order.indexOf(code);
  return (
    <div className="absolute end-3 top-3 z-10 flex items-center gap-1 rounded-full border border-border bg-card/95 p-1 shadow-sm">
      <span
        aria-hidden
        className="grid size-7 cursor-grab place-items-center text-muted-foreground active:cursor-grabbing"
      >
        <GripVertical className="size-4" />
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t("earlier", { name })}
        disabled={index <= 0}
        onClick={() => arranger.move(code, -1)}
      >
        <ArrowUp />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t("later", { name })}
        disabled={index < 0 || index >= arranger.order.length - 1}
        onClick={() => arranger.move(code, 1)}
      >
        <ArrowDown />
      </Button>
    </div>
  );
}

/** The wrapper that makes one room draggable while arranging. */
export function ArrangeSlot({
  arranger,
  code,
  name,
  children,
}: {
  arranger: RoomArranger;
  code: string;
  name: string;
  children: React.ReactNode;
}) {
  return (
    <div
      {...arranger.dropProps(code)}
      data-testid="room-slot"
      data-code={code}
      className={cn(
        "relative min-w-0 rounded-2xl",
        arranger.editing && "cursor-grab ring-1 ring-gold/40 data-[dragging]:opacity-40",
        arranger.editing && "data-[over]:ring-2 data-[over]:ring-primary",
      )}
    >
      {arranger.editing ? <RoomHandle arranger={arranger} code={code} name={name} /> : null}
      {children}
    </div>
  );
}
