// The owner the seed creates in the throwaway test database (see playwright.config.ts).
export const E2E_OWNER = {
  email: "owner@e2e.test",
  password: "e2e-owner-password",
  name: "E2E Owner",
};

// The password the owner chooses in 02-accounts.spec.ts; later specs sign in with it.
export const OWNER_NEW_PASSWORD = "E2e-Fresh-Pass-Alpha-2026";

export const USER_NEW_PASSWORD = "E2e-Fresh-Pass-Bravo-2026";
