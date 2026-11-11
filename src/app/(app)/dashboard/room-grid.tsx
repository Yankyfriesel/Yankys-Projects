"use client";

import { ArrangeBar, ArrangeSlot, useRoomArranger } from "@/components/room-arranger";

/** The room cards, which can be arranged by hand by whoever is allowed to. */
export function RoomGrid({
  rooms,
  canArrange,
}: {
  rooms: { code: string; name: string; card: React.ReactNode }[];
  canArrange: boolean;
}) {
  const arranger = useRoomArranger(rooms.map((room) => room.code));
  const byCode = new Map(rooms.map((room) => [room.code, room]));
  return (
    <div className="space-y-4">
      {canArrange && rooms.length > 1 ? <ArrangeBar arranger={arranger} /> : null}
      <div className="grid gap-5 lg:grid-cols-2" data-testid="dashboard-rooms">
        {arranger.order.map((code) => {
          const room = byCode.get(code);
          if (!room) return null;
          return (
            <ArrangeSlot key={code} arranger={arranger} code={code} name={room.name}>
              {room.card}
            </ArrangeSlot>
          );
        })}
      </div>
    </div>
  );
}
