import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { logFor, type Actor } from "../activity-log";
import type { Db } from "../db/connection";
import { adminMessages, type DeviceType } from "../db/schema";

/**
 * Messages from people to the administrators. A message is divided before it is sent: its kind
 * (a question, a request, a problem or a suggestion), the screen it is about, and what about it,
 * so whoever reads it sees at once what is meant. The text is the person's own words.
 */

import {
  MAX_DETAILS,
  MESSAGE_KINDS,
  MESSAGE_SCREENS,
  MESSAGE_SUBJECTS,
  MESSAGES_PER_HOUR,
  MIN_DETAILS,
} from "../../lib/messages";

export {
  MAX_DETAILS,
  MESSAGE_KINDS,
  MESSAGE_SCREENS,
  MESSAGE_SUBJECTS,
  MESSAGES_PER_HOUR,
  MIN_DETAILS,
};
export type { MessageKind, MessageScreen } from "../../lib/messages";

export type MessageErrorCode = "INVALID_INPUT" | "RATE_LIMITED" | "NOT_FOUND";

export class MessageError extends Error {
  constructor(public readonly code: MessageErrorCode) {
    super(code);
    this.name = "MessageError";
  }
}

const inputSchema = z
  .object({
    kind: z.enum(MESSAGE_KINDS),
    screen: z.enum(MESSAGE_SCREENS),
    subject: z.string(),
    urgent: z.boolean(),
    details: z.string().trim().min(MIN_DETAILS).max(MAX_DETAILS),
    pagePath: z.string().max(200).default(""),
    locale: z.enum(["he", "en"]),
  })
  .refine((v) => (MESSAGE_SUBJECTS[v.kind] as readonly string[]).includes(v.subject));

export type MessageInput = z.input<typeof inputSchema>;

export async function sendMessage(
  db: Db,
  actor: Actor,
  deviceType: DeviceType,
  raw: MessageInput,
): Promise<string> {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) throw new MessageError("INVALID_INPUT");
  const input = parsed.data;

  if (actor.id) {
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const [recent] = await db
      .select({ n: count() })
      .from(adminMessages)
      .where(and(eq(adminMessages.senderId, actor.id), gte(adminMessages.createdAt, since)));
    if ((recent?.n ?? 0) >= MESSAGES_PER_HOUR) throw new MessageError("RATE_LIMITED");
  }

  const [row] = await db
    .insert(adminMessages)
    .values({
      senderId: actor.id,
      senderDisplay: actor.display,
      kind: input.kind,
      screen: input.screen,
      subject: input.subject,
      urgent: input.urgent,
      details: input.details,
      pagePath: input.pagePath.startsWith("/") ? input.pagePath : "",
      deviceType,
      locale: input.locale,
    })
    .returning({ id: adminMessages.id });
  await logFor(
    actor,
    "messages.sent",
    {
      entityType: "message",
      entityId: row.id,
      details: {
        kind: input.kind,
        screen: input.screen,
        subject: input.subject,
        urgent: input.urgent,
      },
    },
    db,
  );
  return row.id;
}

export type MessageRow = typeof adminMessages.$inferSelect;

/** New messages first (urgent ones on top), then the answered ones, newest first. */
export async function listMessages(
  db: Db,
  filter: "new" | "done" | "all" = "all",
  limit = 200,
): Promise<MessageRow[]> {
  const where =
    filter === "all" ? undefined : eq(adminMessages.status, filter === "new" ? "new" : "done");
  return db
    .select()
    .from(adminMessages)
    .where(where)
    .orderBy(
      sql`(${adminMessages.status} = 'new') desc`,
      desc(adminMessages.urgent),
      desc(adminMessages.createdAt),
    )
    .limit(limit);
}

export async function countNewMessages(db: Db): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(adminMessages)
    .where(eq(adminMessages.status, "new"));
  return row?.n ?? 0;
}

/** The newest message not answered yet, for the notice. */
export async function latestNewMessage(db: Db): Promise<MessageRow | null> {
  const [row] = await db
    .select()
    .from(adminMessages)
    .where(eq(adminMessages.status, "new"))
    .orderBy(desc(adminMessages.createdAt))
    .limit(1);
  return row ?? null;
}

/** Marks a message as done, with an optional answer for the sender. */
export async function handleMessage(
  db: Db,
  actor: Actor,
  id: string,
  reply: string,
): Promise<void> {
  const text = reply.trim().slice(0, MAX_DETAILS);
  const [row] = await db
    .update(adminMessages)
    .set({
      status: "done",
      handledBy: actor.id,
      handledByDisplay: actor.display,
      handledAt: new Date(),
      reply: text || null,
    })
    .where(eq(adminMessages.id, id))
    .returning({ id: adminMessages.id });
  if (!row) throw new MessageError("NOT_FOUND");
  await logFor(
    actor,
    "messages.handled",
    { entityType: "message", entityId: id, details: { answered: text !== "" } },
    db,
  );
}

/** A person's own latest messages, with the answers. */
export async function listMessagesOf(db: Db, userId: string, limit = 10): Promise<MessageRow[]> {
  return db
    .select()
    .from(adminMessages)
    .where(eq(adminMessages.senderId, userId))
    .orderBy(desc(adminMessages.createdAt))
    .limit(limit);
}
