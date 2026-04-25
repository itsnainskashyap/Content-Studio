import { useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  Play,
  Diamond,
  ArrowDownToLine,
  Volume2,
  Music as MusicIcon,
  X,
  StopCircle,
  ClipboardCopy,
  Check,
  Pencil,
  ChevronDown,
  ChevronUp,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { editVideoPrompts } from "@workspace/api-client-react";
import { buildPreviousPartDigests } from "@/lib/part-digest";
import {
  storage,
  type Project,
  type ProjectPart,
  type VoiceoverLanguage,
} from "@/lib/storage";
import { useGeneration } from "@/lib/use-generation";
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
  /**
   * When true, automatically kick off generation once after mount if no job
   * exists yet for this project and no parts have been generated. Used by the
   * Story Builder's "Finalize" → generate flow.
   */
  autoStart?: boolean;
}

export function InlinePrompts({
  project,
  style,
  partsCount,
  initialVoiceoverLanguage,
  onProjectUpdated,
  autoStart = false,
}: Props) {
  const partDuration = 15;
  const generation = useGeneration();
  const job = generation.getJob(project.id);

  const [voLanguage, setVoLanguage] = useState<VoiceoverLanguage>(
    job?.config.voiceoverLanguage ?? initialVoiceoverLanguage,
  );
  const [voTone, setVoTone] = useState<string>(
    job?.config.voiceoverTone ?? "cinematic",
  );
  const [voPanelOpen, setVoPanelOpen] = useState(false);
  const initialBgm = useMemo(
    () => suggestBgm(project.story?.mood ?? ""),
    [project.story?.mood],
  );
  const [bgm, setBgm] = useState<{
    name: string;
    tempo: string;
    instruments: string[];
  } | null>(job?.config.bgm ?? initialBgm);
  const [bgmPanelOpen, setBgmPanelOpen] = useState(false);

  // Mirror finished parts back into local project state on every part completion
  useEffect(() => {
    if (!job) return;
    if (job.parts.length > 0 && job.parts.length !== project.parts.length) {
      const fresh = storage.getProject(project.id);
      if (fresh) onProjectUpdated(fresh);
    }
    if (job.status === "awaiting_next" && job.parts.length > 0) {
      toast.success(
        `Part ${job.parts.length} ready · click "Generate next prompt" for part ${job.parts.length + 1}`,
      );
    }
    if (job.status === "done") {
      toast.success(
        `All ${job.parts.length} parts generated`,
      );
      const fresh = storage.getProject(project.id);
      if (fresh) onProjectUpdated(fresh);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status, job?.parts.length]);

  const generating = job?.status === "running";
  const awaitingNext = job?.status === "awaiting_next";
  const parts: ProjectPart[] = job?.parts && job.parts.length > 0
    ? job.parts
    : project.parts;
  const nextPartNumber = (job?.current ?? parts.length) + 1;
  const totalParts = job?.total ?? partsCount;
  const allDone = job?.status === "done" || (parts.length >= totalParts && parts.length > 0);

  const startGeneration = () => {
    if (!project.story) {
      toast.error("Save the story first");
      return;
    }
    generation.startGeneration({
      projectId: project.id,
      story: project.story,
      style,
      partsCount,
      partDuration,
      voiceoverLanguage: voLanguage,
      voiceoverTone: voTone,
      bgm,
    });
  };

  const generateNext = () => {
    generation.generateNextPart(project.id);
  };

  // Auto-start generation once when the panel mounts due to "Finalize" — only
  // if there's no existing job for this project AND no parts already saved.
  // Guarded by a ref so re-renders don't re-trigger.
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (!autoStart) return;
    if (autoStartedRef.current) return;
    if (job) return;
    if (project.parts.length > 0) return;
    if (!project.story) return;
    autoStartedRef.current = true;
    startGeneration();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, project.id]);

  const cancelGeneration = () => {
    generation.cancel(project.id);
    toast.message("Generation stopped");
  };

  const buildAllPartsText = (): string => {
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
    return lines.join("\n");
  };

  const downloadAll = () => {
    if (parts.length === 0) return;
    const blob = new Blob([buildAllPartsText()], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.title.replace(/\s+/g, "_")}-prompts.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const [copyAllState, setCopyAllState] = useState<"idle" | "copied" | "error">(
    "idle",
  );
  const copyAllParts = async () => {
    if (parts.length === 0) return;
    const text = buildAllPartsText();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopyAllState("copied");
      toast.success(`Copied all ${parts.length} parts to clipboard`);
      window.setTimeout(() => setCopyAllState("idle"), 2200);
    } catch {
      setCopyAllState("error");
      toast.error("Could not copy to clipboard");
      window.setTimeout(() => setCopyAllState("idle"), 2200);
    }
  };

  return (
    <section
      className="mt-12 border border-border rounded-md bg-card overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300"
      data-testid="inline-prompts-section"
    >
      <div className="px-4 md:px-6 py-4 border-b border-border bg-background/50 flex flex-wrap items-center gap-3">
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
        {generating && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-primary">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            Generating in background — safe to navigate away
          </span>
        )}
      </div>

      {/* Audio attachment */}
      <div className="px-4 md:px-6 py-5 border-b border-border space-y-4">
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
                disabled={generating}
                className="ml-1 opacity-60 hover:opacity-100 disabled:cursor-not-allowed"
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
              disabled={generating}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-border text-xs font-mono uppercase tracking-widest text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              data-testid="button-vo-add"
            >
              + Add voiceover
            </button>
          )}
          {voLanguage !== "none" && (
            <button
              type="button"
              onClick={() => setVoPanelOpen((v) => !v)}
              disabled={generating}
              className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-primary disabled:opacity-50"
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
                disabled={generating}
                className="ml-1 opacity-60 hover:opacity-100 disabled:cursor-not-allowed"
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
              disabled={generating}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-border text-xs font-mono uppercase tracking-widest text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-50 transition-colors"
              data-testid="button-bgm-add"
            >
              + Add BGM
            </button>
          )}
          <button
            type="button"
            onClick={() => setBgmPanelOpen((v) => !v)}
            disabled={generating}
            className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-primary disabled:opacity-50"
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

      {/* Generate / Next / Stop button */}
      <div className="px-4 md:px-6 py-5 border-b border-border flex flex-wrap items-center gap-3">
        {!generating && !awaitingNext && parts.length === 0 && (
          <button
            type="button"
            onClick={startGeneration}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-md bg-primary text-black font-mono text-xs uppercase tracking-widest hover:bg-[#D4EB3A] transition-colors"
            data-testid="button-generate-prompts-inline"
          >
            <Play className="w-4 h-4" /> Generate part 1 of {partsCount}
          </button>
        )}
        {!generating && awaitingNext && nextPartNumber <= totalParts && (
          <button
            type="button"
            onClick={generateNext}
            className="relative inline-flex items-center gap-2 px-5 py-3 rounded-md bg-primary text-black font-mono text-xs uppercase tracking-widest hover:bg-[#D4EB3A] hover:shadow-[0_8px_24px_-8px_rgba(232,255,71,0.6)] hover:-translate-y-0.5 transition-all border-2 border-primary"
            data-testid="button-generate-next-prompt"
          >
            <Play className="w-4 h-4" /> Generate next prompt — part {nextPartNumber} of {totalParts}
          </button>
        )}
        {!generating && allDone && parts.length > 0 && (
          <button
            type="button"
            onClick={startGeneration}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-md border border-border font-mono text-xs uppercase tracking-widest hover:border-primary hover:text-primary transition-colors"
            data-testid="button-regenerate-prompts-inline"
          >
            <Play className="w-4 h-4" /> Regenerate from part 1
          </button>
        )}
        {generating && (
          <>
            <button
              type="button"
              disabled
              className="inline-flex items-center gap-2 px-5 py-3 rounded-md bg-primary/40 text-black font-mono text-xs uppercase tracking-widest"
              data-testid="button-generate-prompts-inline"
            >
              <Loader2 className="w-4 h-4 animate-spin" /> Generating part {(job?.current ?? 0) + 1} of {totalParts}…
            </button>
            <button
              type="button"
              onClick={cancelGeneration}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-border font-mono text-xs uppercase tracking-widest hover:border-red-500 hover:text-red-400 transition-colors"
              data-testid="button-stop-generation"
            >
              <StopCircle className="w-4 h-4" /> Stop
            </button>
          </>
        )}
        {parts.length > 0 && !generating && (
          <>
            <button
              type="button"
              onClick={copyAllParts}
              className={`relative inline-flex items-center gap-2 px-5 py-3 rounded-md font-mono text-xs uppercase tracking-widest transition-all border-2 ${
                copyAllState === "copied"
                  ? "bg-green-500 border-green-500 text-black"
                  : "bg-primary border-primary text-black hover:bg-[#D4EB3A] hover:shadow-[0_8px_24px_-8px_rgba(232,255,71,0.6)] hover:-translate-y-0.5"
              }`}
              data-testid="button-copy-all-parts"
              aria-label="Copy all parts to clipboard"
            >
              {copyAllState === "copied" ? (
                <>
                  <Check className="w-4 h-4" /> Copied all {parts.length} parts!
                </>
              ) : (
                <>
                  <ClipboardCopy className="w-4 h-4" /> Copy ALL {parts.length}{" "}
                  part{parts.length === 1 ? "" : "s"}
                </>
              )}
            </button>
            <button
              type="button"
              onClick={downloadAll}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-border font-mono text-xs uppercase tracking-widest hover:border-primary hover:text-primary transition-colors"
              data-testid="button-download-all-inline"
            >
              <ArrowDownToLine className="w-4 h-4" /> Download .txt
            </button>
          </>
        )}
      </div>

      {job && (generating || awaitingNext) && (
        <div className="px-4 md:px-6 py-4 border-b border-border">
          <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
            {generating
              ? `Generating part ${job.current + 1} of ${job.total}…`
              : `${job.current} of ${job.total} parts ready`}
          </div>
          <div className="mt-2 h-1 bg-secondary/40 rounded">
            <div
              className="h-1 bg-primary rounded transition-all"
              style={{
                width: `${((generating ? job.current + 1 : job.current) / job.total) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {job?.status === "error" && job.error && (
        <div className="px-4 md:px-6 py-4 border-b border-border">
          <ErrorCard
            message={job.error}
            onRetry={job.parts.length > 0 ? generateNext : startGeneration}
          />
        </div>
      )}

      {parts.length > 0 && (
        <div className="px-4 md:px-6 py-6 space-y-6">
          {parts.map((p, idx) => (
            <PartCard
              key={p.partNumber}
              part={p}
              parts={parts}
              partsCount={parts.length}
              partsTotal={partsCount}
              partDuration={partDuration}
              continuesFrom={idx > 0}
              story={project.story}
              style={style}
              voLanguage={voLanguage}
              voTone={voTone}
              bgm={bgm}
              onPartUpdated={(updated) => {
                const saved = storage.replaceProjectPart(project.id, updated);
                if (saved) {
                  onProjectUpdated(saved);
                  window.dispatchEvent(new Event("cs:projects-changed"));
                }
                generation.replaceJobPart(project.id, updated);
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function PartCard({
  part,
  parts,
  partsCount,
  partsTotal,
  partDuration,
  continuesFrom,
  story,
  style,
  voLanguage,
  voTone,
  bgm,
  onPartUpdated,
}: {
  part: ProjectPart;
  parts: ProjectPart[];
  partsCount: number;
  partsTotal: number;
  partDuration: number;
  continuesFrom: boolean;
  story: Project["story"];
  style: string;
  voLanguage: VoiceoverLanguage;
  voTone: string;
  bgm: { name: string; tempo: string; instruments: string[] } | null;
  onPartUpdated: (updated: ProjectPart) => void;
}) {
  const [expandedShot, setExpandedShot] = useState<number | null>(null);
  const [showFullPrompt, setShowFullPrompt] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editInstruction, setEditInstruction] = useState("");
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const bgmName = bgm?.name ?? null;
  const bgmTempo = bgm?.tempo ?? null;
  const start = (part.partNumber - 1) * 15;
  const end = part.partNumber * 15;
  const fmt = (n: number) =>
    `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
  const signature = part.shots.find((s) => s.isSignature);

  const previousPart = parts.find((p) => p.partNumber === part.partNumber - 1);
  const nextPart = parts.find((p) => p.partNumber === part.partNumber + 1);

  // Close modal on Escape
  useEffect(() => {
    if (!editOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !editing) setEditOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editOpen, editing]);

  const submitEdit = async () => {
    const instruction = editInstruction.trim();
    if (!instruction) {
      setEditError("Please describe what you want to change.");
      return;
    }
    if (!story) {
      setEditError("This project has no saved story to edit against.");
      return;
    }
    setEditing(true);
    setEditError(null);
    try {
      const result = await editVideoPrompts({
        story,
        style,
        duration: partDuration,
        part: part.partNumber,
        totalParts: partsTotal,
        instruction,
        existingPart: part,
        previousLastFrame: previousPart?.lastFrameDescription ?? null,
        previousParts: buildPreviousPartDigests(
          parts.filter((p) => p.partNumber !== part.partNumber),
        ),
        nextFirstShot: nextPart?.shots[0]?.description ?? null,
        voiceoverLanguage:
          voLanguage === "none" ? null : voLanguage,
        voiceoverTone: voLanguage === "none" ? null : voTone,
        bgmStyle: bgmName,
        bgmTempo: bgmTempo,
        bgmInstruments: bgm?.instruments ?? [],
      });
      const updated: ProjectPart = {
        ...result,
        partNumber: part.partNumber,
        voiceoverLanguage: voLanguage === "none" ? null : voLanguage,
        bgmStyle: bgmName,
        bgmTempo: bgmTempo,
      };
      onPartUpdated(updated);
      toast.success(`Part ${part.partNumber} updated`);
      setEditOpen(false);
      setEditInstruction("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Edit failed";
      setEditError(msg);
      toast.error(`Couldn't apply edit: ${msg}`);
    } finally {
      setEditing(false);
    }
  };

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
              <Diamond className="w-3 h-3" /> Signature: {signature.name}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:border-primary hover:text-primary transition-colors"
            data-testid={`button-edit-part-${part.partNumber}`}
            aria-label={`Edit part ${part.partNumber} with a prompt`}
          >
            <Pencil className="w-3.5 h-3.5" /> Edit with prompt
          </button>
          <CopyButton
            text={part.copyablePrompt}
            label="Copy full prompt"
            variant="accent"
            testId={`button-copy-part-${part.partNumber}`}
          />
        </div>
      </div>

      <div className="p-5 space-y-5">
        {(voLanguage !== "none" || bgmName) && (
          <div className="flex flex-wrap gap-2">
            {voLanguage !== "none" && part.autoVoiceoverScript && (
              <div
                className="text-xs flex-1 min-w-full sm:min-w-[260px] px-3 py-2 rounded-md bg-emerald-500/5 border border-emerald-500/20"
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
              <div className="text-xs flex-1 min-w-full sm:min-w-[200px] px-3 py-2 rounded-md bg-primary/5 border border-primary/20">
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
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-black bg-primary px-1.5 py-0.5 rounded">
                        <Diamond className="w-2.5 h-2.5" />
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {expandedShot === s.shotNumber ? "−" : "+"}
                  </span>
                </button>
                {expandedShot === s.shotNumber && (
                  <div className="border-t border-border p-3 text-xs space-y-2">
                    <div>
                      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        Description ·{" "}
                      </span>
                      {s.description}
                    </div>
                    <div>
                      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        Effects ·{" "}
                      </span>
                      {s.effects.join(", ")}
                    </div>
                    <div>
                      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        Camera ·{" "}
                      </span>
                      {s.cameraWork}
                    </div>
                    <div>
                      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        Speed ·{" "}
                      </span>
                      {s.speed}
                    </div>
                    <div>
                      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        Exit ·{" "}
                      </span>
                      {s.transition}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>

        {part.energyArc && (
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
              Energy Arc
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {(["act1", "act2", "act3"] as const).map((k, i) => (
                <div
                  key={k}
                  className="border border-border rounded-md p-3 bg-card text-xs"
                >
                  <div className="text-[10px] font-mono uppercase tracking-widest text-primary">
                    Act {i + 1}
                  </div>
                  <p className="mt-1">{part.energyArc[k]}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Full copyable prompt — collapsible */}
        <div>
          <button
            type="button"
            onClick={() => setShowFullPrompt((v) => !v)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-border text-left hover:border-primary/50 transition-colors"
            data-testid={`button-toggle-full-prompt-${part.partNumber}`}
            aria-expanded={showFullPrompt}
          >
            <span className="flex items-center gap-2">
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                Full Seedance prompt
              </span>
              <span className="text-[10px] font-mono text-muted-foreground/70">
                ({part.copyablePrompt.length.toLocaleString()} chars)
              </span>
            </span>
            <span className="flex items-center gap-2">
              {showFullPrompt ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              )}
            </span>
          </button>
          {showFullPrompt && (
            <div className="mt-2 border border-border rounded-md bg-card">
              <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border">
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                  Paste-ready Seedance 2.0 prompt
                </div>
                <CopyButton
                  text={part.copyablePrompt}
                  label="Copy"
                  testId={`button-copy-full-prompt-${part.partNumber}`}
                />
              </div>
              <pre
                className="px-3 py-3 text-[11px] leading-relaxed whitespace-pre-wrap break-words font-mono text-foreground/90 max-h-[420px] overflow-y-auto"
                data-testid={`text-full-prompt-${part.partNumber}`}
              >
                {part.copyablePrompt}
              </pre>
              <div className="px-3 py-2 border-t border-border text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                Last frame · {part.lastFrameDescription}
              </div>
            </div>
          )}
        </div>
      </div>

      {editOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in-0"
          onClick={() => {
            if (!editing) setEditOpen(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby={`edit-part-title-${part.partNumber}`}
          data-testid={`edit-part-modal-${part.partNumber}`}
        >
          <div
            className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-md border border-border bg-background shadow-2xl animate-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 px-5 py-4 bg-background border-b border-border">
              <div className="min-w-0">
                <div className="text-[10px] font-mono uppercase tracking-widest text-primary">
                  Edit · Part {part.partNumber} of {partsTotal}
                </div>
                <h3
                  id={`edit-part-title-${part.partNumber}`}
                  className="font-display text-2xl tracking-tight mt-1"
                >
                  Refine with a prompt
                </h3>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Tell the AI what to change. Continuity to {previousPart ? `Part ${previousPart.partNumber}` : "(no previous part)"}{" "}
                  and {nextPart ? `Part ${nextPart.partNumber}` : "(no next part)"} will be preserved automatically.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!editing) setEditOpen(false);
                }}
                disabled={editing}
                className="w-8 h-8 inline-flex items-center justify-center rounded-md border border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid={`button-close-edit-${part.partNumber}`}
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-5 space-y-4">
              <div>
                <label
                  htmlFor={`edit-instruction-${part.partNumber}`}
                  className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground"
                >
                  Your instruction
                </label>
                <textarea
                  id={`edit-instruction-${part.partNumber}`}
                  value={editInstruction}
                  onChange={(e) => {
                    setEditInstruction(e.target.value);
                    if (editError) setEditError(null);
                  }}
                  disabled={editing}
                  rows={5}
                  placeholder='e.g. "Make shot 3 a slow whip pan instead of a cut" or "Drop the second shot and add a close-up at the end"'
                  className="mt-2 w-full px-3 py-2 rounded-md border border-border bg-card text-sm focus:outline-none focus:border-primary resize-y disabled:opacity-50"
                  data-testid={`textarea-edit-instruction-${part.partNumber}`}
                />
              </div>

              <div className="rounded-md border border-border bg-card/50 px-3 py-2 text-[11px] text-muted-foreground space-y-1">
                <div>
                  <span className="font-mono uppercase tracking-widest text-[9px]">Entry continuity ·</span>{" "}
                  {previousPart
                    ? `continues from Part ${previousPart.partNumber}'s last frame.`
                    : "this is the first part — no entry constraint."}
                </div>
                <div>
                  <span className="font-mono uppercase tracking-widest text-[9px]">Exit continuity ·</span>{" "}
                  {nextPart
                    ? `must end so Part ${nextPart.partNumber} can still continue from it.`
                    : "this is the final part — no exit constraint."}
                </div>
              </div>

              {editError && (
                <div
                  className="px-3 py-2 rounded-md border border-red-500/30 bg-red-500/10 text-xs text-red-400"
                  data-testid={`text-edit-error-${part.partNumber}`}
                >
                  {editError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => {
                    if (!editing) setEditOpen(false);
                  }}
                  disabled={editing}
                  className="px-4 py-2 rounded-md border border-border font-mono text-xs uppercase tracking-widest text-muted-foreground hover:border-foreground/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid={`button-cancel-edit-${part.partNumber}`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitEdit}
                  disabled={editing || !editInstruction.trim()}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-md bg-primary text-black font-mono text-xs uppercase tracking-widest hover:bg-[#D4EB3A] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid={`button-submit-edit-${part.partNumber}`}
                >
                  {editing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Refining…
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" /> Apply edit
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
