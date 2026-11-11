import { beforeEach, describe, expect, it } from "vitest";
import {
  AssistantError,
  DEFAULT_MODEL,
  askAssistant,
  assistantConfigured,
  checkRate,
  resetRate,
} from "./index";

const input = {
  userId: "u1",
  question: "How do I print a label?",
  locale: "en" as const,
  page: "Item catalog",
  screens: ["Dashboard", "Item catalog"],
};

function fakeFetch(answer: string, status = 200) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ content: [{ type: "text", text: answer }] }), { status });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AssistantError);
    return (error as AssistantError).code;
  }
  throw new Error("expected an AssistantError");
}

beforeEach(() => resetRate());

describe("the question helper", () => {
  it("is off until a key is set, and then says so instead of calling anyone", async () => {
    expect(assistantConfigured({})).toBe(false);
    expect(assistantConfigured({ ANTHROPIC_API_KEY: "  " })).toBe(false);
    expect(assistantConfigured({ ANTHROPIC_API_KEY: "k" })).toBe(true);
    const { impl, calls } = fakeFetch("x");
    expect(await code(askAssistant(input, { env: {}, fetchImpl: impl }))).toBe("NOT_CONFIGURED");
    expect(calls).toHaveLength(0);
  });

  it("sends the manual, the page and the screens with the key, and returns the answer", async () => {
    const { impl, calls } = fakeFetch("1. Open the item.\n2. Press Print a label.");
    const answer = await askAssistant(
      {
        ...input,
        history: [
          { role: "user", text: "Where is the catalog?" },
          { role: "assistant", text: "In the menu." },
        ],
      },
      { env: { ANTHROPIC_API_KEY: "secret-key" }, fetchImpl: impl },
    );
    expect(answer).toContain("Press Print a label");
    const [call] = calls;
    expect(call.url).toBe("https://api.anthropic.com/v1/messages");
    const headers = call.init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("secret-key");
    const body = JSON.parse(call.init.body as string);
    expect(body.model).toBe(DEFAULT_MODEL);
    expect(body.system[0].text).toContain("THE MANUAL:");
    expect(body.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(body.system[1].text).toContain("Item catalog");
    expect(body.messages.map((m: { role: string }) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(body.messages.at(-1).content).toBe("How do I print a label?");
  });

  it("answers in Hebrew from the Hebrew manual for a Hebrew screen", async () => {
    const { impl, calls } = fakeFetch("שלום");
    await askAssistant({ ...input, locale: "he" }, { env: { ANTHROPIC_API_KEY: "k" }, fetchImpl: impl });
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.system[0].text).toContain("Hebrew");
    expect(body.system[0].text).toMatch(/[֐-׿]/);
  });

  it("refuses an empty or very long question, and a failing service is reported", async () => {
    const env = { ANTHROPIC_API_KEY: "k" };
    const { impl } = fakeFetch("x");
    expect(await code(askAssistant({ ...input, question: " " }, { env, fetchImpl: impl }))).toBe(
      "INVALID_INPUT",
    );
    expect(
      await code(askAssistant({ ...input, question: "x".repeat(601) }, { env, fetchImpl: impl })),
    ).toBe("INVALID_INPUT");
    const down = fakeFetch("", 500);
    expect(await code(askAssistant(input, { env, fetchImpl: down.impl }))).toBe("UNAVAILABLE");
  });

  it("lets one person ask only so many questions", () => {
    const now = 1_000_000;
    for (let i = 0; i < 20; i++) checkRate("u1", now + i);
    expect(() => checkRate("u1", now + 100)).toThrow(AssistantError);
    // Another person is not held back, and the first one may ask again after ten minutes.
    expect(() => checkRate("u2", now + 100)).not.toThrow();
    expect(() => checkRate("u1", now + 11 * 60 * 1000)).not.toThrow();
  });
});
