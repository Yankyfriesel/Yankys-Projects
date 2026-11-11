import type { InventoryRow } from "@/lib/inventory";

/** The words the sheet's header row and status column use, in the language of the screen. */
export interface ExcelWords {
  sheet: string;
  columns: {
    itemNumber: string;
    item: string;
    category: string;
    warehouse: string;
    barcode: string;
    weight: string;
    slaughter: string;
    expiry: string;
    entered: string;
    status: string;
  };
  status: { valid: string; soon: string; expired: string };
}

/** "2026-10-22" as the Date it names (a calendar day, with no time of day). */
function day(iso: string): Date {
  const [year, month, date] = iso.split("-").map(Number);
  return new Date(year, month - 1, date);
}

/**
 * Writes the rows as an Excel file and offers it for saving. Weights are real numbers and
 * dates are real dates, so the sheet can be sorted and added up in Excel. The library is
 * loaded only when the button is pressed.
 */
export async function downloadInventoryExcel(
  rows: readonly InventoryRow[],
  words: ExcelWords,
  rightToLeft: boolean,
  fileName: string,
): Promise<void> {
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  const header = Object.values(words.columns).map((value) => ({
    value,
    fontWeight: "bold" as const,
    backgroundColor: "#f4ede0",
  }));
  const date = (iso: string | null) =>
    iso === null ? { value: "" } : { value: day(iso), type: Date, format: "dd/mm/yyyy" };

  const data = [
    header,
    ...rows.map((row) => [
      { value: row.itemNumber },
      { value: row.itemName },
      { value: row.category },
      { value: row.warehouseName },
      { value: row.barcode },
      { value: row.weightKg, type: Number, format: "0.00" },
      date(row.slaughterDate),
      date(row.expiryDate),
      date(row.enteredDate),
      {
        value: words.status[row.status],
        textColor:
          row.status === "expired" ? "#b3261e" : row.status === "soon" ? "#a8620a" : undefined,
      },
    ]),
  ];

  await writeExcelFile(data, {
    sheet: words.sheet,
    rightToLeft,
    stickyRowsCount: 1,
    columns: [
      { width: 14 },
      { width: 32 },
      { width: 18 },
      { width: 20 },
      { width: 28 },
      { width: 10 },
      { width: 14 },
      { width: 14 },
      { width: 14 },
      { width: 14 },
    ],
  }).toFile(fileName);
}
