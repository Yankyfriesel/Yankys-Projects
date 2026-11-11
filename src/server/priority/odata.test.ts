import { describe, expect, it } from "vitest";
import {
  ACCESS_KEY_PASSWORD,
  OdataError,
  OdataHttp,
  errorDetail,
  findItemTexts,
  isFormName,
  probeForm,
  subformsIn,
} from "./odata";
import type { PriorityCredentials } from "./settings";

const credentials: PriorityCredentials = {
  baseUrl: "https://p.example.online/odata/Priority/tabula.ini/democo/",
  user: "KEY0123456789",
  password: null,
};

interface Call {
  url: string;
  init: RequestInit;
}

/** A pretend Priority: answers every request with the given status and body, and remembers what it was asked. */
function pretend(status: number, body: unknown) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  }) as typeof fetch;
  return { calls, http: new OdataHttp(credentials, fetchImpl) };
}

const basic = (call: Call) =>
  Buffer.from(
    String((call.init.headers as Record<string, string>).Authorization).slice(6),
    "base64",
  ).toString();

describe("signing in", () => {
  it("sends the access key as the user name and Priority's fixed word as the password", async () => {
    const { calls, http } = pretend(200, { value: [] });
    await http.get("LOGPART");
    expect(basic(calls[0])).toBe(`KEY0123456789:${ACCESS_KEY_PASSWORD}`);
    expect(calls[0].init.method).toBe("GET");
    expect((calls[0].init.headers as Record<string, string>).Accept).toBe("application/json");
  });

  it("uses the stored password when there is one", async () => {
    const calls: Call[] = [];
    const http = new OdataHttp({ ...credentials, password: "pw" }, (async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response("{}", { status: 200 });
    }) as typeof fetch);
    await http.get("LOGPART");
    expect(basic(calls[0])).toBe("KEY0123456789:pw");
  });

  it("never puts the key or the password in the address", async () => {
    const { calls, http } = pretend(200, {});
    await http.get("LOGPART", { $top: "1" });
    expect(calls[0].url).not.toContain("KEY0123456789");
  });
});

describe("addresses", () => {
  it("join the base address, the form and the options with single slashes", () => {
    const http = new OdataHttp(credentials);
    expect(http.url("LOGPART")).toBe(
      "https://p.example.online/odata/Priority/tabula.ini/democo/LOGPART",
    );
    expect(http.url("/LOGPART", { $top: "1", $filter: "PARTNAME eq 'A B'" })).toBe(
      "https://p.example.online/odata/Priority/tabula.ini/democo/LOGPART?$top=1&$filter=PARTNAME%20eq%20'A%20B'",
    );
  });

  it("accept only plain form names", () => {
    expect(isFormName("LOGPART")).toBe(true);
    expect(isFormName("PARTBAL_SUBFORM")).toBe(true);
    for (const bad of ["", "../x", "LOG PART", "A?b=1", "1ABC", "A/B", "A".repeat(61)])
      expect(isFormName(bad)).toBe(false);
  });
});

describe("when Priority does not take the request", () => {
  async function code(status: number, body: unknown = "") {
    const { http } = pretend(status, body);
    try {
      await http.get("LOGPART");
    } catch (error) {
      expect(error).toBeInstanceOf(OdataError);
      return (error as OdataError).code;
    }
    throw new Error("expected an error");
  }

  it("tells a wrong key, a missing form, a refused request and an unreachable Priority apart", async () => {
    expect(await code(401)).toBe("AUTH_FAILED");
    expect(await code(403)).toBe("AUTH_FAILED");
    expect(await code(404)).toBe("NOT_FOUND");
    expect(await code(400, { error: { message: "Unknown field" } })).toBe("BAD_REQUEST");
    for (const status of [408, 500, 502, 503, 504]) expect(await code(status)).toBe("UNAVAILABLE");
  });

  it("calls a locked account 'rate limited', which is never retried by itself", async () => {
    expect(
      await code(429, {
        error: { message: "Account locked due to too many failed login attempts." },
      }),
    ).toBe("RATE_LIMITED");
  });

  it("calls a network failure or a timeout 'unavailable', so it retries later", async () => {
    for (const name of ["TypeError", "TimeoutError", "AbortError"]) {
      const http = new OdataHttp(credentials, (async () => {
        throw Object.assign(new Error("boom"), { name });
      }) as typeof fetch);
      await expect(http.get("LOGPART")).rejects.toMatchObject({
        code: "UNAVAILABLE",
        status: null,
      });
    }
  });

  it("does not mistake a page of HTML for data", async () => {
    const { http } = pretend(200, "<html><body>Sign in</body></html>");
    await expect(http.get("LOGPART")).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("keeps Priority's own words, short, and never the credentials", async () => {
    const { http } = pretend(400, { error: { message: "Field FOO does not exist in LOGPART" } });
    await expect(http.get("LOGPART")).rejects.toMatchObject({
      detail: "Field FOO does not exist in LOGPART",
    });
    expect(errorDetail("<error><message>Bad   thing</message></error>")).toBe("Bad thing");
    expect(errorDetail("x".repeat(1000)).length).toBe(300);
    expect(errorDetail(JSON.stringify({ message: "plain message" }))).toBe("plain message");
  });
});

describe("checking a form", () => {
  it("lists the fields of the first row and a short sample of each value", async () => {
    const { calls, http } = pretend(200, {
      "@odata.context": "x",
      value: [
        {
          PARTNAME: "N2015D-S",
          PARTDES: "המבורגר",
          WEIGHT: 12.5,
          NOTE: null,
          LONG: "y".repeat(100),
        },
      ],
    });
    const probe = await probeForm(http, "LOGPART");
    expect(calls[0].url).toContain("LOGPART?$top=1");
    expect(probe).toMatchObject({ form: "LOGPART", ok: true, status: 200, error: null });
    expect(probe.fields).toEqual(["PARTNAME", "PARTDES", "WEIGHT", "NOTE", "LONG"]);
    expect(probe.sample).toMatchObject({ PARTNAME: "N2015D-S", WEIGHT: "12.5", NOTE: "" });
    expect(probe.sample.LONG.length).toBe(60);
  });

  it("says so when the form answers but has no rows", async () => {
    const { http } = pretend(200, { value: [] });
    expect(await probeForm(http, "PARTBAL")).toMatchObject({
      ok: true,
      fields: [],
      error: "the form answered but has no rows",
    });
  });

  it("reports what went wrong instead of throwing, and does not even ask for a bad name", async () => {
    const missing = pretend(404, { error: { message: "Form NOPE not found" } });
    expect(await probeForm(missing.http, "NOPE")).toMatchObject({
      ok: false,
      status: 404,
      code: "NOT_FOUND",
      error: "Form NOPE not found",
    });
    const denied = pretend(401, "");
    expect(await probeForm(denied.http, "LOGPART")).toMatchObject({
      ok: false,
      code: "AUTH_FAILED",
    });

    const bad = pretend(200, { value: [] });
    expect(await probeForm(bad.http, "../etc")).toMatchObject({
      ok: false,
      error: "not a form name",
    });
    expect(bad.calls).toHaveLength(0);
  });
});

describe("finding an item's texts", () => {
  const metadata = `<Schema><EntityType Name="LOGPART"><Property Name="PARTNAME"/>
    <NavigationProperty Name="PARTTEXT_SUBFORM" Type="x"/><NavigationProperty Name="PARTSPEC_SUBFORM" Type="y"/>
    </EntityType><EntityType Name="OTHER"><NavigationProperty Name="NOT_THIS" Type="z"/></EntityType></Schema>`;

  it("reads the sub-form names of one form from Priority's description", () => {
    expect(subformsIn(metadata, "LOGPART")).toEqual(["PARTTEXT_SUBFORM", "PARTSPEC_SUBFORM"]);
    expect(subformsIn(metadata, "NOPE")).toEqual([]);
  });

  it("looks through every sub-form of the item and reports where words are kept", async () => {
    const asked: string[] = [];
    const fetchImpl = (async (url: string | URL | Request) => {
      const address = decodeURIComponent(String(url));
      asked.push(address);
      if (address.includes("$metadata")) return new Response(metadata, { status: 200 });
      if (address.includes("PARTTEXT_SUBFORM"))
        return new Response(JSON.stringify({ value: [{ TEXT: "יש לשמור ב-18- מעלות", LINE: 1 }] }));
      if (address.includes("PARTSPEC_SUBFORM"))
        return new Response(JSON.stringify({ error: { message: "לא ניתן" } }), { status: 400 });
      return new Response(JSON.stringify({ PARTNAME: "M1", PARTDES: "בריסקט", PRICE: 3 }));
    }) as typeof fetch;
    const probes = await findItemTexts(new OdataHttp(credentials, fetchImpl), "M1");
    const by = (form: string) => probes.find((p) => p.form === form)!;
    expect(by("LOGPART('M1')").sample).toEqual({ PARTDES: "בריסקט" });
    expect(by("LOGPART('M1')/PARTTEXT_SUBFORM").sample).toEqual({ TEXT: "יש לשמור ב-18- מעלות" });
    expect(by("LOGPART('M1')/PARTSPEC_SUBFORM")).toMatchObject({ ok: false, status: 400 });
    expect(asked.some((url) => url.includes("NOT_THIS"))).toBe(false);
  });
});
