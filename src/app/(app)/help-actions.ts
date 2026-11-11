"use server";

import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { logFor } from "@/server/activity-log";
import {
  AssistantError,
  assistantConfigured,
  askAssistant,
  type AssistantErrorCode,
} from "@/server/assistant";
import { db } from "@/server/db";
import { isHelpTopic } from "@/lib/help-topics";
import { MessageError, listMessagesOf, sendMessage, type MessageInput } from "@/server/messages";
import { getAccess } from "@/server/permissions";

/** What the "Ask a question" and "Message the admin" parts of the help window use. */

export async function helpStatusAction(): Promise<{ assistant: boolean }> {
  await getAccess();
  return { assistant: assistantConfigured() };
}

const askSchema = z.object({
  question: z.string().max(600),
  topic: z.string(),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(4000) }))
    .max(12),
});

export type AskResult =
  { ok: true; answer: string } | { ok: false; error: AssistantErrorCode | "GENERIC" };

export async function askAssistantAction(input: unknown): Promise<AskResult> {
  const access = await getAccess();
  const parsed = askSchema.safeParse(input);
  if (!parsed.success || !isHelpTopic(parsed.data.topic))
    return { ok: false, error: "INVALID_INPUT" };
  const { question, topic, history } = parsed.data;
  const locale = (await getLocale()) === "en" ? "en" : "he";
  const nav = await getTranslations("nav");
  const help = await getTranslations("help.pages");
  try {
    const answer = await askAssistant({
      userId: access.user.id,
      question,
      history,
      locale,
      page: help(`${topic}.title`),
      screens: access.visibleScreens().map((screen) => nav(screen)),
    });
    await logFor(
      access.actor,
      "assistant.asked",
      { details: { topic, question: question.trim().slice(0, 200) } },
      db,
    );
    return { ok: true, answer };
  } catch (error) {
    if (error instanceof AssistantError) return { ok: false, error: error.code };
    console.error("[assistant] failed", error);
    return { ok: false, error: "GENERIC" };
  }
}

export type SendMessageResult =
  { ok: true } | { ok: false; error: "INVALID_INPUT" | "RATE_LIMITED" | "GENERIC" };

export async function sendMessageAction(input: unknown): Promise<SendMessageResult> {
  const access = await getAccess();
  const locale = (await getLocale()) === "en" ? "en" : "he";
  try {
    await sendMessage(db, access.actor, access.deviceType, {
      ...(input as object),
      locale,
    } as MessageInput);
    return { ok: true };
  } catch (error) {
    if (error instanceof MessageError && error.code !== "NOT_FOUND") {
      return { ok: false, error: error.code };
    }
    console.error("[messages] sending failed", error);
    return { ok: false, error: "GENERIC" };
  }
}

export interface MyMessage {
  id: string;
  kind: string;
  screen: string;
  subject: string;
  details: string;
  createdAt: string;
  status: "new" | "done";
  reply: string | null;
  handledByDisplay: string | null;
}

export async function myMessagesAction(): Promise<MyMessage[]> {
  const access = await getAccess();
  const rows = await listMessagesOf(db, access.user.id, 10);
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    screen: row.screen,
    subject: row.subject,
    details: row.details,
    createdAt: row.createdAt.toISOString(),
    status: row.status,
    reply: row.reply,
    handledByDisplay: row.handledByDisplay,
  }));
}
