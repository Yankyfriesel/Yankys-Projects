import { eq } from "drizzle-orm";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins";
import { logActivity } from "../activity-log";
import type { Db } from "../db/connection";
import { accounts, sessions, twoFactors, users, verifications } from "../db/schema";
import { clientIp, detectDeviceType } from "./device";
import { isLockedOut } from "./lockout";
import { hashPassword, PASSWORD_MIN_LENGTH, verifyPassword } from "./password";

const DAY = 60 * 60 * 24;

export interface CreateAuthOptions {
  db: Db;
  baseURL: string;
  secret: string;
  /** Google OAuth client; null hides Google sign-in. */
  google: { clientId: string; clientSecret: string } | null;
  /** Other addresses the app is opened from, for example a phone on the same network. */
  trustedOrigins?: string[];
}

/**
 * Better Auth configured for this system:
 * - email + password only for users the admin created (no sign-up of any kind);
 * - Google sign-in only for an email that already exists;
 * - disabled users cannot get a session;
 * - the device type is detected at login and stored on the session;
 * - every auth event is written to the activity log.
 */
export function createAuth({ db, baseURL, secret, google, trustedOrigins }: CreateAuthOptions) {
  return betterAuth({
    appName: "weighing",
    baseURL,
    secret,
    trustedOrigins,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: users,
        session: sessions,
        account: accounts,
        verification: verifications,
        twoFactor: twoFactors,
      },
    }),
    user: {
      additionalFields: {
        displayName: { type: "string", required: true, input: true },
        jobTitle: { type: "string", required: false, input: true, defaultValue: "" },
        locale: { type: "string", required: false, input: false, defaultValue: "he" },
        isOwner: { type: "boolean", required: false, input: false, defaultValue: false },
        isDisabled: { type: "boolean", required: false, input: false, defaultValue: false },
        mustChangePassword: { type: "boolean", required: false, input: false, defaultValue: true },
      },
    },
    session: {
      // A stolen session stops working after half a day, whatever the screen does.
      expiresIn: DAY / 2,
      updateAge: 60 * 60,
      additionalFields: {
        deviceType: { type: "string", required: false, input: false, defaultValue: "desktop" },
      },
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      password: {
        hash: hashPassword,
        verify: ({ hash, password }) => verifyPassword(hash, password),
      },
    },
    socialProviders: google
      ? {
          google: {
            clientId: google.clientId,
            clientSecret: google.clientSecret,
            disableSignUp: true,
            disableImplicitSignUp: true,
          },
        }
      : {},
    account: {
      // A Google login for an email the admin registered attaches to that user.
      accountLinking: { enabled: true, trustedProviders: ["google"] },
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 60,
      // The end-to-end tests sign in dozens of times a minute from one address.
      customRules: process.env.E2E_RELAXED_RATE_LIMIT
        ? {
            "/sign-in/email": { window: 60, max: 1000 },
            "/change-password": { window: 60, max: 1000 },
          }
        : {
            "/sign-in/email": { window: 60, max: 5 },
            "/change-password": { window: 60, max: 5 },
          },
    },
    databaseHooks: {
      user: {
        // Users are created only by an admin (src/server/auth/admin.ts), never by an auth flow.
        create: {
          before: async () => {
            throw new APIError("FORBIDDEN", {
              code: "SIGNUP_DISABLED",
              message: "Sign-up is disabled",
            });
          },
        },
      },
      session: {
        create: {
          before: async (session, ctx) => {
            const [user] = await db
              .select({ isDisabled: users.isDisabled, twoFactorEnabled: users.twoFactorEnabled })
              .from(users)
              .where(eq(users.id, session.userId))
              .limit(1);
            if (!user || user.isDisabled) {
              throw new APIError("FORBIDDEN", {
                code: "USER_DISABLED",
                message: "User is disabled",
              });
            }
            // A person with a code on their phone signs in with the password and the code only:
            // Google sign-in would skip the code.
            if (user.twoFactorEnabled && ctx?.path?.startsWith("/callback/")) {
              throw new APIError("FORBIDDEN", {
                code: "TWO_FACTOR_REQUIRED",
                message: "Sign in with your password and code",
              });
            }
            const userAgent =
              ctx?.headers?.get("user-agent") ?? ctx?.request?.headers.get("user-agent") ?? null;
            return { data: { ...session, deviceType: detectDeviceType(userAgent) } };
          },
        },
        delete: {
          after: async (session, ctx) => {
            if (ctx?.path !== "/sign-out") return;
            const [user] = await db
              .select({ displayName: users.displayName })
              .from(users)
              .where(eq(users.id, session.userId))
              .limit(1);
            await logActivity(
              {
                action: "auth.logout",
                userId: session.userId,
                userDisplay: user?.displayName ?? session.userId,
                deviceType: (session.deviceType as "desktop" | "phone" | undefined) ?? null,
                ip: clientIp(ctx?.headers),
              },
              db,
            );
          },
        },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-in/email" || process.env.E2E_RELAXED_RATE_LIMIT) return;
        const email = typeof ctx.body?.email === "string" ? ctx.body.email : "";
        if (email && (await isLockedOut(db, email))) {
          // Logged apart from a failed sign-in, so a blocked attempt does not extend the lock.
          await logActivity(
            {
              action: "auth.loginBlocked",
              userDisplay: email,
              deviceType: detectDeviceType(ctx.headers?.get("user-agent")),
              ip: clientIp(ctx.headers),
            },
            db,
          );
          throw new APIError("TOO_MANY_REQUESTS", {
            code: "ACCOUNT_LOCKED",
            message: "Too many wrong passwords. Try again later.",
          });
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        const ip = clientIp(ctx.headers);
        const returned = ctx.context.returned;
        const failed = returned instanceof APIError;

        if (ctx.path === "/sign-in/email") {
          const fresh = ctx.context.newSession;
          if (fresh) {
            await logActivity(
              {
                action: "auth.login",
                userId: fresh.user.id,
                userDisplay: String(fresh.user.displayName ?? fresh.user.name),
                deviceType: fresh.session.deviceType as "desktop" | "phone",
                ip,
                details: { method: "password" },
              },
              db,
            );
          } else if (failed) {
            const email = typeof ctx.body?.email === "string" ? ctx.body.email : "";
            await logActivity(
              {
                action: "auth.loginFailed",
                userDisplay: email || "unknown",
                deviceType: detectDeviceType(ctx.headers?.get("user-agent")),
                ip,
                details: { email, code: returned.body?.code ?? returned.status },
              },
              db,
            );
          }
          return;
        }

        if (
          ctx.path === "/two-factor/verify-totp" ||
          ctx.path === "/two-factor/verify-backup-code"
        ) {
          const setup = ctx.context.session;
          const fresh = ctx.context.newSession ?? setup;
          if (!failed && fresh) {
            await logActivity(
              {
                action:
                  setup && ctx.path === "/two-factor/verify-totp"
                    ? "auth.twoFactorEnabled"
                    : "auth.login",
                userId: fresh.user.id,
                userDisplay: String(fresh.user.displayName ?? fresh.user.name),
                deviceType: fresh.session.deviceType as "desktop" | "phone",
                ip,
                details: setup ? null : { method: "password+code" },
              },
              db,
            );
          } else if (failed) {
            await logActivity(
              {
                action: "auth.twoFactorFailed",
                userDisplay: "unknown",
                deviceType: detectDeviceType(ctx.headers?.get("user-agent")),
                ip,
                details: { code: returned.body?.code ?? returned.status },
              },
              db,
            );
          }
          return;
        }

        if (ctx.path === "/two-factor/disable" && !failed) {
          const current = ctx.context.session;
          if (!current) return;
          await logActivity(
            {
              action: "auth.twoFactorDisabled",
              userId: current.user.id,
              userDisplay: String(current.user.displayName ?? current.user.name),
              deviceType: current.session.deviceType as "desktop" | "phone",
              ip,
            },
            db,
          );
          return;
        }

        if (ctx.path.startsWith("/callback/")) {
          const fresh = ctx.context.newSession;
          if (fresh) {
            await logActivity(
              {
                action: "auth.login",
                userId: fresh.user.id,
                userDisplay: String(fresh.user.displayName ?? fresh.user.name),
                deviceType: fresh.session.deviceType as "desktop" | "phone",
                ip,
                details: { method: "google" },
              },
              db,
            );
          } else if (failed) {
            const location = new Headers(returned.headers ?? {}).get("location") ?? "";
            const code =
              new URL(location, baseURL).searchParams.get("error") ?? String(returned.status);
            await logActivity(
              {
                action: "auth.googleRefused",
                userDisplay: "unknown",
                deviceType: detectDeviceType(ctx.headers?.get("user-agent")),
                ip,
                details: { code },
              },
              db,
            );
          }
          return;
        }

        if (ctx.path === "/change-password" && !failed) {
          const current = ctx.context.session ?? ctx.context.newSession;
          if (!current) return;
          await db
            .update(users)
            .set({ mustChangePassword: false })
            .where(eq(users.id, current.user.id));
          await logActivity(
            {
              action: "auth.passwordChanged",
              userId: current.user.id,
              userDisplay: String(current.user.displayName ?? current.user.name),
              deviceType: current.session.deviceType as "desktop" | "phone",
              ip,
            },
            db,
          );
        }
      }),
    },
    plugins: [twoFactor({ issuer: "Northfield Foods - Factory" }), nextCookies()],
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = Auth["$Infer"]["Session"];
export type SessionUser = AuthSession["user"];
