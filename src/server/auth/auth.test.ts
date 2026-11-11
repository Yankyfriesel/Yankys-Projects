import { createHmac } from "node:crypto";
import { count, eq } from "drizzle-orm";
import { APIError } from "better-auth/api";
import { beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../db/connection";
import { accounts, activityLog, sessions, users } from "../db/schema";
import { seed } from "../db/seed";
import { createUser, resetTwoFactor, resetUserPassword, setUserDisabled } from "./admin";
import { createAuth, type Auth } from "./create-auth";
import { detectDeviceType } from "./device";
import { hashPassword } from "./password";

const OWNER = { email: "boss@example.com", password: "Temp-1234", name: "Boss" };
const PHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36";

let database: Database;
let auth: Auth;
const systemActor = { id: null, display: "test" };

beforeAll(async () => {
  database = createDatabase({ url: null, pgliteDataDir: null });
  await database.migrate();
  await seed(database.db, OWNER);
  auth = createAuth({
    db: database.db,
    baseURL: "http://localhost:3000",
    secret: "test-secret-that-is-long-enough-1234567890",
    google: null,
  });
}, 60_000);

// No explicit close: see db.test.ts.

async function signIn(email: string, password: string, userAgent = DESKTOP_UA) {
  return auth.api.signInEmail({
    body: { email, password },
    headers: new Headers({ "user-agent": userAgent }),
    returnHeaders: true,
  });
}

async function expectApiError(promise: Promise<unknown>, code?: string) {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(APIError);
    if (code) expect((error as APIError).body?.code).toBe(code);
    return error as APIError;
  }
  throw new Error("expected an APIError");
}

function cookieHeader(responseHeaders: Headers): Headers {
  const setCookie = responseHeaders.get("set-cookie") ?? "";
  const cookie = setCookie
    .split(/,(?=[^;]+?=)/)
    .map((c) => c.split(";")[0].trim())
    .join("; ");
  return new Headers({ cookie });
}

describe("device type", () => {
  it("classifies phones and tablets as phone, everything else as desktop", () => {
    expect(detectDeviceType(PHONE_UA)).toBe("phone");
    expect(detectDeviceType("Mozilla/5.0 (Linux; Android 14; SM-X910) Safari/537.36")).toBe(
      "phone",
    );
    expect(detectDeviceType(DESKTOP_UA)).toBe("desktop");
    expect(detectDeviceType(null)).toBe("desktop");
  });
});

describe("password login", () => {
  it("signs the seeded owner in and stores the device type on the session", async () => {
    const { response } = await signIn(OWNER.email, OWNER.password, PHONE_UA);
    expect(response.user.email).toBe(OWNER.email);
    expect(response.user.mustChangePassword).toBe(true);

    const [session] = await database.db
      .select()
      .from(sessions)
      .where(eq(sessions.token, response.token));
    expect(session.deviceType).toBe("phone");
    expect(session.expiresAt.getTime() - Date.now()).toBeGreaterThan(11 * 60 * 60 * 1000);
  });

  it("rejects a wrong password and logs the failure", async () => {
    await expectApiError(signIn(OWNER.email, "wrong-password"), "INVALID_EMAIL_OR_PASSWORD");
    await expectApiError(signIn("nobody@example.com", "whatever"));

    const failures = await database.db
      .select()
      .from(activityLog)
      .where(eq(activityLog.action, "auth.loginFailed"));
    expect(failures.length).toBeGreaterThanOrEqual(2);
    expect(failures[0].details).toMatchObject({ email: OWNER.email });
    expect(failures[0].userId).toBeNull();
  });

  it("locks an email after five wrong passwords, whatever the sixth is", async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      await expectApiError(signIn("worker2@example.com", "wrong-password"));
    }
    await expectApiError(signIn("Worker2@example.com", "wrong-password"), "ACCOUNT_LOCKED");
    const blocked = await database.db
      .select()
      .from(activityLog)
      .where(eq(activityLog.action, "auth.loginBlocked"));
    expect(blocked.length).toBe(1);
  });

  it("logs successful logins with user and device", async () => {
    const logins = await database.db
      .select()
      .from(activityLog)
      .where(eq(activityLog.action, "auth.login"));
    expect(logins.length).toBeGreaterThanOrEqual(1);
    expect(logins[0].userDisplay).toBe(OWNER.name);
    expect(logins[0].deviceType).toBe("phone");
  });

  it("refuses sign-up through the auth API", async () => {
    await expectApiError(
      auth.api.signUpEmail({
        body: { email: "new@example.com", password: "Password-1", name: "New", displayName: "New" },
      }),
    );
    const [{ value }] = await database.db
      .select({ value: count() })
      .from(users)
      .where(eq(users.email, "new@example.com"));
    expect(value).toBe(0);
  });
});

describe("admin: create, reset, disable", () => {
  let workerId: string;
  let temporaryPassword: string;

  it("creates a user with a temporary password that works once changed", async () => {
    const created = await createUser(
      database.db,
      {
        email: "Worker@Example.com",
        name: "Worker One",
        displayName: "Worker",
        permissions: ["dashboard.view", "dashboard.view"],
      },
      systemActor,
    );
    workerId = created.id;
    temporaryPassword = created.temporaryPassword;
    expect(temporaryPassword).toMatch(/^[A-Za-z0-9]{10}$/);

    const { response } = await signIn("worker@example.com", temporaryPassword);
    expect(response.user.mustChangePassword).toBe(true);
  });

  it("changing the password clears the must-change flag and revokes other sessions", async () => {
    const first = await signIn("worker@example.com", temporaryPassword, PHONE_UA);
    const second = await signIn("worker@example.com", temporaryPassword, DESKTOP_UA);

    await auth.api.changePassword({
      body: {
        currentPassword: temporaryPassword,
        newPassword: "Brand-New-Pass-1",
        revokeOtherSessions: true,
      },
      headers: cookieHeader(second.headers),
    });

    const [user] = await database.db.select().from(users).where(eq(users.id, workerId));
    expect(user.mustChangePassword).toBe(false);

    const remaining = await database.db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, workerId));
    expect(remaining.map((s) => s.token)).not.toContain(first.response.token);
    expect(remaining).toHaveLength(1);

    await expectApiError(
      signIn("worker@example.com", temporaryPassword),
      "INVALID_EMAIL_OR_PASSWORD",
    );
    const again = await signIn("worker@example.com", "Brand-New-Pass-1");
    expect(again.response.user.mustChangePassword).toBe(false);
  });

  it("reset gives a new temporary password and logs the user out everywhere", async () => {
    const { temporaryPassword: fresh } = await resetUserPassword(
      database.db,
      workerId,
      systemActor,
    );
    expect(fresh).not.toBe(temporaryPassword);

    const remaining = await database.db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, workerId));
    expect(remaining).toHaveLength(0);

    await expectApiError(
      signIn("worker@example.com", "Brand-New-Pass-1"),
      "INVALID_EMAIL_OR_PASSWORD",
    );
    const { response } = await signIn("worker@example.com", fresh);
    expect(response.user.mustChangePassword).toBe(true);
    temporaryPassword = fresh;
  });

  it("a disabled user cannot sign in and loses existing sessions", async () => {
    await setUserDisabled(database.db, workerId, true, systemActor);
    const remaining = await database.db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, workerId));
    expect(remaining).toHaveLength(0);
    await expectApiError(signIn("worker@example.com", temporaryPassword), "USER_DISABLED");

    await setUserDisabled(database.db, workerId, false, systemActor);
    const { response } = await signIn("worker@example.com", temporaryPassword);
    expect(response.user.email).toBe("worker@example.com");
  });

  it("refuses to disable the owner", async () => {
    const [owner] = await database.db.select().from(users).where(eq(users.isOwner, true));
    await expect(setUserDisabled(database.db, owner.id, true, systemActor)).rejects.toMatchObject({
      code: "OWNER_PROTECTED",
    });
  });

  it("wrote admin actions to the activity log", async () => {
    const actions = (
      await database.db.select({ action: activityLog.action }).from(activityLog)
    ).map((r) => r.action);
    for (const expected of [
      "admin.userCreated",
      "admin.passwordReset",
      "admin.userDisabled",
      "admin.userEnabled",
      "auth.passwordChanged",
    ]) {
      expect(actions).toContain(expected);
    }
  });
});

/** The 6-digit code an authenticator app shows now, from the base32 secret in the setup link. */
function totpNow(base32: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of base32.toUpperCase().replace(/=+$/, "")) {
    bits += alphabet.indexOf(char).toString(2).padStart(5, "0");
  }
  const bytes = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const hmac = createHmac("sha1", bytes).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const value = hmac.readUInt32BE(offset) & 0x7fffffff;
  return String(value % 1_000_000).padStart(6, "0");
}

describe("two-step verification", () => {
  const email = "dana2@example.com";
  const password = "Dana-Long-Pass-77";
  let userId: string;
  let secret: string;
  let backupCodes: string[];

  it("is set up with the password, then proved with one code", async () => {
    const created = await createUser(
      database.db,
      { email, name: "Dana Two", displayName: "Dana", permissions: ["dashboard.view"] },
      systemActor,
    );
    userId = created.id;
    await database.db.update(users).set({ mustChangePassword: false }).where(eq(users.id, userId));
    await database.db
      .update(accounts)
      .set({ password: await hashPassword(password) })
      .where(eq(accounts.userId, userId));

    const first = await signIn(email, password);
    const headers = cookieHeader(first.headers);
    const enabled = await auth.api.enableTwoFactor({ body: { password }, headers });
    if (enabled.method !== "totp") throw new Error("expected an authenticator setup");
    secret = new URL(enabled.totpURI).searchParams.get("secret")!;
    backupCodes = enabled.backupCodes;
    expect(backupCodes.length).toBeGreaterThan(5);

    // Not on until a correct code was typed.
    let [row] = await database.db.select().from(users).where(eq(users.id, userId));
    expect(row.twoFactorEnabled).toBe(false);
    await auth.api.verifyTOTP({ body: { code: totpNow(secret) }, headers });
    [row] = await database.db.select().from(users).where(eq(users.id, userId));
    expect(row.twoFactorEnabled).toBe(true);
  });

  it("asks for the code after the password and gives no session without it", async () => {
    const attempt = await auth.api.signInEmail({
      body: { email, password },
      headers: new Headers({ "user-agent": DESKTOP_UA }),
      returnHeaders: true,
    });
    expect(attempt.response).toMatchObject({ twoFactorRedirect: true });
    const half = cookieHeader(attempt.headers);

    await expectApiError(auth.api.verifyTOTP({ body: { code: "000000" }, headers: half }));

    const done = await auth.api.verifyTOTP({
      body: { code: totpNow(secret) },
      headers: half,
      returnHeaders: true,
    });
    expect(done.response.user.email).toBe(email);
    const session = await auth.api.getSession({ headers: cookieHeader(done.headers) });
    expect(session?.user.id).toBe(userId);
  });

  it("accepts a backup code once", async () => {
    const attempt = await auth.api.signInEmail({
      body: { email, password },
      headers: new Headers({ "user-agent": DESKTOP_UA }),
      returnHeaders: true,
    });
    const half = cookieHeader(attempt.headers);
    await auth.api.verifyBackupCode({ body: { code: backupCodes[0] }, headers: half });

    const again = await auth.api.signInEmail({
      body: { email, password },
      headers: new Headers({ "user-agent": DESKTOP_UA }),
      returnHeaders: true,
    });
    await expectApiError(
      auth.api.verifyBackupCode({
        body: { code: backupCodes[0] },
        headers: cookieHeader(again.headers),
      }),
    );
  });

  it("an admin reset turns it off and signs the user out everywhere", async () => {
    await resetTwoFactor(database.db, userId, systemActor);
    const [row] = await database.db.select().from(users).where(eq(users.id, userId));
    expect(row.twoFactorEnabled).toBe(false);
    const left = await database.db.select().from(sessions).where(eq(sessions.userId, userId));
    expect(left).toHaveLength(0);
    const { response } = await signIn(email, password);
    expect(response.user.email).toBe(email);
  });
});
