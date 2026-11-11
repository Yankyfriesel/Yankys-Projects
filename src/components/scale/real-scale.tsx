"use client";

import { Plug, PlugZap, Unplug } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { BAUD_RATES, DEFAULT_BAUD_RATE, splitReadings, weightFromReading } from "@/lib/scale";

/** The parts of the browser's serial support (Chrome and Edge) the scale needs. */
interface SerialPortLike {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
}
interface SerialLike {
  getPorts(): Promise<SerialPortLike[]>;
  requestPort(): Promise<SerialPortLike>;
}

function serial(): SerialLike | null {
  if (typeof navigator === "undefined") return null;
  return (navigator as Navigator & { serial?: SerialLike }).serial ?? null;
}

/** What this computer remembers about its scale: kept in the browser, per computer. */
const SETTINGS_KEY = "northfield.scale";
interface ScaleSettings {
  /** Connect by itself when the receiving screen opens (after the first connection). */
  auto: boolean;
  baudRate: number;
  reversed: boolean;
}
const DEFAULTS: ScaleSettings = { auto: false, baudRate: DEFAULT_BAUD_RATE, reversed: true };

function readSettings(): ScaleSettings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") };
  } catch {
    return DEFAULTS;
  }
}
function writeSettings(settings: ScaleSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Not remembered; the scale still works for now.
  }
}

/** True when the scale was left connected on this computer, so the screen connects it again. */
export function scaleWasConnected(): boolean {
  return typeof window !== "undefined" && readSettings().auto;
}

const MAX_RAW = 300;

export type ScaleState = "off" | "connecting" | "on" | "error";

/**
 * The real scale: Connect takes it for this system (the first time Chrome asks which device it
 * is, once), Disconnect gives it back so the old program can use it. Each reading becomes the
 * weight text, the same as typing it on the simulated scale.
 */
export function RealScale({
  onWeight,
  onStateChange,
  controls = false,
  canConnect = false,
}: {
  onWeight: (text: string) => void;
  onStateChange: (state: ScaleState) => void;
  /** Show Connect / Disconnect and the setup: in the system settings. Elsewhere the scale only uses what was connected there. */
  controls?: boolean;
  /** Whether this person may connect and disconnect the scale. */
  canConnect?: boolean;
}) {
  const t = useTranslations("receiving.scale.real");
  const [state, setState] = useState<ScaleState>("off");
  const [problem, setProblem] = useState<string | null>(null);
  const [settings, setSettings] = useState<ScaleSettings>(DEFAULTS);
  const [raw, setRaw] = useState("");
  const port = useRef<SerialPortLike | null>(null);
  const reader = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const stopping = useRef(false);
  // Known only in the browser, so the server and the first browser render agree.
  const [supported, setSupported] = useState<boolean | null>(null);

  function change(next: ScaleState) {
    setState(next);
    onStateChange(next);
  }

  function updateSettings(patch: Partial<ScaleSettings>) {
    setSettings((current) => {
      const next = { ...current, ...patch };
      writeSettings(next);
      return next;
    });
  }

  async function readLoop(opened: SerialPortLike, current: ScaleSettings) {
    const decoder = new TextDecoder();
    let buffer = "";
    while (opened.readable && !stopping.current) {
      const r = opened.readable.getReader();
      reader.current = r;
      try {
        for (;;) {
          const { value, done } = await r.read();
          if (done) break;
          const text = decoder.decode(value, { stream: true });
          setRaw((old) => (old + text).slice(-MAX_RAW));
          const { readings, rest } = splitReadings(buffer + text);
          buffer = rest.slice(-100);
          const last = readings.at(-1);
          if (last !== undefined) {
            const kg = weightFromReading(last, current.reversed);
            if (kg !== null) onWeight(kg > 0 ? kg.toFixed(2) : "");
          }
        }
      } catch {
        // A break in the line: read again unless Disconnect was pressed.
      } finally {
        r.releaseLock();
      }
    }
  }

  async function connect(ask: boolean) {
    const api = serial();
    if (!api) return;
    setProblem(null);
    change("connecting");
    const current = readSettings();
    try {
      const known = await api.getPorts();
      const chosen = known[0] ?? (ask ? await api.requestPort() : null);
      if (!chosen) return change("off");
      // The screen just left may still be closing the port: when connecting by itself, try again.
      for (let attempt = 0; ; attempt++) {
        try {
          await chosen.open({ baudRate: current.baudRate });
          break;
        } catch (error) {
          const busy = error instanceof Error && error.name === "InvalidStateError";
          if (ask || !busy || attempt >= 4) throw error;
          await new Promise((resolve) => setTimeout(resolve, 400));
        }
      }
      port.current = chosen;
      stopping.current = false;
      updateSettings({ auto: true });
      change("on");
      void readLoop(chosen, current);
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      // Closing Chrome's list without choosing is not a problem.
      if (name === "NotFoundError") return change("off");
      setProblem(name === "InvalidStateError" || name === "NetworkError" ? t("busy") : t("failed"));
      change("error");
    }
  }

  async function disconnect() {
    stopping.current = true;
    updateSettings({ auto: false });
    try {
      await reader.current?.cancel();
    } catch {
      // Already stopped.
    }
    try {
      await port.current?.close();
    } catch {
      // Already closed.
    }
    port.current = null;
    onWeight("");
    change("off");
  }

  // The settings are read once the page is in the browser; a scale left connected connects again.
  useEffect(() => {
    const stored = readSettings();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser storage is only readable here
    setSettings(stored);
    setSupported(serial() !== null);
    if (stored.auto && serial()) void connect(false);
    return () => {
      stopping.current = true;
      void reader.current?.cancel().catch(() => undefined);
      void port.current?.close().catch(() => undefined);
    };
    // Once, when the screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (supported === null) return null;

  if (!supported) {
    return (
      <p
        data-testid="scale-unsupported"
        className="rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning"
      >
        {t("unsupported")}
      </p>
    );
  }

  return (
    <div className="space-y-3" data-testid="real-scale" data-state={state}>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-medium">
          {state === "on" ? (
            <PlugZap className="size-4 text-success" aria-hidden />
          ) : (
            <Unplug className="size-4 text-muted-foreground" aria-hidden />
          )}
          {t(`states.${state}`)}
        </span>
        {controls && canConnect ? (
          state === "on" ? (
            <Button variant="outline" size="sm" onClick={() => void disconnect()}>
              <Unplug data-icon="inline-start" />
              {t("disconnect")}
            </Button>
          ) : (
            <Button size="sm" disabled={state === "connecting"} onClick={() => void connect(true)}>
              <Plug data-icon="inline-start" />
              {t("connect")}
            </Button>
          )
        ) : null}
        {!controls && state !== "on" && state !== "connecting" ? (
          <Link href="/settings?section=hardware" className="text-sm text-primary underline">
            {t("manage")}
          </Link>
        ) : null}
      </div>
      {controls && !canConnect ? (
        <p className="text-sm text-muted-foreground">{t("notAllowed")}</p>
      ) : null}
      {problem ? (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      ) : null}

      {controls ? (
        <details className="rounded-xl border border-border px-4 py-2 text-sm">
          <summary className="cursor-pointer text-muted-foreground">{t("setup")}</summary>
          <div className="mt-3 space-y-3">
            <label className="flex items-center justify-between gap-3">
              {t("speed")}
              <select
                value={settings.baudRate}
                disabled={state === "on"}
                onChange={(event) => updateSettings({ baudRate: Number(event.target.value) })}
                className="h-9 rounded-lg border border-input bg-card px-2 text-sm"
                dir="ltr"
              >
                {BAUD_RATES.map((rate) => (
                  <option key={rate} value={rate}>
                    {rate}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center justify-between gap-3">
              {t("reversed")}
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={settings.reversed}
                disabled={state === "on"}
                onChange={(event) => updateSettings({ reversed: event.target.checked })}
              />
            </label>
            <div className="space-y-1">
              <p className="text-muted-foreground">{t("raw")}</p>
              <pre
                dir="ltr"
                data-testid="scale-raw"
                className="max-h-28 overflow-auto rounded-lg bg-muted px-3 py-2 font-mono text-xs break-all whitespace-pre-wrap"
              >
                {raw || "—"}
              </pre>
            </div>
          </div>
        </details>
      ) : null}
    </div>
  );
}
