/**
 * The sounds of a scan, made in the browser (no files): three kinds a person can tell apart
 * without looking at the screen.
 *   saved     - one short high beep: the box is recorded in the system.
 *   refused   - two lower beeps: the system read the scan but did not record it (already received,
 *               not a vendor barcode, unknown item...). The screen says why.
 *   unreached - one long low buzz: the scan did not get into the system at all (no connection).
 */
export type ScanSound = "saved" | "refused" | "unreached";

const STORAGE_KEY = "scanSound";

interface Tone {
  at: number;
  length: number;
  hz: number;
  wave: OscillatorType;
}

const TONES: Record<ScanSound, Tone[]> = {
  saved: [{ at: 0, length: 0.14, hz: 1318, wave: "sine" }],
  refused: [
    { at: 0, length: 0.16, hz: 560, wave: "square" },
    { at: 0.24, length: 0.16, hz: 560, wave: "square" },
  ],
  unreached: [{ at: 0, length: 0.7, hz: 170, wave: "sawtooth" }],
};

let context: AudioContext | null = null;

/** Opens the sound on the first key press or click, when the browser allows it. */
export function prepareSound(): void {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    context ??= new Ctor();
    if (context.state === "suspended") void context.resume();
  } catch {
    // No sound is not a reason to stop receiving.
  }
}

export function playScanSound(sound: ScanSound): void {
  try {
    prepareSound();
    if (!context) return;
    const start = context.currentTime + 0.02;
    for (const tone of TONES[sound]) {
      const oscillator = context.createOscillator();
      const volume = context.createGain();
      oscillator.type = tone.wave;
      oscillator.frequency.value = tone.hz;
      const from = start + tone.at;
      volume.gain.setValueAtTime(0.0001, from);
      volume.gain.exponentialRampToValueAtTime(0.3, from + 0.01);
      volume.gain.setValueAtTime(0.3, from + tone.length - 0.03);
      volume.gain.exponentialRampToValueAtTime(0.0001, from + tone.length);
      oscillator.connect(volume).connect(context.destination);
      oscillator.start(from);
      oscillator.stop(from + tone.length + 0.02);
    }
  } catch {
    // ignore
  }
}

/** Whether the person turned the scan sounds on (the default) or off on this computer. */
export function readSoundOn(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

const listeners = new Set<() => void>();

/** For useSyncExternalStore: tells the screen when the choice changes. */
export function subscribeSound(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export function saveSoundOn(on: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
  } catch {
    // ignore
  }
  for (const listener of listeners) listener();
}
