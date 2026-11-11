import { parseArgs } from "node:util";
import { SYSTEM_ACTOR } from "../../activity-log";
import { createUser } from "../../auth/admin";
import { ALL_PERMISSIONS } from "../../permissions/registry";
import { getDatabase } from "../index";
import { prepareDatabase } from "../prepare";

/**
 * Creates a user from the command line (the administration screen does the
 * same in the app). Prints the temporary password once.
 *
 *   pnpm db:create-user -- --email worker@example.com --name "Worker One" \
 *     --display Worker --permissions device.desktop,receiving.view,receiving.scan
 *   pnpm db:create-user -- --list-permissions
 */
async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      name: { type: "string" },
      display: { type: "string" },
      job: { type: "string", default: "" },
      locale: { type: "string", default: "he" },
      permissions: { type: "string", default: "" },
      "list-permissions": { type: "boolean", default: false },
    },
  });

  if (values["list-permissions"]) {
    console.log(ALL_PERMISSIONS.join("\n"));
    return;
  }
  if (!values.email || !values.name) {
    console.error(
      "Usage: --email <email> --name <full name> [--display <name>] [--job <title>] [--locale he|en] [--permissions a,b,c]",
    );
    process.exit(2);
  }

  const database = getDatabase();
  try {
    await prepareDatabase();
    const { id, temporaryPassword } = await createUser(
      database.db,
      {
        email: values.email,
        name: values.name,
        displayName: values.display ?? values.name,
        jobTitle: values.job,
        locale: values.locale === "en" ? "en" : "he",
        permissions: values.permissions
          ? values.permissions
              .split(",")
              .map((p) => p.trim())
              .filter(Boolean)
          : [],
      },
      SYSTEM_ACTOR,
    );
    console.log(`Created user ${values.email} (${id})`);
    console.log(`Temporary password (shown once): ${temporaryPassword}`);
  } finally {
    await database.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
