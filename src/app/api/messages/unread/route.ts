import { getOptionalUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { countNewMessages, latestNewMessage } from "@/server/messages";
import { getAccess } from "@/server/permissions";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * How many messages wait for an answer, and the newest one, for the notice an administrator
 * sees when a message arrives. Only people who may read the messages get an answer.
 */
export async function GET() {
  const current = await getOptionalUser();
  if (!current || current.user.mustChangePassword) {
    return Response.json({ count: 0 }, { status: 401, headers: NO_STORE });
  }
  const access = await getAccess();
  if (!(access.isOwner || access.can("admin.messages"))) {
    return Response.json({ count: 0 }, { status: 403, headers: NO_STORE });
  }
  const [count, latest] = await Promise.all([countNewMessages(db), latestNewMessage(db)]);
  return Response.json(
    {
      count,
      latest: latest
        ? { id: latest.id, from: latest.senderDisplay, kind: latest.kind, screen: latest.screen }
        : null,
    },
    { headers: NO_STORE },
  );
}
