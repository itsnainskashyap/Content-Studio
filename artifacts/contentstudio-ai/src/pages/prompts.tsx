import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Sparkles,
  Download,
  ArrowDownToLine,
  Check,
  Play,
  Star,
} from "lucide-react";
import { toast } from "sonner";
import type {
  VideoPromptsRequest,
  VideoPromptsResponse,
} from "@workspace/api-client-react";
import {
  storage,
  STYLES,
  type Project,
  type ProjectPart,
} from "@/lib/storage";
import { useApiCall, postJson } from "@/lib/api-call";
import { ErrorCard } from "@/components/error-card";
import { CopyButton } from "@/components/copy-button";

const generateVideoPromptsFn = postJson<VideoPromptsRequest, VideoPromptsResponse>(
  "/generate-video-prompts",
);

const PART_DURATIONS = [5, 10, 15, 20];

export default function PromptGenerator() {
  const [project, setProject] = useState<Project | null>(null);
  const [style, setStyle] = useState<string | null>(null);
  const [partDuration, setPartDuration] = useState(5);
  const [generating, setGenerating] = useState(false);
  const [parts, setParts] = useState<ProjectPart[]>([]);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const partCall = useApiCall(generateVideoPromptsFn);

  useEffect(() => {
    const current = storage.getCurrentProject();
    if (current) {
      setProject(current);
      if (current.style) setStyle(current.style);
      if (current.duration) setPartDuration(current.duration);
      if (current.parts.length > 0) setParts(current.parts);
    }
  }, []);

  const totalParts = useMemo(() => {
    if (!project) return 0;
    return Math.max(1, Math.ceil(project.totalDuration / partDuration));
  }, [project, partDuration]);

  const startGeneration = async () => {
    if (!project || !project.story || !style) {
      toast.error("Pick a story, save it, and choose a style first");
      return;
    }
    setGenerating(true);
    setError(null);
    setParts([]);

    let previousLastFrame: string | undefined = undefined;
    const collected: ProjectPart[] = [];

    for (let i = 1; i <= totalParts; i++) {
      setProgress({ current: i, total: totalParts });
      const result = await partCall.run({
        story: project.story,
        style,
        duration: partDuration,
        part: i,
        totalParts,
        previousLastFrame,
      });
      if (!result) {
        setError(partCall.error ?? "Generation failed");
        setGenerating(false);
        setProgress(null);
        return;
      }
      const part: ProjectPart = { ...result, partNumber: i };
      collected.push(part);
      setParts([...collected]);
      previousLastFrame = result.lastFrameDescription;
    }

    // Persist
    const updated: Project = {
      ...project,
      style,
      duration: partDuration,
      parts: collected,
    };
    const saved = storage.saveProject(updated);
    storage.setCurrentProjectId(saved.id);
    setProject(saved);
    window.dispatchEvent(new Event("cs:projects-changed"));
    setGenerating(false);
    setProgress(null);
    toast.success(`Generated ${collected.length} part${collected.length === 1 ? "" : "s"}`);
  };

  const downloadAll = () => {
    if (!project || parts.length === 0) return;
    const lines: string[] = [];
    lines.push(`# ${project.title}`);
    if (project.story) {
      lines.push(``);
      lines.push(`## Story`);
      lines.push(project.story.synopsis);
    }
    lines.push(``);
    lines.push(`Style: ${project.style ?? style ?? "—"}`);
    lines.push(`Per-part duration: ${partDuration}s`);
    lines.push(`Total parts: ${parts.length}`);
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

  // No project / story state
  if (!project || !project.story) {
    return (
      <div className="px-6 py-10 md:px-12 md:py-14 max-w-3xl mx-auto">
        <h1 className="font-display text-4xl md:text-5xl tracking-tight">
          Video Prompts
        </h1>
        <p className="mt-3 text-muted-foreground">
          You need a saved story before generating shot prompts.
        </p>
        <a
          href={`${import.meta.env.BASE_URL}story`}
          className="mt-6 inline-flex items-center gap-2 px-5 py-3 rounded-md bg-primary text-black font-mono text-xs uppercase tracking-widest hover:bg-[#D4EB3A] transition-colors"
          data-testid="button-go-story"
        >
          Go to Story Builder
        </a>
      </div>
    );
  }

  // Style selection state
  if (!style && parts.length === 0) {
    return (
      <div className="px-6 py-10 md:px-12 md:py-14 max-w-6xl mx-auto">
        <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
          Step 1 of 2 · Pick a style
        </div>
        <h1 className="mt-1 font-display text-4xl md:text-5xl tracking-tight">
          Video Prompts
        </h1>
        <p className="mt-3 text-muted-foreground max-w-2xl">
          Choose the visual world. The prompts will be tailored to it shot by
          shot.
        </p>
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {STYLES.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setStyle(s.name)}
              className="text-left border border-border rounded-md p-4 bg-card hover:border-primary transition-colors group"
              data-testid={`style-${s.key}`}
              style={{ borderTopColor: s.accent, borderTopWidth: 3 }}
            >
              <div className="font-display text-2xl tracking-tight group-hover:text-primary">
                {s.name}
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                {s.description}
              </div>
              <div className="mt-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground/80">
                {s.keywords}
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Selected style → duration + generate
  return (
    <div className="px-6 py-10 md:px-12 md:py-14 max-w-6xl mx-auto">
      <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
        Project · {project.title}
      </div>
      <h1 className="mt-1 font-display text-4xl md:text-5xl tracking-tight">
        Video Prompts
      </h1>

      <div className="mt-6 border border-border rounded-md p-5 bg-card flex flex-wrap gap-6 items-end">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            Style
          </div>
          <div className="mt-1 font-display text-2xl tracking-tight">
            {style}
          </div>
          {parts.length === 0 && (
            <button
              type="button"
              onClick={() => setStyle(null)}
              className="mt-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-primary"
              data-testid="button-change-style"
            >
              Change style
            </button>
          )}
        </div>
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            Duration / part
          </div>
          <div className="mt-2 flex gap-2">
            {PART_DURATIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setPartDuration(d)}
                disabled={generating || parts.length > 0}
                className={`px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-widest border transition-colors ${
                  partDuration === d
                    ? "bg-primary text-black border-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                } ${generating || parts.length > 0 ? "opacity-50 cursor-not-allowed" : ""}`}
                data-testid={`pill-pdur-${d}`}
              >
                {d}s
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            Total
          </div>
          <div className="mt-1 font-mono text-sm">
            {totalParts} × {partDuration}s = {totalParts * partDuration}s
          </div>
        </div>
        <div className="ml-auto flex gap-2">
          {parts.length === 0 ? (
            <button
              type="button"
              onClick={startGeneration}
              disabled={generating}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-md bg-primary text-black font-mono text-xs uppercase tracking-widest hover:bg-[#D4EB3A] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              data-testid="button-generate-prompts"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Generating…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" /> Generate prompts
                </>
              )}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={downloadAll}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-border font-mono text-xs uppercase tracking-widest hover:border-primary hover:text-primary transition-colors"
                data-testid="button-download-all"
              >
                <Download className="w-4 h-4" /> Download .txt
              </button>
              <button
                type="button"
                onClick={() => {
                  setParts([]);
                  setStyle(null);
                  toast("Reset — pick a style and generate again");
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-border font-mono text-xs uppercase tracking-widest hover:border-primary hover:text-primary transition-colors"
                data-testid="button-reset"
              >
                Start over
              </button>
            </>
          )}
        </div>
      </div>

      {progress && (
        <div className="mt-6">
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
        <div className="mt-6">
          <ErrorCard message={error} onRetry={startGeneration} />
        </div>
      )}

      {parts.length > 0 && (
        <div className="mt-10 space-y-8">
          {parts.map((p, idx) => (
            <PartCard key={p.partNumber} part={p} continuesFrom={idx > 0} />
          ))}

          <div className="border border-primary/40 bg-primary/5 rounded-md p-5">
            <div className="text-[10px] font-mono uppercase tracking-widest text-primary">
              Complete prompt package
            </div>
            <div className="mt-1 font-display text-2xl tracking-tight">
              {parts.length} part{parts.length === 1 ? "" : "s"} ·{" "}
              {parts.reduce((s, p) => s + p.shots.length, 0)} shots
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={downloadAll}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-md bg-primary text-black font-mono text-xs uppercase tracking-widest hover:bg-[#D4EB3A] transition-colors"
                data-testid="button-download-package"
              >
                <ArrowDownToLine className="w-4 h-4" /> Download all prompts
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PartCard({
  part,
  continuesFrom,
}: {
  part: ProjectPart;
  continuesFrom: boolean;
}) {
  const [expandedShot, setExpandedShot] = useState<number | null>(null);

  return (
    <div
      className="border border-border rounded-md bg-card"
      data-testid={`part-${part.partNumber}`}
    >
      <div className="flex items-center justify-between p-5 border-b border-border">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-primary">
            Part {part.partNumber}
          </div>
          <div className="mt-1 font-display text-2xl tracking-tight">
            {part.shots.length} shots
          </div>
          {continuesFrom && (
            <div className="mt-1 text-[11px] font-mono text-muted-foreground">
              ↳ Continues from Part {part.partNumber - 1}
            </div>
          )}
        </div>
        <CopyButton
          text={part.copyablePrompt}
          label="Copy prompt"
          variant="accent"
          testId={`button-copy-part-${part.partNumber}`}
        />
      </div>

      <div className="p-5 space-y-3">
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
          <div className="flex justify-between mt-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            <span>{part.densityMap[0]?.timeRange ?? ""}</span>
            <span>{part.densityMap[part.densityMap.length - 1]?.timeRange ?? ""}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
          {(["act1", "act2", "act3"] as const).map((k) => (
            <div
              key={k}
              className="border border-border rounded-md p-3 bg-background"
            >
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                {k.toUpperCase()}
              </div>
              <p className="mt-1 text-xs">{part.energyArc[k]}</p>
            </div>
          ))}
        </div>

        <div className="mt-6">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
            Shots
          </div>
          <ul className="space-y-2">
            {part.shots.map((s) => (
              <li
                key={s.shotNumber}
                className="border border-border rounded-md bg-background"
              >
                <button
                  type="button"
                  onClick={() =>
                    setExpandedShot((cur) =>
                      cur === s.shotNumber ? null : s.shotNumber,
                    )
                  }
                  className="w-full flex items-center justify-between gap-3 p-3 text-left"
                  data-testid={`shot-${part.partNumber}-${s.shotNumber}`}
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
                  <div className="px-3 pb-3 pt-0 space-y-2">
                    <p className="text-xs">{s.description}</p>
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

        <div className="mt-6 border-t border-border pt-4">
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
