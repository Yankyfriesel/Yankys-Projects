import { logFor, type Actor } from "../activity-log";
import type { Db } from "../db/connection";
import { readSetting, writeSetting } from "../settings";
import { clearCooldown } from "./cooldown";
import { decryptSecret, encryptSecret } from "../settings/secret";

/**
 * How to reach Priority. The stand-in answers until the live connection is switched on; these
 * details are kept for it. Priority's access key (sent as the user name) and the password, if
 * there is one, are stored encrypted and are never sent back to the browser.
 */

export interface PriorityConnection {
  /** Address of Priority's API, for example https://erp.example.com/odata/Priority/tabula.ini/company */
  baseUrl: string;
  /** The access key (Priority's user name), encrypted; null when none was entered. */
  apiUserEnc: string | null;
  /** The password, encrypted; null when none was entered (access keys sign in without one). */
  passwordEnc: string | null;
  /** Older installations stored the user name as plain text; read only, replaced on the next save. */
  apiUser?: string;
}

const KEY = "priority.connection";

const EMPTY: PriorityConnection = { baseUrl: "", apiUserEnc: null, passwordEnc: null };

export async function getPriorityConnection(
  db: Db,
): Promise<PriorityConnection & { updatedAt: Date | null }> {
  const stored = await readSetting<Partial<PriorityConnection>>(db, KEY);
  return { ...EMPTY, ...stored?.value, updatedAt: stored?.updatedAt ?? null };
}

export class PriorityConnectionError extends Error {
  constructor(public readonly code: "INVALID_URL") {
    super(code);
    this.name = "PriorityConnectionError";
  }
}

export interface PriorityConnectionInput {
  baseUrl: string;
  /** undefined keeps the stored access key, "" removes it, anything else replaces it. */
  apiUser?: string;
  /** undefined keeps the stored password, "" removes it, anything else replaces it. */
  password?: string;
}

function replaceSecret(
  current: string | null,
  input: string | undefined,
  secret: string,
): string | null {
  if (input === undefined) return current;
  return input === "" ? null : encryptSecret(input, secret);
}

export async function savePriorityConnection(
  db: Db,
  input: PriorityConnectionInput,
  actor: Actor,
  secret: string,
): Promise<void> {
  const baseUrl = input.baseUrl.trim().replace(/\/+$/, "");
  if (baseUrl) {
    let parsed: URL;
    try {
      parsed = new URL(baseUrl);
    } catch {
      throw new PriorityConnectionError("INVALID_URL");
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new PriorityConnectionError("INVALID_URL");
    }
  }

  const current = await getPriorityConnection(db);
  const apiUser = input.apiUser?.trim();
  const apiUserEnc = replaceSecret(current.apiUserEnc, apiUser, secret);
  const passwordEnc = replaceSecret(current.passwordEnc, input.password, secret);

  const next: PriorityConnection = { baseUrl, apiUserEnc, passwordEnc };
  // An old plain user name stays usable until an access key replaces it or it is removed.
  if (current.apiUser && apiUser === undefined) next.apiUser = current.apiUser;
  await writeSetting(db, KEY, next, actor.id);
  // A different address or key deserves a fresh try: the rest after a refusal no longer applies.
  if (input.apiUser !== undefined || baseUrl !== current.baseUrl) await clearCooldown(db);
  await logFor(
    actor,
    "settings.priorityChanged",
    {
      entityType: "settings",
      entityId: KEY,
      // Never the key or the password themselves, only what changed.
      details: {
        baseUrl,
        keyChanged: input.apiUser !== undefined,
        passwordChanged: input.password !== undefined,
      },
    },
    db,
  );
}

/** What is needed to call Priority, in the clear; null when the address or the key is missing or unreadable. */
export interface PriorityCredentials {
  baseUrl: string;
  user: string;
  /** Null when none was stored: the live client then uses Priority's fixed word for access keys. */
  password: string | null;
}

export function readPriorityCredentials(
  connection: PriorityConnection,
  secret: string,
): PriorityCredentials | null {
  const user = connection.apiUserEnc
    ? decryptSecret(connection.apiUserEnc, secret)
    : (connection.apiUser ?? "") || null;
  if (!connection.baseUrl || !user) return null;
  const password = connection.passwordEnc ? decryptSecret(connection.passwordEnc, secret) : null;
  if (connection.passwordEnc && password === null) return null;
  return { baseUrl: connection.baseUrl, user, password };
}

/** For callers that only need the password. */
export function readPriorityPassword(
  connection: PriorityConnection,
  secret: string,
): string | null {
  return connection.passwordEnc ? decryptSecret(connection.passwordEnc, secret) : null;
}
