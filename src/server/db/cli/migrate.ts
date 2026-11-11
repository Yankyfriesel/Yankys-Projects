import { getDatabase } from "../index";

async function main() {
  const database = getDatabase();
  console.log(`Migrating ${database.kind} database at ${database.location}`);
  await database.migrate();
  console.log("Migrations applied.");
  await database.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
