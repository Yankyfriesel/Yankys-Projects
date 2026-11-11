import { inferAdditionalFields, twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { Auth } from "@/server/auth/create-auth";

export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<Auth>(), twoFactorClient()],
});
