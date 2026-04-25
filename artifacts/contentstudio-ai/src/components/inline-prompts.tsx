import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Sparkles,
  Check,
  Play,
  Star,
  ArrowDownToLine,
  Volume2,
  Music as MusicIcon,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useGenerateVideoPrompts } from "@workspace/api-client-react";
import {
  storage,
  type Project,
  type ProjectPart,
  type VoiceoverLanguage,
} from "@/lib/storage";
import { useApiCall, mutationCaller } from "@/lib/api-call";
import { ErrorCard } from "@/components/error-card";
import { CopyButton } from "@/components/copy-button";

const VO_TONES = [
  "energetic",
  "cinematic",
  "conversational",
  "motivational",
  "mysterious",
  "humorous",
];

const BGM_PRESETS: Array<{ name: string; tempo: string; instruments: string[] }> = [
  {
    name: "Cinematic Orchestral",
    tempo: "110 BPM",
    instruments: ["strings", "percussion", "piano"],
  },
  {
    name: "Driving Synthwave",
    tempo: "120 BPM",
    instruments: ["synths", "drum machine", "bass"],
  },
  {
    name: "Dark Ambient",
    tempo: "70 BPM",
    instruments: ["pads", "sub bass", "drones"],
  },
  {
    name: "Hip-Hop Trap",
    tempo: "140 BPM",
    instruments: ["808s", "hi-hats", "synths"],
  },
  {
    name: "Indie Folk",
    tempo: "100 BPM",
    instruments: ["acoustic guitar", "soft drums", "vocals"],
  },
  {
    name: "Lo-Fi Beats",
    tempo: "85 BPM",
    instruments: ["lo-fi piano", "vinyl crackle", "soft drums"],
  },
];

function suggestBgm(mood: string): { name: string; tempo: string; instruments: string[] } {
  const m = (mood || "").toLowerCase();
  if (/\b(dark|gothic|horror|dread|tense)\b/.test(m)) return BGM_PRESETS[2];
  if (/\b(cyber|neon|synth|tech|future)\b/.test(m)) return BGM_PRESETS[1];
  if (/\b(hip|trap|street|urban)\b/.test(m)) return BGM_PRESETS[3];
  if (/\b(folk|nostalg|warm|indie|gentle)\b/.test(m)) return BGM_PRESETS[4];
  if (/\b(chill|lo-?fi|melancholic|slow)\b/.test(m)) return BGM_PRESETS[5];
  return BGM_PRESETS[0];
}

interface Props {
  project: Project;
  style: string;
  partsCount: number;
  initialVoiceoverLanguage: VoiceoverLanguage;
  onProjectUpdated: (p: Project) => void;
}

export function InlinePrompts({
  project,
  style,
  partsCount,
  initialVoiceoverLanguage,
  onProjectUpdated,
}: Props) {
  const partDuration = 15;
  const [voLanguage, setVoLanguage] = useState<VoiceoverLanguage>(initialVoiceoverLanguage);
  const [voTone, setVoTone] = useState<string>("cinematic");
  const [voPanelOpen, setVoPanelOpen] = useState(false);
  const initialBgm = useMemo(
    () => suggestBgm(project.story?.mood ?? ""),
    [project.story?.mood],
  );
  const [bgm, setBgm] = useState<{
    name: string;
    tempo: string;
    instruments: string[];
  } | null>(initialBgm);
  const [bgmPanelOpen, setBgmPanelOpen] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [parts, setParts] = useState<ProjectPart[]>(
    project.parts.length > 0 ? project.parts : [],
  );
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generatePromptsMut = useGenerateVideoPrompts();
  const partCall = useApiCall(mutationCaller(generatePromptsMut.mutateAsync));

  // Reset stored parts if user changes critical inputs after generation
  useEffect(() => {
    if (!generating && parts.length > 0) {
      // keep parts as-is when user is just looking; only regen on explicit click
    }
  }, [generating, parts.length]);

  const startGeneration = async () => {
    if (!project.story) {
      toast.error("Save the story first");
      return;
    }
    setGenerating(true);
    setError(null);
    setParts([]);

    let previousLastFrame: string | undefined = undefined;
    const collected: ProjectPart[] = [];

    for (let i = 1; i <= partsCount; i++) {
      setProgress({ current: i, total: partsCount });
      const result = await partCall.run({
        story: project.story,
        style,
        duration: partDuration,
        part: i,
        totalParts: partsCount,
        previousLastFrame,
        voiceoverLanguage: voLanguage === "none" ? null : voLanguage,
        voiceoverTone: voLanguage === "none" ? null : voTone,
        bgmStyle: bgm?.name ?? null,
        bgmTempo: bgm?.tempo ?? null,
        bgmInstruments: bgm?.instruments ?? [],
      });
      if (!result) {
        setError(partCall.error ?? "Generation failed");
        setGenerating(false);
        setProgress(null);
        return;
      }
      const part: ProjectPart = {
        ...result,
        partNumber: i,
        voiceoverLanguage: voLanguage === "none" ? null : voLanguage,
        bgmStyle: bgm?.name ?? null,
        bgmTempo: bgm?.tempo ?? null,
      };
      collected.push(part);
      setParts([...collected]);
      previousLastFrame = result.lastFrameDescription;
    }

    const updated: Project = {
      ...project,
      style,
      duration: partDuration,
      partsCount,
      voiceoverLanguage: voLanguage,
      parts: collected,
    };
    const saved = storage.saveProject(updated);
    storage.setCurrentProjectId(saved.id);
    onProjectUpdated(saved);
    window.dispatchEvent(new Event("cs:projects-changed"));
    setGenerating(false);
    setProgress(null);
    toast.success(
      `Generated ${collected.length} part${collected.length === 1 ? "" : "s"}`,
    );
  };

  const downloadAll = () => {
    if (parts.length === 0) return;
    const lines: string[] = [];
    lines.push(`# ${project.title}`);
    if (project.story) {
      lines.push(``);
      lines.push(`## Story`);
      lines.push(project.story.synopsis);
    }
    lines.push(``);
    lines.push(`Style: ${style}`);
    lines.push(`Total parts: ${parts.length} × ${partDuration}s`);
    if (voLanguage !== "none") lines.push(`Voiceover: ${voLanguage}`);
    if (bgm) lines.push(`BGM: ${bgm.name} (${bgm.tempo})`);
    parts.forEach((p) => {
      lines.push(``);
      lines.push(`---`);
      lines.push(`# PART ${p.partNumber}`);
      lines.push(``);
      lines.push(p.copyablePrompt);
      lines.push(``);
      lines.push(`Last frame: ${p.lastFrameDescription}`);
    });
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.title.replace(/\s+/g, "_")}-prompts.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <section
      className="mt-12 border border-border rounded-md bg-card overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300"
      data-testid="inline-prompts-section"
    >
      <div className="px-6 py-4 border-b border-border bg-background/50 flex flex-wrap items-center gap-3">
        <div className="text-[10px] font-mono uppercase tracking-widest text-primary">
          Video Prompts
        </div>
        <span className="text-muted-foreground/40">·</span>
        <div className="font-mono text-xs uppercase tracking-widest text-foreground">
          {style}
        </div>
        <span className="text-muted-foreground/40">·</span>
        <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          {partsCount * partDuration}s · {partsCount} parts
        </div>
      </div>

      {/* Audio attachment */}
      <div className="px-6 py-5 border-b border-border space-y-4">
        {/* Voiceover row */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground w-24">
            Voiceover
          </div>
          {voLanguage !== "none" ? (
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-mono"
              data-testid="chip-voiceover"
            >
              <Volume2 className="w-3 h-3" />
              {voLanguage} · {voTone}
              <button
                type="button"
                onClick={() => setVoLanguage("none")}
                className="ml-1 opacity-60 hover:opacity-100"
                data-testid="button-vo-remove"
                aria-label="Remove voiceover"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setVoPanelOpen((v) => !v)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-border text-xs font-mono uppercase tracking-widest text-muted-foreground hover:border-primary hover:text-primary transition-colors"
              data-testid="button-vo-add"
            >
              + Add voiceover
            </button>
          )}
          {voLanguage !== "none" && (
            <button
              type="button"
              onClick={() => setVoPanelOpen((v) => !v)}
              className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-primary"
              data-testid="button-vo-change"
            >
              Change
            </button>
          )}
        </div>
        {voPanelOpen && (
          <div className="ml-0 md:ml-24 border border-border rounded-md p-3 bg-background space-y-3">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
                Language
              </div>
              <div className="flex gap-2 flex-wrap">
                {(["english", "hindi", "hinglish", "none"] as const).map(
                  (l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => {
                        setVoLanguage(l);
                        if (l === "none") setVoPanelOpen(false);
                      }}
                      className={`px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-widest border transition-colors ${
                        voLanguage === l
                          ? "bg-primary text-black border-primary"
                          : "border-border text-muted-foreground hover:border-foreground/30"
                      }`}
                      data-testid={`vo-lang-${l}`}
                    >
                      {l === "hindi" ? "हिंदी" : l}
                    </button>
                  ),
                )}
              </div>
            </div>
            {voLanguage !== "none" && (
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
                  Tone
                </div>
                <div className="flex gap-2 flex-wrap">
                  {VO_TONES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setVoTone(t)}
                      className={`px-3 py-1 rounded-md text-[10px] font-mono uppercase tracking-widest border transition-colors ${
                        voTone === t
                          ? "bg-primary text-black border-primary"
                          : "border-border text-muted-foreground hover:border-foreground/30"
                      }`}
                      data-testid={`vo-tone-${t}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* BGM row */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground w-24">
            BGM
          </div>
          {bgm ? (
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary/10 border border-primary/30 text-primary text-xs font-mono"
              data-testid="chip-bgm"
            >
              <MusicIcon className="w-3 h-3" />
              {bgm.name} · {bgm.tempo}
              <button
                type="button"
                onClick={() => setBgm(null)}
                className="ml-1 opacity-60 hover:opacity-100"
                data-testid="button-bgm-remove"
                aria-label="Remove BGM"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setBgm(initialBgm)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-border text-xs font-mono uppercase tracking-widest text-muted-foreground hover:border-primary hover:text-primary transition-colors"
              data-testid="button-bgm-add"
            >
              + Add BGM
            </button>
          )}
          <button
            type="button"
            onClick={() => setBgmPanelOpen((v) => !v)}
            className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-primary"
            data-testid="button-bgm-change"
          >
            Change BGM
          </button>
        </div>
        {bgmPanelOpen && (
          <div className="ml-0 md:ml-24 border border-border rounded-md p-3 bg-background">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
              Pick a style
            </div>
            <div className="flex gap-2 flex-wrap">
              {BGM_PRESETS.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => {
                    setBgm(p);
                    setBgmPanelOpen(false);
                  }}
                  className={`px-3 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-widest border transition-colors ${
                    bgm?.name === p.name
                      ? "bg-primary text-black border-primary"
                      : "border-border text-muted-foreground hover:border-foreground/30"
                  }`}
                  data-testid={`bgm-${p.name.replace(/\s+/g, "-")}`}
                >
                  {p.name} · {p.tempo}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Generate button */}
      <div className="px-6 py-5 border-b border-border flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={startGeneration}
          disabled={generating}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-md bg-primary text-black font-mono text-xs uppercase tracking-widest hover:bg-[#D4EB3A] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          data-testid="button-generate-prompts-inline"
        >
          {generating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Generating…
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" /> Generate {partsCount} prompt
              {partsCount === 1 ? "" : "s"}
            </>
          )}
        </button>
        {parts.length > 0 && !generating && (
          <button
            type="button"
            onClick={downloadAll}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-border font-mono text-xs uppercase tracking-widest hover:border-primary hover:text-primary transition-colors"
            data-testid="button-download-all-inline"
          >
            <ArrowDownToLine className="w-4 h-4" /> Download .txt
          </button>
        )}
      </div>

      {progress && (
        <div className="px-6 py-4 border-b border-border">
          <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
            Generating part {progress.current} of {progress.total}…
          </div>
          <div className="mt-2 h-1 bg-secondary/40 rounded">
            <div
              className="h-1 bg-primary rounded transition-all"
              style={{
                width: `${(progress.current / progress.total) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="px-6 py-4 border-b border-border">
          <ErrorCard message={error} onRetry={startGeneration} />
        </div>
      )}

      {parts.length > 0 && (
        <div className="px-6 py-6 space-y-6">
          {parts.map((p, idx) => (
            <PartCard
              key={p.partNumber}
              part={p}
              partsCount={parts.length}
              continuesFrom={idx > 0}
              style={style}
              voLanguage={voLanguage}
              bgmName={bgm?.name ?? null}
              bgmTempo={bgm?.tempo ?? null}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function PartCard({
  part,
  partsCount,
  continuesFrom,
  style,
  voLanguage,
  bgmName,
  bgmTempo,
}: {
  part: ProjectPart;
  partsCount: number;
  continuesFrom: boolean;
  style: string;
  voLanguage: VoiceoverLanguage;
  bgmName: string | null;
  bgmTempo: string | null;
}) {
  const [expandedShot, setExpandedShot] = useState<number | null>(null);
  const start = (part.partNumber - 1) * 15;
  const end = part.partNumber * 15;
  const fmt = (n: number) =>
    `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
  const signature = part.shots.find((s) => s.isSignature);
  return (
    <div
      className="border border-border rounded-md bg-background"
      data-testid={`part-card-${part.partNumber}`}
    >
      <div className="flex items-center justify-between p-5 border-b border-border flex-wrap gap-3">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-primary">
            Part {part.partNumber} / {partsCount} · {fmt(start)} – {fmt(end)} ·{" "}
            {style}
          </div>
          <div className="mt-1 font-display text-2xl tracking-tight">
            {part.shots.length} shots
          </div>
          {continuesFrom && (
            <div className="mt-1 text-[11px] font-mono text-muted-foreground">
              ↳ Continues from Part {part.partNumber - 1}
            </div>
          )}
          {signature && (
            <div className="mt-2 inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-black bg-primary px-2 py-0.5 rounded">
              <Star className="w-3 h-3" /> Signature: {signature.name}
            </div>
          )}
        </div>
        <CopyButton
          text={part.copyablePrompt}
          label="Copy full prompt"
          variant="accent"
          testId={`button-copy-part-${part.partNumber}`}
        />
      </div>

      <div className="p-5 space-y-5">
        {(voLanguage !== "none" || bgmName) && (
          <div className="flex flex-wrap gap-2">
            {voLanguage !== "none" && part.autoVoiceoverScript && (
              <div
                className="text-xs flex-1 min-w-[260px] px-3 py-2 rounded-md bg-emerald-500/5 border border-emerald-500/20"
                data-testid={`vo-block-${part.partNumber}`}
              >
                <div className="text-[10px] font-mono uppercase tracking-widest text-emerald-300/80 flex items-center gap-1">
                  <Volume2 className="w-3 h-3" /> Voiceover · {voLanguage}
                </div>
                <p
                  className={`mt-1 text-xs ${
                    voLanguage === "hindi" ? "font-devanagari" : ""
                  }`}
                >
                  "{part.autoVoiceoverScript}"
                </p>
              </div>
            )}
            {bgmName && (
              <div className="text-xs flex-1 min-w-[200px] px-3 py-2 rounded-md bg-primary/5 border border-primary/20">
                <div className="text-[10px] font-mono uppercase tracking-widest text-primary/80 flex items-center gap-1">
                  <MusicIcon className="w-3 h-3" /> BGM
                </div>
                <p className="mt-1 text-xs">
                  {bgmName} {bgmTempo ? `· ${bgmTempo}` : ""}
                </p>
              </div>
            )}
          </div>
        )}

        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
            Density Map
          </div>
          <div className="flex gap-1 h-3">
            {part.densityMap.map((d, i) => (
              <div
                key={i}
                title={`${d.timeRange} · ${d.density} · ${d.effects.join(", ")}`}
                className="flex-1 rounded-sm"
                style={{
                  background:
                    d.density === "HIGH"
                      ? "#FF4444"
                      : d.density === "MEDIUM"
                        ? "#E8FF47"
                        : "#4ADE80",
                }}
              />
            ))}
          </div>
        </div>

        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
            Shots
          </div>
          <ul className="space-y-2">
            {part.shots.map((s) => (
              <li
                key={s.shotNumber}
                className="border border-border rounded-md bg-card"
              >
                <button
                  type="button"
                  onClick={() =>
                    setExpandedShot((cur) =>
                      cur === s.shotNumber ? null : s.shotNumber,
                    )
                  }
                  className="w-full flex items-center justify-between gap-3 p-3 text-left"
                  data-testid={`inline-shot-${part.partNumber}-${s.shotNumber}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
                      #{s.shotNumber}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {s.timestamp}
                    </span>
                    <span className="font-display text-base tracking-tight truncate">
                      {s.name}
                    </span>
                    {s.isSignature && (
                      <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-black bg-primary px-1.5 py-0.5 rounded">
                        <Star className="w-3 h-3" /> Signature
                      </span>
                    )}
                  </div>
                  <Play
                    className={`w-4 h-4 text-muted-foreground transition-transform ${
                      expandedShot === s.shotNumber ? "rotate-90" : ""
                    }`}
                  />
                </button>
                {expandedShot === s.shotNumber && (
                  <div className="px-3 pb-3 pt-0 space-y-2 text-xs">
                    <p>{s.description}</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px]">
                      <Field label="Camera" value={s.cameraWork} />
                      <Field label="Speed" value={s.speed} />
                      <Field label="Transition" value={s.transition} />
                    </div>
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">
                        Effects
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {s.effects.map((e, i) => (
                          <span
                            key={i}
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-border"
                          >
                            {e}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="border-t border-border pt-4">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1">
            <Check className="w-3 h-3" /> Last frame (continuation)
          </div>
          <p className="text-xs text-muted-foreground italic">
            {part.lastFrameDescription}
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border rounded-md p-2">
      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="text-xs">{value}</div>
    </div>
  );
}
