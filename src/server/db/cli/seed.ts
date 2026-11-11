import { getDatabase } from "../index";
import { prepareDatabase } from "../prepare";

async function main() {
  const database = getDatabase();
  console.log(`Seeding ${database.kind} database at ${database.location}`);
  const report = await prepareDatabase();
  console.log(
    report.ownerCreated
      ? `Owner created: ${process.env.SEED_OWNER_EMAIL || "owner@example.com"} (must change password on first login)`
      : "Owner already present.",
  );
  console.log(`Settings added: ${report.settingsAdded}`);
  console.log(
    report.standInSeeded
      ? `Stand-in seeded with ${report.boxes} boxes.`
      : "Stand-in already seeded.",
  );
  await database.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
