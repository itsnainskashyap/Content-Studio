import { useEffect, useMemo, useState } from "react";
import { Loader2, Play, Mic } from "lucide-react";
import { toast } from "sonner";
import {
  useGenerateVoiceover,
  type VoiceoverRequestLanguage,
  type VoiceoverRequestPace,
} from "@workspace/api-client-react";
import {
  storage,
  TONES,
  type Project,
  type ProjectVoiceoverPart,
} from "@/lib/storage";
import { useApiCall, mutationCaller } from "@/lib/api-call";
import { ErrorCard } from "@/components/error-card";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

type Lang = VoiceoverRequestLanguage;
type Pace = VoiceoverRequestPace;

const LANGS: Array<{ key: Lang; label: string; sub?: string }> = [
  { key: "hindi", label: "हिंदी", sub: "Hindi" },
  { key: "english", label: "English" },
  { key: "hinglish", label: "Hinglish", sub: "Hindi + English mix" },
];

const PACES: Pace[] = ["slow", "normal", "fast"];

export default function VoiceoverGenerator() {
  const [project, setProject] = useState<Project | null>(null);
  const [language, setLanguage] = useState<Lang>("english");
  const [tone, setTone] = useState<string>("cinematic");
  const [pace, setPace] = useState<Pace>("normal");
  const [partTarget, setPartTarget] = useState<"all" | number>("all");
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [voParts, setVoParts] = useState<ProjectVoiceoverPart[]>([]);
  const [error, setError] = useState<string | null>(null);

  const generateVoMut = useGenerateVoiceover();
  const call = useApiCall(mutationCaller(generateVoMut.mutateAsync));

  useEffect(() => {
    const cur = storage.getCurrentProject();
    if (cur) {
      setProject(cur);
      if (cur.voiceover) {
        setLanguage(cur.voiceover.language);
        setTone(cur.voiceover.tone);
        setVoParts(cur.voiceover.parts);
      }
    }
  }, []);

  const totalParts = useMemo(() => {
    if (!project) return 1;
    return Math.max(1, project.parts.length || 1);
  }, [project]);

  const handleGenerate = async () => {
    if (!project || !project.story) {
      toast.error("Save a story first");
      return;
    }
    const targetParts =
      partTarget === "all"
        ? Array.from({ length: totalParts }, (_, i) => i + 1)
        : [partTarget];

    setGenerating(true);
    setError(null);
    const collected: ProjectVoiceoverPart[] = [...voParts];

    for (const part of targetParts) {
      setProgress({ current: part, total: targetParts[targetParts.length - 1] });
      const partDuration =
        project.parts[part - 1]?.shots.reduce((sum, s) => {
          const m = s.timestamp.match(/(\d+):(\d+)-(\d+):(\d+)/);
          if (!m) return sum;
          const start = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
          const end = parseInt(m[3], 10) * 60 + parseInt(m[4], 10);
          return sum + (end - start);
        }, 0) || project.duration || Math.ceil(project.totalDuration / totalParts);

      const result = await call.run({
        story: project.story,
        style: project.style ?? undefined,
        language,
        tone,
        duration: partDuration,
        part,
        pace,
      });
      if (!result) {
        setError(call.error ?? "Generation failed");
        setGenerating(false);
        setProgress(null);
        return;
      }
      const idx = collected.findIndex((c) => c.partNumber === part);
      const entry: ProjectVoiceoverPart = { ...result, partNumber: part };
      if (idx >= 0) collected[idx] = entry;
      else collected.push(entry);
      collected.sort((a, b) => a.partNumber - b.partNumber);
      setVoParts([...collected]);
    }

    const updated: Project = {
      ...project,
      voiceover: { language, tone, parts: collected },
    };
    const saved = storage.saveProject(updated);
    setProject(saved);
    window.dispatchEvent(new Event("cs:projects-changed"));
    setGenerating(false);
    setProgress(null);
    toast.success("Voiceover saved");
  };

  if (!project || !project.story) {
    return (
      <div className="px-4 py-8 md:px-12 md:py-14 max-w-3xl mx-auto">
        <h1 className="font-display text-4xl md:text-5xl tracking-tight">
          Voiceover
        </h1>
        <p className="mt-3 text-muted-foreground">
          Save a story before drafting voiceover scripts.
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

  return (
    <div className="px-4 py-8 md:px-12 md:py-14 max-w-6xl mx-auto">
      <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
        Project · {project.title}
      </div>
      <h1 className="mt-1 font-display text-4xl md:text-5xl tracking-tight">
        Voiceover
      </h1>

      <div className="mt-8 border border-border rounded-md p-5 bg-card space-y-6">
        <div>
          <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Language
          </h3>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {LANGS.map((l) => (
              <button
                key={l.key}
                type="button"
                onClick={() => setLanguage(l.key)}
                className={cn(
                  "border rounded-md py-4 px-3 text-center transition-colors",
                  language === l.key
                    ? "bg-primary text-black border-primary"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
                data-testid={`lang-${l.key}`}
              >
                <div
                  className={cn(
                    "font-display text-2xl tracking-tight",
                    l.key === "hindi" && "font-devanagari",
                  )}
                  style={{
                    fontFamily:
                      l.key === "hindi"
                        ? "var(--app-font-devanagari, 'Noto Sans Devanagari', sans-serif)"
                        : undefined,
                  }}
                >
                  {l.label}
                </div>
                {l.sub && (
                  <div className="mt-1 text-[10px] font-mono uppercase tracking-widest opacity-70">
                    {l.sub}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Tone
          </h3>
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {TONES.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTone(t.key)}
                className={cn(
                  "border rounded-md p-3 text-center transition-colors",
                  tone === t.key
                    ? "bg-primary text-black border-primary"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
                data-testid={`tone-${t.key}`}
              >
                <div className="text-2xl">{t.emoji}</div>
                <div className="mt-1 text-[10px] font-mono uppercase tracking-widest">
                  {t.label}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Generate for
            </h3>
            <select
              value={partTarget === "all" ? "all" : String(partTarget)}
              onChange={(e) =>
                setPartTarget(
                  e.target.value === "all"
                    ? "all"
                    : parseInt(e.target.value, 10),
                )
              }
              className="mt-2 w-full bg-background border border-border rounded-md p-2 text-sm focus:outline-none focus:border-primary"
              data-testid="select-part-target"
            >
              <option value="all">All parts</option>
              {Array.from({ length: totalParts }, (_, i) => i + 1).map((p) => (
                <option key={p} value={p}>
                  Part {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Pace
            </h3>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {PACES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPace(p)}
                  className={cn(
                    "border rounded-md p-2 text-center text-xs font-mono uppercase tracking-widest transition-colors",
                    pace === p
                      ? "bg-primary text-black border-primary"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                  data-testid={`pace-${p}`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating}
          className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-md bg-primary text-black font-mono text-xs uppercase tracking-widest hover:bg-[#D4EB3A] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          data-testid="button-generate-vo"
        >
          {generating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Writing voiceover…
              {progress &&
                ` (part ${progress.current}/${progress.total})`}
            </>
          ) : (
            <>
              <Play className="w-4 h-4" /> Generate voiceover
            </>
          )}
        </button>

        {error && <ErrorCard message={error} onRetry={handleGenerate} />}
      </div>

      <div className="mt-10 space-y-4">
        {voParts.length === 0 ? (
          <div className="border border-border rounded-md p-10 text-center text-muted-foreground">
            <Mic className="w-8 h-8 mx-auto mb-3 opacity-30" />
            <div className="font-mono text-xs uppercase tracking-widest">
              No voiceover yet
            </div>
          </div>
        ) : (
          voParts.map((p) => (
            <VoCard key={p.partNumber} part={p} language={language} />
          ))
        )}
      </div>
    </div>
  );
}

function VoCard({
  part,
  language,
}: {
  part: ProjectVoiceoverPart;
  language: Lang;
}) {
  const [version, setVersion] = useState<"main" | "alt0" | "alt1">("main");
  const [showEleven, setShowEleven] = useState(false);
  const versions: Array<{ key: typeof version; label: string; script: string }> = [
    { key: "main", label: "Main", script: part.script },
    {
      key: "alt0",
      label: part.alternateVersions[0]?.label ?? "More Dramatic",
      script:
        part.alternateVersions[0]?.script ?? "(no alternate provided)",
    },
    {
      key: "alt1",
      label: part.alternateVersions[1]?.label ?? "Casual",
      script:
        part.alternateVersions[1]?.script ?? "(no alternate provided)",
    },
  ];
  const active = versions.find((v) => v.key === version)!;
  const isHindi = language === "hindi";

  return (
    <div
      className="border border-border rounded-md bg-card"
      data-testid={`vo-part-${part.partNumber}`}
    >
      <div className="flex items-center justify-between p-4 border-b border-border flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono uppercase tracking-widest text-primary">
            Part {part.partNumber}
          </span>
          <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            ~{part.estimatedDuration} · {part.wordCount} words
          </span>
          <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground border border-border rounded px-1.5 py-0.5">
            {part.language}
          </span>
        </div>
        <div className="flex gap-2">
          <CopyButton
            text={part.copyableScript}
            label="Copy script"
            testId={`button-copy-script-${part.partNumber}`}
          />
          <CopyButton
            text={part.elevenlabsPrompt + "\n\n" + part.copyableScript}
            label="Copy for ElevenLabs"
            testId={`button-copy-eleven-${part.partNumber}`}
          />
        </div>
      </div>

      <div className="px-4 pt-3 flex gap-1 border-b border-border">
        {versions.map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => setVersion(v.key)}
            className={cn(
              "px-3 py-2 text-xs font-mono uppercase tracking-widest transition-colors border-b-2 -mb-px",
              version === v.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
            data-testid={`version-${part.partNumber}-${v.key}`}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-3">
        <pre
          className={cn(
            "whitespace-pre-wrap text-base leading-relaxed bg-background border border-border rounded-md p-4",
            isHindi ? "font-devanagari" : "font-mono",
          )}
          style={{
            fontFamily: isHindi
              ? "var(--app-font-devanagari, 'Noto Sans Devanagari', sans-serif)"
              : undefined,
          }}
          data-testid={`script-${part.partNumber}`}
        >
          {active.script}
        </pre>

        <div className="border border-border rounded-md p-3">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            Delivery notes
          </div>
          <p className="text-sm italic mt-1 text-muted-foreground">
            {part.deliveryNotes}
          </p>
        </div>

        <div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
            Emphasis words
          </div>
          <div className="flex flex-wrap gap-1">
            {part.emphasisWords.map((w, i) => (
              <span
                key={i}
                className="text-[11px] px-1.5 py-0.5 rounded bg-primary/20 text-primary border border-primary/40"
              >
                {w}
              </span>
            ))}
          </div>
        </div>

        <div className="border border-border rounded-md">
          <button
            type="button"
            onClick={() => setShowEleven(!showEleven)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground"
            data-testid={`toggle-eleven-${part.partNumber}`}
          >
            <span>ElevenLabs voice prompt</span>
            <span>{showEleven ? "−" : "+"}</span>
          </button>
          {showEleven && (
            <div className="px-3 pb-3">
              <pre className="text-[11px] font-mono whitespace-pre-wrap break-words bg-background border border-border rounded-md p-2">
                {part.elevenlabsPrompt}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
