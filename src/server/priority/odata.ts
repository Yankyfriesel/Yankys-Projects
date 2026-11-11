import { PriorityError, type PriorityErrorCode } from "./types";
import type { PriorityCredentials } from "./settings";

/**
 * Talking to Priority's OData API. This file reads, and has one deliberate way to ask whether
 * writing is allowed (probeWrite), which sends a request that can never create anything. Signing in is Priority's access-key way: HTTP Basic with the key as the user name and,
 * when no password was stored, the fixed word "PAT" as the password. No app id or app key.
 */

/** The password Priority expects together with an access key. */
export const ACCESS_KEY_PASSWORD = "PAT";

const TIMEOUT_MS = 20_000;
/** Longest piece of Priority's own error text kept; long enough to read, short enough to be safe. */
const MAX_DETAIL = 300;
const FORM_NAME = /^[A-Za-z][A-Za-z0-9_]{0,59}$/;

/** What went wrong, with Priority's own words when it gave any (never the credentials). */
export class OdataError extends PriorityError {
  constructor(
    code: PriorityErrorCode,
    public readonly status: number | null,
    public readonly detail: string,
  ) {
    super(code);
    this.name = "OdataError";
  }
}

export function isFormName(name: string): boolean {
  return FORM_NAME.test(name);
}

function codeForStatus(status: number): PriorityErrorCode {
  if (status === 401 || status === 403) return "AUTH_FAILED";
  if (status === 404) return "NOT_FOUND";
  // A locked account or "too many requests": asking again makes it worse, so it is not "unavailable".
  if (status === 429) return "RATE_LIMITED";
  if (status === 408 || status >= 500) return "UNAVAILABLE";
  return "BAD_REQUEST";
}

/** Priority's error text out of a JSON or XML or plain body, short and on one line. */
export function errorDetail(body: string): string {
  let text = body.trim();
  try {
    const json = JSON.parse(text) as { error?: { message?: unknown } | string; message?: unknown };
    const message =
      typeof json.error === "string"
        ? json.error
        : typeof json.error?.message === "string"
          ? json.error.message
          : typeof json.message === "string"
            ? json.message
            : null;
    if (message) text = message;
  } catch {
    // Not JSON: use the text as it is (XML tags are stripped below).
  }
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_DETAIL);
}

export class OdataHttp {
  constructor(
    private readonly credentials: PriorityCredentials,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private authorization(): string {
    const password = this.credentials.password ?? ACCESS_KEY_PASSWORD;
    return `Basic ${Buffer.from(`${this.credentials.user}:${password}`, "utf8").toString("base64")}`;
  }

  /** The address of a form, with the options (like $top) after it. */
  url(path: string, query: Record<string, string> = {}): string {
    const base = this.credentials.baseUrl.replace(/\/+$/, "");
    const options = Object.entries(query)
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
      .join("&");
    return `${base}/${path.replace(/^\/+/, "")}${options ? `?${options}` : ""}`;
  }

  /** One GET of the raw answer. Throws OdataError: UNAVAILABLE when Priority cannot be reached. */
  private async fetchBody(
    path: string,
    query: Record<string, string>,
    accept: string,
  ): Promise<{ status: number; body: string }> {
    let response: Response;
    try {
      response = await this.fetchImpl(this.url(path, query), {
        method: "GET",
        headers: { Authorization: this.authorization(), Accept: accept },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
    } catch (error) {
      const reason = error instanceof Error ? error.name : "error";
      throw new OdataError("UNAVAILABLE", null, `no answer (${reason})`);
    }
    const body = await response.text().catch(() => "");
    if (!response.ok) {
      throw new OdataError(codeForStatus(response.status), response.status, errorDetail(body));
    }
    return { status: response.status, body };
  }

  /**
   * Asks whether this key may write, without writing: one POST to a line that does not exist,
   * carrying a field that does not exist, so Priority can only refuse it. The words of the refusal
   * show whether it was the permission ("not allowed") or only the made-up data. Never throws.
   */
  async probeWrite(path: string): Promise<{ status: number | null; detail: string; ms: number }> {
    const started = Date.now();
    try {
      const response = await this.fetchImpl(this.url(path), {
        method: "POST",
        headers: {
          Authorization: this.authorization(),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ZZ_WRITE_CHECK_NOT_A_FIELD: "x" }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
      const body = await response.text().catch(() => "");
      return { status: response.status, detail: errorDetail(body), ms: Date.now() - started };
    } catch (error) {
      const reason = error instanceof Error ? error.name : "error";
      return { status: null, detail: `no answer (${reason})`, ms: Date.now() - started };
    }
  }

  /** One POST that adds a row. Throws OdataError with Priority's own words when it refuses. */
  async post(
    path: string,
    body: Record<string, unknown>,
  ): Promise<{ status: number; detail: string; raw: string }> {
    let response: Response;
    try {
      response = await this.fetchImpl(this.url(path), {
        method: "POST",
        headers: {
          Authorization: this.authorization(),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
    } catch (error) {
      const reason = error instanceof Error ? error.name : "error";
      throw new OdataError("UNAVAILABLE", null, `no answer (${reason})`);
    }
    const text = await response.text().catch(() => "");
    if (!response.ok) {
      throw new OdataError(codeForStatus(response.status), response.status, errorDetail(text));
    }
    return { status: response.status, detail: errorDetail(text), raw: text };
  }

  /** One GET of a text answer, such as Priority's description of its data ($metadata). */
  async getText(path: string): Promise<string> {
    return (await this.fetchBody(path, {}, "application/xml")).body;
  }

  /** One GET. Throws OdataError: UNAVAILABLE when Priority cannot be reached or is failing. */
  async get<T = unknown>(path: string, query: Record<string, string> = {}): Promise<T> {
    const response = await this.fetchBody(path, query, "application/json");
    const body = response.body;
    try {
      return JSON.parse(body) as T;
    } catch {
      // A page of HTML instead of data usually means a wrong address or a login page.
      throw new OdataError(
        "BAD_REQUEST",
        response.status,
        "the answer is not data (check the address)",
      );
    }
  }
}

export interface FormProbe {
  form: string;
  ok: boolean;
  status: number | null;
  /** The field names of the first row, in Priority's order. */
  fields: string[];
  /** The first row, each value cut short, to show what the data looks like. */
  sample: Record<string, string>;
  /** With an item number: the fields whose value differs between its first rows, with the values. */
  varying?: Record<string, string[]>;
  /** Priority's own words, or ours, when it did not work. */
  error: string | null;
  code: PriorityErrorCode | null;
  /** True when it was not asked at all, to protect the account after an earlier refusal. */
  skipped: boolean;
  ms: number;
}

const SAMPLE_VALUE = 60;

function show(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return text.length > SAMPLE_VALUE ? `${text.slice(0, SAMPLE_VALUE - 1)}…` : text;
}

/**
 * Asks Priority for one row of a form to learn which fields it really has, so the mapping is
 * checked against Priority and never guessed. Nothing is changed.
 */
export async function probeForm(
  http: OdataHttp,
  form: string,
  itemNumber?: string,
): Promise<FormProbe> {
  const started = performance.now();
  const done = (rest: Omit<FormProbe, "form" | "ms">): FormProbe => ({
    form,
    ms: Math.round(performance.now() - started),
    ...rest,
  });
  const [parent, subform] = form.split("/");
  if (!isFormName(parent) || (subform !== undefined && !isFormName(subform))) {
    return done({
      ok: false,
      status: null,
      fields: [],
      sample: {},
      error: "not a form name",
      code: null,
      skipped: false,
    });
  }
  try {
    // With an item number the row shown is that item's, so a real item can be looked at.
    const query: Record<string, string> = { $top: itemNumber ? "8" : "1" };
    if (itemNumber) query.$filter = `PARTNAME eq '${itemNumber}'`;
    // "FORM/SUBFORM" shows the first line of the sub-form of the first few records that have one.
    if (subform) {
      query.$top = "20";
      query.$expand = subform;
    }
    const data = await http.get<{ value?: Record<string, unknown>[] }>(parent, query);
    if (subform && Array.isArray(data.value)) {
      data.value = data.value.flatMap((record) => {
        const lines = record[subform];
        return Array.isArray(lines) && lines.length > 0
          ? [lines[0] as Record<string, unknown>]
          : [];
      });
    }
    const row = Array.isArray(data.value) ? data.value[0] : undefined;
    const fields = row ? Object.keys(row).filter((key) => !key.startsWith("@")) : [];
    const rows = Array.isArray(data.value) ? data.value : [];
    const varying: Record<string, string[]> = {};
    if (itemNumber && rows.length > 1) {
      for (const key of fields) {
        const values = rows.map((each) => show(each[key]));
        if (new Set(values).size > 1) varying[key] = values;
      }
    }
    return done({
      ok: true,
      status: 200,
      fields,
      sample: Object.fromEntries(fields.map((key) => [key, show(row?.[key])])),
      ...(itemNumber ? { varying } : {}),
      error: row ? null : "the form answered but has no rows",
      code: null,
      skipped: false,
    });
  } catch (error) {
    if (error instanceof OdataError) {
      return done({
        ok: false,
        status: error.status,
        fields: [],
        sample: {},
        error: error.detail || error.code,
        code: error.code,
        skipped: false,
      });
    }
    throw error;
  }
}

/** What the check shows for a form it left alone because Priority had just refused it. */
export function skippedProbe(form: string): FormProbe {
  return {
    form,
    ok: false,
    status: null,
    fields: [],
    sample: {},
    error: null,
    code: null,
    skipped: true,
    ms: 0,
  };
}

/** The sub-forms looked at when Priority's own list of them cannot be read. */
const LIKELY_ITEM_SUBFORMS = [
  "PARTTEXT_SUBFORM",
  "PARTTEXTLANG_SUBFORM",
  "PARTSPEC_SUBFORM",
  "PARTPACK_SUBFORM",
  "PARTARC_SUBFORM",
];
const MAX_SUBFORMS = 60;

/** The names of a form's sub-forms, from Priority's description of its data ($metadata). */
export function subformsIn(metadata: string, form: string): string[] {
  const start = metadata.search(new RegExp(String.raw`<EntityType\s+Name="${form}"`));
  if (start < 0) return [];
  const end = metadata.indexOf("</EntityType>", start);
  const block = metadata.slice(start, end < 0 ? undefined : end);
  return [...block.matchAll(/<NavigationProperty\s+Name="([A-Za-z0-9_]+)"/g)].map((m) => m[1]);
}

/** The texts in rows: every field that holds words, one entry per row and field. */
function textsOf(rows: Record<string, unknown>[]): Record<string, string> {
  const found: Record<string, string> = {};
  rows.slice(0, 5).forEach((row, index) => {
    for (const [key, value] of Object.entries(row)) {
      if (key.startsWith("@") || typeof value !== "string") continue;
      const text = value.trim();
      if (!/[A-Za-z\u0590-\u05FF]{2}/.test(text)) continue;
      const shown = text.length > 200 ? `${text.slice(0, 199)}…` : text;
      found[rows.length > 1 ? `${key} (${index + 1})` : key] = shown;
    }
  });
  return found;
}

/**
 * Looks through every sub-form of one item (LOGPART) for the words it holds, to find where a text
 * such as the storage text is kept. Reads only. Stops at the first refusal of the key.
 */
export async function findItemTexts(http: OdataHttp, itemNumber: string): Promise<FormProbe[]> {
  const probes: FormProbe[] = [];
  let subforms = LIKELY_ITEM_SUBFORMS;
  const listed = performance.now();
  try {
    const metadata = await http.getText("$metadata");
    const named = subformsIn(metadata, "LOGPART");
    if (named.length > 0) subforms = named.slice(0, MAX_SUBFORMS);
    probes.push({
      form: "LOGPART sub-forms",
      ok: true,
      status: 200,
      fields: ["SUBFORMS"],
      sample: { SUBFORMS: subforms.join(", ") },
      error: named.length > 0 ? null : "not listed by Priority; the usual ones are tried",
      code: null,
      skipped: false,
      ms: Math.round(performance.now() - listed),
    });
  } catch (error) {
    if (!(error instanceof OdataError)) throw error;
    if (error.code === "AUTH_FAILED" || error.code === "RATE_LIMITED") throw error;
  }

  const key = `LOGPART('${itemNumber}')`;
  for (const name of [key, ...subforms.map((sub) => `${key}/${sub}`)]) {
    const started = performance.now();
    try {
      const data = await http.get<{ value?: Record<string, unknown>[] } & Record<string, unknown>>(
        name,
        name === key ? {} : { $top: "5" },
      );
      const rows = Array.isArray(data.value) ? data.value : [data];
      const sample = textsOf(rows);
      const fields = Object.keys(sample);
      probes.push({
        form: name,
        ok: true,
        status: 200,
        fields,
        sample,
        error: fields.length > 0 ? null : "no text here",
        code: null,
        skipped: false,
        ms: Math.round(performance.now() - started),
      });
    } catch (error) {
      if (!(error instanceof OdataError)) throw error;
      if (error.code === "AUTH_FAILED" || error.code === "RATE_LIMITED") throw error;
      probes.push({
        form: name,
        ok: false,
        status: error.status,
        fields: [],
        sample: {},
        error: error.detail || error.code,
        code: error.code,
        skipped: false,
        ms: Math.round(performance.now() - started),
      });
    }
  }
  return probes;
}
