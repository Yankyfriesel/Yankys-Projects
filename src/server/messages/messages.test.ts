import { beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../db/connection";
import { users } from "../db/schema";
import { seed } from "../db/seed";
import {
  MESSAGES_PER_HOUR,
  MessageError,
  countNewMessages,
  handleMessage,
  latestNewMessage,
  listMessages,
  listMessagesOf,
  sendMessage,
} from "./index";

let database: Database;
let userId: string;
const actor = () => ({ id: userId, display: "Wanda", deviceType: "desktop" as const });
const valid = {
  kind: "request" as const,
  screen: "inventory" as const,
  subject: "permission",
  urgent: false,
  details: "Please let me build pallets.",
  pagePath: "/inventory",
  locale: "en" as const,
};

beforeAll(async () => {
  database = createDatabase({ url: null, pgliteDataDir: null });
  await database.migrate();
  await seed(database.db, { email: "boss@example.com", password: "Temp-1234", name: "Boss" });
  userId = (await database.db.select({ id: users.id }).from(users).limit(1))[0].id;
}, 60_000);

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(MessageError);
    return (error as MessageError).code;
  }
  throw new Error("expected a MessageError");
}

describe("messages to the administrators", () => {
  it("saves a divided message that the administrator can list and count", async () => {
    await sendMessage(database.db, actor(), "desktop", valid);
    await sendMessage(database.db, actor(), "phone", {
      ...valid,
      kind: "problem",
      screen: "receiving",
      subject: "scale",
      urgent: true,
      details: "The scale shows nothing.",
    });
    expect(await countNewMessages(database.db)).toBe(2);
    const list = await listMessages(database.db, "new");
    // The urgent one is on top.
    expect(list[0]).toMatchObject({ kind: "problem", screen: "receiving", urgent: true });
    expect(list[0].senderDisplay).toBe("Wanda");
    expect(list[1]).toMatchObject({
      kind: "request",
      subject: "permission",
      deviceType: "desktop",
    });
    expect((await latestNewMessage(database.db))?.kind).toBeDefined();
  });

  it("refuses a subject that does not belong to the kind, and text that is too short", async () => {
    expect(
      await code(sendMessage(database.db, actor(), "desktop", { ...valid, subject: "scale" })),
    ).toBe("INVALID_INPUT");
    expect(
      await code(sendMessage(database.db, actor(), "desktop", { ...valid, details: "no" })),
    ).toBe("INVALID_INPUT");
  });

  it("marks a message done with an answer the sender can read", async () => {
    const [first] = await listMessages(database.db, "new");
    await handleMessage(
      database.db,
      { id: userId, display: "Boss" },
      first.id,
      "Done, check again.",
    );
    const mine = await listMessagesOf(database.db, userId);
    const answered = mine.find((m) => m.id === first.id)!;
    expect(answered).toMatchObject({
      status: "done",
      reply: "Done, check again.",
      handledByDisplay: "Boss",
    });
    expect(await countNewMessages(database.db)).toBe(1);
    expect(await code(handleMessage(database.db, actor(), "missing", ""))).toBe("NOT_FOUND");
  });

  it("limits how many messages one person sends in an hour", async () => {
    let refused = "";
    for (let i = 0; i < MESSAGES_PER_HOUR + 1 && !refused; i++) {
      try {
        await sendMessage(database.db, actor(), "desktop", valid);
      } catch (error) {
        refused = (error as MessageError).code;
      }
    }
    expect(refused).toBe("RATE_LIMITED");
  });
});
