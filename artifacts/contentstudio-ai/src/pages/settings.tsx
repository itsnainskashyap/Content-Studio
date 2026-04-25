import { useEffect, useState } from "react";
import { toast } from "sonner";
import { storage, STYLES, type Settings } from "@/lib/storage";

const PART_DURATIONS = [5, 10, 15, 20];
const LANGS: Array<{ key: Settings["defaultLanguage"]; label: string }> = [
  { key: "english", label: "English" },
  { key: "hindi", label: "हिंदी" },
  { key: "hinglish", label: "Hinglish" },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(storage.getSettings());
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    setSettings(storage.getSettings());
  }, []);

  const update = (next: Partial<Settings>) => {
    const updated = { ...settings, ...next };
    setSettings(updated);
    storage.saveSettings(updated);
    toast.success("Settings saved");
  };

  const clearAll = () => {
    storage.clearAll();
    setSettings(storage.getSettings());
    setConfirmClear(false);
    window.dispatchEvent(new Event("cs:projects-changed"));
    toast.success("All data cleared");
  };

  return (
    <div className="px-4 py-8 md:px-12 md:py-14 max-w-3xl mx-auto">
      <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
        Preferences
      </div>
      <h1 className="mt-1 font-display text-4xl md:text-5xl tracking-tight">
        Settings
      </h1>

      <section className="mt-10 border border-border rounded-md p-5 bg-card">
        <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Default per-part duration
        </h2>
        <div className="mt-2 flex gap-2 flex-wrap">
          {PART_DURATIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => update({ defaultDuration: d })}
              className={`px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-widest border transition-colors ${
                settings.defaultDuration === d
                  ? "bg-primary text-black border-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`pref-duration-${d}`}
            >
              {d}s
            </button>
          ))}
        </div>
      </section>

      <section className="mt-6 border border-border rounded-md p-5 bg-card">
        <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Default style
        </h2>
        <select
          value={settings.defaultStyle}
          onChange={(e) => update({ defaultStyle: e.target.value })}
          className="mt-2 w-full bg-background border border-border rounded-md p-2 text-sm focus:outline-none focus:border-primary"
          data-testid="pref-style"
        >
          {STYLES.map((s) => (
            <option key={s.key} value={s.name}>
              {s.name}
            </option>
          ))}
        </select>
      </section>

      <section className="mt-6 border border-border rounded-md p-5 bg-card">
        <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Default voiceover language
        </h2>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {LANGS.map((l) => (
            <button
              key={l.key}
              type="button"
              onClick={() => update({ defaultLanguage: l.key })}
              className={`border rounded-md py-3 px-3 text-center transition-colors ${
                settings.defaultLanguage === l.key
                  ? "bg-primary text-black border-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`pref-lang-${l.key}`}
            >
              <div
                className="font-display text-lg"
                style={{
                  fontFamily:
                    l.key === "hindi"
                      ? "var(--app-font-devanagari, 'Noto Sans Devanagari', sans-serif)"
                      : undefined,
                }}
              >
                {l.label}
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="mt-6 border border-[#FF4444]/40 rounded-md p-5 bg-card">
        <h2 className="font-mono text-xs uppercase tracking-widest text-[#FF4444]">
          Danger zone
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Clear every saved project, setting, and current project pointer in
          this browser. This cannot be undone.
        </p>
        <button
          type="button"
          onClick={() => setConfirmClear(true)}
          className="mt-3 px-4 py-2 rounded-md border border-[#FF4444] text-[#FF4444] font-mono text-xs uppercase tracking-widest hover:bg-[#FF4444]/10"
          data-testid="button-clear-all"
        >
          Clear all data
        </button>
      </section>

      <section className="mt-10 text-center text-[11px] text-muted-foreground/70 font-mono">
        ContentStudio AI · v0.1.0
      </section>

      {confirmClear && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
          <div className="border border-border bg-card rounded-md p-6 max-w-md w-full">
            <div className="font-display text-2xl tracking-tight">
              Clear everything?
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              All projects and settings will be permanently removed from this
              browser.
            </p>
            <div className="mt-5 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="px-4 py-2 rounded-md border border-border font-mono text-xs uppercase tracking-widest"
                data-testid="button-cancel-clear"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={clearAll}
                className="px-4 py-2 rounded-md bg-[#FF4444] text-white font-mono text-xs uppercase tracking-widest hover:bg-[#FF6666]"
                data-testid="button-confirm-clear"
              >
                Clear all
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
