"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { assertPermission, PermissionError } from "@/server/permissions";
import { getPriorityClient, PriorityError } from "@/server/priority";
import { isStandInMode, setStandInMode } from "@/server/priority/behaviour";
import {
  getCooldown,
  minutesLeft,
  startCooldown,
  startsCooldown,
} from "@/server/priority/cooldown";
import {
  findItemTexts,
  OdataError,
  OdataHttp,
  probeForm,
  skippedProbe,
  type FormProbe,
} from "@/server/priority/odata";
import {
  getPriorityConnection,
  PriorityConnectionError,
  readPriorityCredentials,
  savePriorityConnection,
} from "@/server/priority/settings";
import { postReceiptLine } from "@/server/priority/write";
import { appSecret } from "@/server/settings/secret";

export type SettingsErrorCode =
  "INVALID_URL" | "INVALID_INPUT" | "NOT_ALLOWED" | "UNAVAILABLE" | "GENERIC";

const connectionSchema = z.object({
  baseUrl: z.string().trim().max(300),
  /** The access key. Left out keeps the stored one; an empty string removes it. */
  apiUser: z.string().trim().max(200).optional(),
  /** Left out keeps the stored password; an empty string removes it. */
  password: z.string().max(200).optional(),
});

export async function savePriorityConnectionAction(
  input: z.input<typeof connectionSchema>,
): Promise<{ ok: true } | { ok: false; error: SettingsErrorCode }> {
  try {
    const access = await assertPermission("settings.priority.edit");
    const data = connectionSchema.parse(input);
    await savePriorityConnection(db, data, access.actor, appSecret());
    revalidatePath("/settings");
    return { ok: true };
  } catch (error) {
    if (error instanceof PriorityConnectionError) return { ok: false, error: error.code };
    if (error instanceof PermissionError) return { ok: false, error: "NOT_ALLOWED" };
    if (error instanceof z.ZodError) return { ok: false, error: "INVALID_INPUT" };
    console.error("[settings] saving the Priority connection failed", error);
    return { ok: false, error: "GENERIC" };
  }
}

export type ConnectionTest =
  | { ok: true; mode: "fake"; warehouses: number; ms: number }
  | { ok: false; error: SettingsErrorCode };

/** Asks the Priority client (the stand-in until phase 6) for the warehouses, to show that the path works. */
export async function testPriorityConnectionAction(): Promise<ConnectionTest> {
  try {
    await assertPermission("settings.priority.view");
    const started = performance.now();
    const warehouses = await getPriorityClient().getWarehouses();
    return {
      ok: true,
      mode: "fake",
      warehouses: warehouses.length,
      ms: Math.round(performance.now() - started),
    };
  } catch (error) {
    if (error instanceof PermissionError) return { ok: false, error: "NOT_ALLOWED" };
    if (error instanceof PriorityError && error.code === "UNAVAILABLE") {
      return { ok: false, error: "UNAVAILABLE" };
    }
    console.error("[settings] Priority connection test failed", error);
    return { ok: false, error: "GENERIC" };
  }
}

/** Switches the stand-in between normal, slow and down, to try the system when Priority misbehaves. */
export async function setStandInModeAction(
  mode: string,
): Promise<{ ok: true } | { ok: false; error: SettingsErrorCode }> {
  try {
    const access = await assertPermission("settings.priority.edit");
    if (!isStandInMode(mode)) return { ok: false, error: "INVALID_INPUT" };
    await setStandInMode(db, mode, access.actor);
    revalidatePath("/settings");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (error) {
    if (error instanceof PermissionError) return { ok: false, error: "NOT_ALLOWED" };
    console.error("[settings] changing the stand-in behaviour failed", error);
    return { ok: false, error: "GENERIC" };
  }
}

export type FormsCheck =
  | { ok: true; probes: FormProbe[] }
  /** Priority refused us a moment ago, so it is being left alone for this many minutes. */
  | { ok: false; error: "COOLDOWN"; minutes: number }
  | { ok: false; error: SettingsErrorCode | "NOT_CONFIGURED" };

export type FormsList =
  | { ok: true; forms: string[] }
  | { ok: false; error: "COOLDOWN"; minutes: number }
  | { ok: false; error: SettingsErrorCode | "NOT_CONFIGURED" | "REFUSED" };

/** Asks Priority once for the names of all the forms its API lets this key read. Reads only. */
export async function listPriorityFormsAction(): Promise<FormsList> {
  try {
    await assertPermission("settings.priority.view");
    const credentials = readPriorityCredentials(await getPriorityConnection(db), appSecret());
    if (!credentials) return { ok: false, error: "NOT_CONFIGURED" };
    const resting = await getCooldown(db);
    if (resting) return { ok: false, error: "COOLDOWN", minutes: minutesLeft(resting) };
    try {
      const data = await new OdataHttp(credentials).get<{ value?: { name?: string }[] }>("");
      const forms = (Array.isArray(data.value) ? data.value : [])
        .map((entry) => entry.name)
        .filter((name): name is string => typeof name === "string")
        .sort();
      return { ok: true, forms };
    } catch (error) {
      if (!(error instanceof OdataError)) throw error;
      if (startsCooldown(error.code)) await startCooldown(db, error.code);
      return { ok: false, error: "REFUSED" };
    }
  } catch (error) {
    if (error instanceof PermissionError) return { ok: false, error: "NOT_ALLOWED" };
    console.error("[settings] listing Priority's forms failed", error);
    return { ok: false, error: "GENERIC" };
  }
}

const MAX_FORMS = 12;

/**
 * Asks the real Priority (whatever mode the system is in) for one row of each form, to show which
 * forms and fields it has. Reads only: nothing is sent to Priority except a request for data.
 */
export async function checkPriorityFormsAction(
  forms: string[],
  itemNumber?: string,
): Promise<FormsCheck> {
  try {
    await assertPermission("settings.priority.view");
    const names = z.array(z.string().trim().max(60)).max(MAX_FORMS).parse(forms);
    // Letters, digits and a few signs only, since it is put into the question to Priority.
    const item = z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9._-]{1,40}$/)
      .optional()
      .parse(itemNumber || undefined);
    const credentials = readPriorityCredentials(await getPriorityConnection(db), appSecret());
    if (!credentials) return { ok: false, error: "NOT_CONFIGURED" };
    // After a refusal Priority is left alone for a while: a wrong key counts as a failed sign-in,
    // and a few of those lock the account.
    const resting = await getCooldown(db);
    if (resting) return { ok: false, error: "COOLDOWN", minutes: minutesLeft(resting) };

    const http = new OdataHttp(credentials);
    const probes: FormProbe[] = [];
    let refused = false;
    for (const name of [...new Set(names)]) {
      if (refused) {
        probes.push(skippedProbe(name));
        continue;
      }
      const probe = await probeForm(http, name, item);
      probes.push(probe);
      // The first "no" (wrong key, or a locked account) ends the check and starts the rest.
      if (startsCooldown(probe.code)) {
        refused = true;
        await startCooldown(db, probe.code);
      }
    }
    return { ok: true, probes };
  } catch (error) {
    if (error instanceof PermissionError) return { ok: false, error: "NOT_ALLOWED" };
    if (error instanceof z.ZodError) return { ok: false, error: "INVALID_INPUT" };
    console.error("[settings] checking Priority's forms failed", error);
    return { ok: false, error: "GENERIC" };
  }
}

/**
 * Looks through one item's screens in the real Priority for the texts they hold, to find where a
 * text such as the storage text is kept. Reads only.
 */
export async function findItemTextsAction(itemNumber: string): Promise<FormsCheck> {
  try {
    await assertPermission("settings.priority.view");
    const item = z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9._-]{1,40}$/)
      .parse(itemNumber);
    const credentials = readPriorityCredentials(await getPriorityConnection(db), appSecret());
    if (!credentials) return { ok: false, error: "NOT_CONFIGURED" };
    const resting = await getCooldown(db);
    if (resting) return { ok: false, error: "COOLDOWN", minutes: minutesLeft(resting) };
    try {
      return { ok: true, probes: await findItemTexts(new OdataHttp(credentials), item) };
    } catch (error) {
      if (error instanceof OdataError && startsCooldown(error.code)) {
        await startCooldown(db, error.code);
        const minutes = minutesLeft((await getCooldown(db))!);
        return { ok: false, error: "COOLDOWN", minutes };
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof PermissionError) return { ok: false, error: "NOT_ALLOWED" };
    if (error instanceof z.ZodError) return { ok: false, error: "INVALID_INPUT" };
    console.error("[settings] finding an item's texts failed", error);
    return { ok: false, error: "GENERIC" };
  }
}

export type WriteCheck =
  | { ok: true; status: number | null; detail: string; ms: number }
  | { ok: false; error: SettingsErrorCode | "NOT_CONFIGURED" };

/**
 * Asks Priority whether this key may write. Sends one request that cannot create anything (a line
 * of a made-up document with a made-up field) and reports Priority's answer. A refusal here does not
 * start the rest that follows a wrong key, since it only tells what the key may do.
 */
export async function checkPriorityWriteAction(): Promise<WriteCheck> {
  try {
    await assertPermission("settings.priority.view");
    const credentials = readPriorityCredentials(await getPriorityConnection(db), appSecret());
    if (!credentials) return { ok: false, error: "NOT_CONFIGURED" };
    const answer = await new OdataHttp(credentials).probeWrite(
      "DOCUMENTS_H(DOCNO='ZZ-WRITE-CHECK',TYPE='T')/TRANSORDER_H_SUBFORM",
    );
    return { ok: true, ...answer };
  } catch (error) {
    if (error instanceof PermissionError) return { ok: false, error: "NOT_ALLOWED" };
    console.error("[settings] the write check failed", error);
    return { ok: false, error: "GENERIC" };
  }
}

export type TestBox =
  | { ok: true; barcode: string }
  | { ok: false; error: SettingsErrorCode | "NOT_CONFIGURED" | "INVALID_INPUT"; words?: string };

/**
 * One deliberate test: adds a single small box line to a receipt document in Priority, to see that
 * writing works. Only by the owner's own press; shows Priority's own words if it refuses.
 */
export async function sendTestBoxAction(docno: string, itemNumber: string): Promise<TestBox> {
  try {
    const access = await assertPermission("settings.priority.edit");
    const data = z
      .object({
        docno: z
          .string()
          .trim()
          .regex(/^[A-Za-z0-9._-]{1,40}$/),
        item: z
          .string()
          .trim()
          .regex(/^[A-Za-z0-9._-]{1,40}$/),
      })
      .parse({ docno, item: itemNumber });
    const credentials = readPriorityCredentials(await getPriorityConnection(db), appSecret());
    if (!credentials) return { ok: false, error: "NOT_CONFIGURED" };
    const stamp = new Date().toISOString().replace(/\D/g, "").slice(2, 14);
    const barcode = `ZZTEST${stamp}`;
    const expiry = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
    try {
      await postReceiptLine(new OdataHttp(credentials), {
        source: "production",
        docno: data.docno,
        barcode,
        itemNumber: data.item,
        weightKg: 0.01,
        expiryDate: expiry,
        warehouseCode: "Main",
      });
    } catch (error) {
      const words = error instanceof OdataError ? error.detail : "";
      console.log(
        `[priority] test box refused: ${error instanceof Error ? error.message : error} ${words}`,
      );
      return { ok: false, error: "GENERIC", words };
    }
    console.log(`[priority] test box accepted: ${data.docno} ${data.item} ${barcode}`);
    void access;
    return { ok: true, barcode };
  } catch (error) {
    if (error instanceof PermissionError) return { ok: false, error: "NOT_ALLOWED" };
    if (error instanceof z.ZodError) return { ok: false, error: "INVALID_INPUT" };
    console.error("[settings] the test box failed", error);
    return { ok: false, error: "GENERIC" };
  }
}
