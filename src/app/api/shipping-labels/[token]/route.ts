import { parseOrderPayload } from "@/lib/labels/shipping";
import { db } from "@/server/db";
import { receiveOrder, tokenMatches } from "@/server/shipping-labels";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ token: string }> };

const MAX_BODY_BYTES = 200_000;
const NO_STORE = { "Cache-Control": "no-store" };

/** Turns the body Priority sent into plain data: JSON, or form fields (name=value&name=value). */
function readBody(text: string, contentType: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return {};
  const looksJson = trimmed.startsWith("{") || trimmed.startsWith("[");
  if (contentType.includes("json") || looksJson) {
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      if (contentType.includes("json")) return null;
    }
  }
  return Object.fromEntries(new URLSearchParams(trimmed));
}

/**
 * The address Priority calls once an order is picked and confirmed there. The secret in the
 * address is the only key, so no sign-in is needed. The details may come as JSON, as form fields
 * or in the address line itself (?ordname=...), under the names listed in the settings.
 */
async function handle(request: Request, { params }: Context): Promise<Response> {
  const { token } = await params;
  // Do not tell a stranger whether the address exists.
  if (!(await tokenMatches(db, token)))
    return new Response(null, { status: 404, headers: NO_STORE });

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) {
    return Response.json({ ok: false, error: "TOO_LARGE" }, { status: 413, headers: NO_STORE });
  }

  let body: unknown = {};
  if (request.method !== "GET") {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) {
      return Response.json({ ok: false, error: "TOO_LARGE" }, { status: 413, headers: NO_STORE });
    }
    body = readBody(text, request.headers.get("content-type") ?? "");
    if (body === null) {
      return Response.json({ ok: false, error: "BAD_JSON" }, { status: 400, headers: NO_STORE });
    }
  }
  const query = Object.fromEntries(new URL(request.url).searchParams);
  const received = { ...query, body };

  const parsed = parseOrderPayload(received);
  if (!parsed.ok) {
    return Response.json(
      {
        ok: false,
        error: "NO_ORDER_NUMBER",
        message: "The order number is missing. Send it as ordname, orderNumber, orderNo or docno.",
      },
      { status: 422, headers: NO_STORE },
    );
  }

  const saved = await receiveOrder(db, parsed.order, received);
  return Response.json(
    { ok: true, order: parsed.order.orderNumber, updated: saved.updated },
    { headers: NO_STORE },
  );
}

export const POST = handle;
export const PUT = handle;
export const GET = handle;
