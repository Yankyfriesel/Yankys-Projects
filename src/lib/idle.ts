/** Shared by every open tab of the system in this browser, so work in one tab keeps all of them. */
export const IDLE_STORAGE_KEY = "northfield.lastActivity";

export function readLastActivity(): number | null {
  try {
    const value = Number(window.localStorage.getItem(IDLE_STORAGE_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function writeLastActivity(at: number): void {
  try {
    window.localStorage.setItem(IDLE_STORAGE_KEY, String(at));
  } catch {
    // Without storage, only this tab's own activity counts.
  }
}
