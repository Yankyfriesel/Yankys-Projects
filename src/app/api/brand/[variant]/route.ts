import { getOptionalUser } from "@/server/auth/session";
import {
  BrandError,
  getBrandImage,
  isBrandVariant,
  resetBrandImage,
  setBrandImage,
} from "@/server/brand";
import { db } from "@/server/db";
import { getAccess } from "@/server/permissions";

type Context = { params: Promise<{ variant: string }> };

/** Everyone may read the logo (the login page shows it); only the settings permission changes it. */
const EDIT_PERMISSION = "settings.labels.edit";

export async function GET(request: Request, { params }: Context) {
  const { variant } = await params;
  if (!isBrandVariant(variant)) return new Response(null, { status: 404 });

  const image = await getBrandImage(db, variant);
  const etag = `"${image.version}"`;
  const headers = {
    "Content-Type": image.mime,
    // Always ask again; a matching ETag answers with 304 and no body.
    "Cache-Control": "no-cache",
    ETag: etag,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'",
  };
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  return new Response(new Uint8Array(image.bytes), { headers });
}

async function authorize(): Promise<{ ok: true; actor: Awaited<ReturnType<typeof getAccess>>["actor"] } | { ok: false; response: Response }> {
  const current = await getOptionalUser();
  if (!current) return { ok: false, response: Response.json({ error: "UNAUTHENTICATED" }, { status: 401 }) };
  if (current.user.mustChangePassword) {
    return { ok: false, response: Response.json({ error: "NOT_ALLOWED" }, { status: 403 }) };
  }
  const access = await getAccess();
  if (!access.can(EDIT_PERMISSION)) {
    return { ok: false, response: Response.json({ error: "NOT_ALLOWED" }, { status: 403 }) };
  }
  return { ok: true, actor: access.actor };
}

export async function POST(request: Request, { params }: Context) {
  const { variant } = await params;
  if (!isBrandVariant(variant)) return new Response(null, { status: 404 });
  const auth = await authorize();
  if (!auth.ok) return auth.response;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "EMPTY" }, { status: 400 });

  try {
    await setBrandImage(db, variant, new Uint8Array(await file.arrayBuffer()), auth.actor);
  } catch (error) {
    if (error instanceof BrandError) {
      return Response.json({ error: error.code }, { status: error.code === "TOO_LARGE" ? 413 : 400 });
    }
    throw error;
  }
  return Response.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: Context) {
  const { variant } = await params;
  if (!isBrandVariant(variant)) return new Response(null, { status: 404 });
  const auth = await authorize();
  if (!auth.ok) return auth.response;
  await resetBrandImage(db, variant, auth.actor);
  return Response.json({ ok: true });
}
