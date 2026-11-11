import { beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../db/connection";
import { writeSetting } from "../settings";
import { seed } from "../db/seed";
import { getRoomOrder, inRoomOrder, RoomOrderError, setRoomOrder } from "./index";

let database: Database;
const actor = { id: null, display: "test" };

beforeAll(async () => {
  database = createDatabase({ url: null, pgliteDataDir: null });
  await database.migrate();
  await seed(database.db, { email: "boss@example.com", password: "Temp-1234", name: "Boss" });
}, 60_000);

describe("the order of the storage rooms", () => {
  it("is saved once per room and read back", async () => {
    expect(await getRoomOrder(database.db, "ann")).toEqual([]);
    await setRoomOrder(database.db, "ann", ["200", "Main", "200", " 100 "], actor);
    expect(await getRoomOrder(database.db, "ann")).toEqual(["200", "Main", "100"]);
    await expect(setRoomOrder(database.db, "ann", [], actor)).rejects.toBeInstanceOf(
      RoomOrderError,
    );
  });

  it("is each person's own: arranging the rooms changes nothing for anyone else", async () => {
    await setRoomOrder(database.db, "ann", ["300", "200"], actor);
    expect(await getRoomOrder(database.db, "bob")).toEqual([]);
    await setRoomOrder(database.db, "bob", ["Main", "100"], actor);
    expect(await getRoomOrder(database.db, "bob")).toEqual(["Main", "100"]);
    // Ann's order is still hers.
    expect(await getRoomOrder(database.db, "ann")).toEqual(["300", "200"]);
  });

  it("starts a person who has not arranged the rooms from the order saved before orders were personal", async () => {
    await writeSetting(database.db, "rooms.order", ["100", "Main"], null);
    expect(await getRoomOrder(database.db, "carol")).toEqual(["100", "Main"]);
    // Her own order, once she makes one, replaces it for her only.
    await setRoomOrder(database.db, "carol", ["Main"], actor);
    expect(await getRoomOrder(database.db, "carol")).toEqual(["Main"]);
    expect(await getRoomOrder(database.db, "dave")).toEqual(["100", "Main"]);
  });

  it("puts the rooms in the saved order and new rooms last", () => {
    const rooms = [{ code: "Main" }, { code: "100" }, { code: "300" }, { code: "200" }];
    expect(inRoomOrder(rooms, ["200", "Main"]).map((r) => r.code)).toEqual([
      "200",
      "Main",
      "100",
      "300",
    ]);
    expect(inRoomOrder(rooms, []).map((r) => r.code)).toEqual(["Main", "100", "300", "200"]);
  });
});
