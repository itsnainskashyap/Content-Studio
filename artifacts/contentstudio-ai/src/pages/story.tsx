import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  Loader2,
  Save,
  Sparkles,
  ArrowRight,
  BookOpen,
  Volume2,
} from "lucide-react";
import { toast } from "sonner";
import {
  useGenerateStory,
  useContinueStory,
} from "@workspace/api-client-react";
import {
  storage,
  createEmptyProject,
  GENRES,
  STYLES,
  type Project,
  type VoiceoverLanguage,
} from "@/lib/storage";
import { useApiCall, mutationCaller } from "@/lib/api-call";
import { ErrorCard } from "@/components/error-card";
import { CopyButton } from "@/components/copy-button";
import { InlinePrompts } from "@/components/inline-prompts";

interface DurationPreset {
  key: string;
  label: string;
  seconds: number | null; // null = custom
}
const DURATIONS: DurationPreset[] = [
  { key: "30s", label: "30s", seconds: 30 },
  { key: "1min", label: "1 min", seconds: 60 },
  { key: "2min", label: "2 min", seconds: 120 },
  { key: "3min", label: "3 min", seconds: 180 },
  { key: "5min", label: "5 min", seconds: 300 },
  { key: "custom", label: "Custom", seconds: null },
];

const VO_OPTIONS: Array<{ key: VoiceoverLanguage; label: string }> = [
  { key: "none", label: "No VO" },
  { key: "hindi", label: "हिंदी" },
  { key: "english", label: "English" },
  { key: "hinglish", label: "Hinglish" },
];

interface PrefillTemplate {
  brief?: string;
  genre?: string;
  totalDurationSeconds?: number;
  style?: string;
  voiceoverLanguage?: VoiceoverLanguage;
  autoGenerate?: boolean;
}

export default function StoryBuilder() {
  const [, navigate] = useLocation();
  const [brief, setBrief] = useState("");
  const [genre, setGenre] = useState("Drama");
  const [durationKey, setDurationKey] = useState<string>("30s");
  const [customMin, setCustomMin] = useState(0);
  const [customSec, setCustomSec] = useState(45);
  const [styleName, setStyleName] = useState<string | null>(null);
  const [voLanguage, setVoLanguage] = useState<VoiceoverLanguage>("none");
  const [project, setProject] = useState<Project | null>(null);
  const [direction, setDirection] = useState("");
  const [showPrompts, setShowPrompts] = useState(false);

  const generateStoryMut = useGenerateStory();
  const continueStoryMut = useContinueStory();
  const storyCall = useApiCall(mutationCaller(generateStoryMut.mutateAsync));
  const continueCall = useApiCall(
    mutationCaller(continueStoryMut.mutateAsync),
  );

  // Compute total duration in seconds
  const totalDurationSeconds = useMemo(() => {
    const preset = DURATIONS.find((d) => d.key === durationKey);
    if (!preset) return 30;
    if (preset.seconds !== null) return preset.seconds;
    const sec = Math.max(15, customMin * 60 + customSec);
    return sec;
  }, [durationKey, customMin, customSec]);

  const partsCount = useMemo(
    () => Math.max(1, Math.ceil(totalDurationSeconds / 15)),
    [totalDurationSeconds],
  );

  useEffect(() => {
    // Read template prefill from sessionStorage if dashboard sent us one
    let prefill: PrefillTemplate | null = null;
    try {
      const raw = sessionStorage.getItem("cs_template");
      if (raw) {
        prefill = JSON.parse(raw) as PrefillTemplate;
        sessionStorage.removeItem("cs_template");
      }
    } catch {
      prefill = null;
    }

    const current = storage.getCurrentProject();
    if (current && !prefill) {
      setProject(current);
      setBrief(current.brief);
      setGenre(current.genre);
      setStyleName(current.style ?? null);
      setVoLanguage((current.voiceoverLanguage ?? "none") as VoiceoverLanguage);
      // Map totalDurationSeconds back into UI
      const sec = current.totalDurationSeconds ?? current.totalDuration ?? 30;
      const preset = DURATIONS.find((d) => d.seconds === sec);
      if (preset) {
        setDurationKey(preset.key);
      } else {
        setDurationKey("custom");
        setCustomMin(Math.floor(sec / 60));
        setCustomSec(sec % 60);
      }
      if (current.story) {
        storyCall.setData(current.story);
      }
      if (current.parts.length > 0) {
        setShowPrompts(true);
      }
    } else if (prefill) {
      if (prefill.brief !== undefined) setBrief(prefill.brief);
      if (prefill.genre) setGenre(prefill.genre);
      if (prefill.style !== undefined) setStyleName(prefill.style);
      if (prefill.voiceoverLanguage)
        setVoLanguage(prefill.voiceoverLanguage);
      if (prefill.totalDurationSeconds) {
        const preset = DURATIONS.find(
          (d) => d.seconds === prefill!.totalDurationSeconds,
        );
        if (preset) {
          setDurationKey(preset.key);
        } else {
          setDurationKey("custom");
          setCustomMin(Math.floor(prefill.totalDurationSeconds / 60));
          setCustomSec(prefill.totalDurationSeconds % 60);
        }
      }
      // Clear current project so a fresh project is created
      storage.setCurrentProjectId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canGenerate =
    brief.trim().length > 0 && styleName !== null && totalDurationSeconds > 0;

  const handleGenerate = async () => {
    if (!brief.trim()) {
      toast.error("Add a brief first");
      return;
    }
    if (!styleName) {
      toast.error("Pick a visual style");
      return;
    }
    setShowPrompts(false);
    const result = await storyCall.run({
      brief,
      genre,
      duration: totalDurationSeconds,
      totalDurationSeconds,
      partsCount,
      style: styleName,
      voiceoverLanguage: voLanguage,
    });
    if (result) {
      toast.success("Story generated");
    }
  };

  const persistProjectFromStory = (
    p: Project | null,
    storyOverride?: typeof storyCall.data,
  ): Project => {
    const story = storyOverride ?? storyCall.data;
    if (!story) throw new Error("No story to save");
    let next = p;
    if (!next) {
      next = createEmptyProject({
        title: story.title,
        brief,
        genre,
        totalDuration: totalDurationSeconds,
        style: styleName,
        voiceoverLanguage: voLanguage,
      });
    } else {
      next = {
        ...next,
        title: story.title,
        brief,
        genre,
        totalDuration: totalDurationSeconds,
        totalDurationSeconds,
        partsCount,
        style: styleName,
        voiceoverLanguage: voLanguage,
      };
    }
    next.story = story;
    const saved = storage.saveProject(next);
    storage.setCurrentProjectId(saved.id);
    setProject(saved);
    window.dispatchEvent(new Event("cs:projects-changed"));
    return saved;
  };

  const handleSave = () => {
    if (!storyCall.data) return;
    persistProjectFromStory(project);
    toast.success("Project saved");
  };

  const handleStartPrompts = () => {
    if (!storyCall.data) return;
    persistProjectFromStory(project);
    setShowPrompts(true);
    requestAnimationFrame(() => {
      const el = document.querySelector(
        '[data-testid="inline-prompts-section"]',
      );
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const handleContinue = async () => {
    if (!storyCall.data) return;
    if (!direction.trim()) {
      toast.error("Add a continuation direction");
      return;
    }
    const result = await continueCall.run({
      existingStory: storyCall.data,
      direction,
    });
    if (result) {
      storyCall.setData(result);
      setDirection("");
      toast.success("Story extended");
    }
  };

  const story = storyCall.data;

  return (
    <div className="px-6 py-10 md:px-12 md:py-14 max-w-6xl mx-auto">
      <div className="mb-10">
        <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
          Step {showPrompts ? "3" : story ? "2" : "1"} of 3
        </div>
        <h1 className="font-display text-4xl md:text-5xl tracking-tight mt-1">
          Story Builder
        </h1>
      </div>

      {/* Step 1 — brief input + selectors */}
      <section className="border border-border rounded-md p-6 bg-card">
        <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Brief
        </h2>
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="Describe your video concept… e.g. A street artist in Mumbai discovers their graffiti comes alive at midnight."
          rows={4}
          className="mt-3 w-full bg-background border border-border rounded-md p-3 text-sm focus:outline-none focus:border-primary placeholder:text-muted-foreground/60"
          data-testid="input-brief"
        />

        <div className="mt-5">
          <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Genre
          </h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {GENRES.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGenre(g)}
                className={`px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-widest border transition-colors ${
                  genre === g
                    ? "bg-primary text-black border-primary"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                }`}
                data-testid={`pill-genre-${g}`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        {/* Total Duration — 6 large cards */}
        <div className="mt-6">
          <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Total Duration
          </h3>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {DURATIONS.map((d) => {
              const active = durationKey === d.key;
              return (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => setDurationKey(d.key)}
                  className={`text-left p-3 rounded-md border transition-colors ${
                    active
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                  }`}
                  data-testid={`duration-card-${d.key}`}
                >
                  <div className="font-display text-2xl tracking-tight">
                    {d.label}
                  </div>
                  <div
                    className={`text-[10px] font-mono uppercase tracking-widest mt-1 ${
                      active ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    {d.seconds === null
                      ? "min + sec"
                      : `${Math.max(1, Math.ceil(d.seconds / 15))} parts`}
                  </div>
                </button>
              );
            })}
          </div>
          {durationKey === "custom" && (
            <div className="mt-3 flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-muted-foreground">
                Min
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={customMin}
                  onChange={(e) =>
                    setCustomMin(Math.max(0, Number(e.target.value || 0)))
                  }
                  className="w-16 bg-background border border-border rounded-md p-2 text-sm focus:outline-none focus:border-primary"
                  data-testid="input-custom-min"
                />
              </label>
              <label className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-muted-foreground">
                Sec
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={customSec}
                  onChange={(e) =>
                    setCustomSec(
                      Math.max(0, Math.min(59, Number(e.target.value || 0))),
                    )
                  }
                  className="w-16 bg-background border border-border rounded-md p-2 text-sm focus:outline-none focus:border-primary"
                  data-testid="input-custom-sec"
                />
              </label>
              <span className="text-xs font-mono text-muted-foreground">
                = {totalDurationSeconds}s · {partsCount} parts
              </span>
            </div>
          )}
        </div>

        {/* Visual Style — 4 col grid */}
        <div className="mt-6">
          <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Visual Style
          </h3>
          <div className="mt-3 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {STYLES.map((s) => {
              const active = styleName === s.name;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setStyleName(s.name)}
                  className={`text-left p-3 rounded-md border-t-4 border-l border-r border-b transition-colors ${
                    active
                      ? "border-l-primary border-r-primary border-b-primary bg-primary/10"
                      : "border-l-border border-r-border border-b-border hover:border-l-foreground/30 hover:border-r-foreground/30 hover:border-b-foreground/30"
                  }`}
                  style={{ borderTopColor: s.accent }}
                  data-testid={`style-card-${s.key}`}
                >
                  <div className="font-display text-base tracking-tight">
                    {s.name}
                  </div>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-1">
                    {s.description}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* VO language */}
        <div className="mt-6">
          <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Volume2 className="w-3 h-3" /> Voiceover Language
          </h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {VO_OPTIONS.map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => setVoLanguage(o.key)}
                className={`px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-widest border transition-colors ${
                  voLanguage === o.key
                    ? "bg-primary text-black border-primary"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                } ${o.key === "hindi" ? "font-devanagari" : ""}`}
                style={
                  o.key === "hindi"
                    ? {
                        fontFamily:
                          "var(--app-font-devanagari, 'Noto Sans Devanagari', sans-serif)",
                      }
                    : undefined
                }
                data-testid={`vo-option-${o.key}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Summary line */}
        <div
          className="mt-6 px-3 py-2 rounded-md border border-border bg-background text-xs font-mono text-muted-foreground"
          data-testid="generate-summary"
        >
          {totalDurationSeconds}s ·{" "}
          <span className="text-foreground">{styleName ?? "no style"}</span> ·{" "}
          <span className="text-foreground">
            {voLanguage === "none" ? "no voiceover" : voLanguage}
          </span>{" "}
          · {partsCount} part{partsCount === 1 ? "" : "s"}
        </div>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={storyCall.loading || !canGenerate}
          className="mt-6 w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-md bg-primary text-black font-mono text-xs uppercase tracking-widest hover:bg-[#D4EB3A] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          data-testid="button-generate-story"
        >
          {storyCall.loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Writing your story…
            </>
          ) : !brief.trim() ? (
            <>Add a brief</>
          ) : !styleName ? (
            <>Pick a style</>
          ) : (
            <>
              <Sparkles className="w-4 h-4" /> Generate story
            </>
          )}
        </button>

        {storyCall.error && (
          <div className="mt-4">
            <ErrorCard message={storyCall.error} onRetry={handleGenerate} />
          </div>
        )}
      </section>

      {/* Step 2 — story display */}
      {storyCall.loading && !story && (
        <div className="mt-8 space-y-3">
          <Skel className="h-10 w-2/3" />
          <Skel className="h-4 w-full" />
          <Skel className="h-4 w-5/6" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-6">
            <Skel className="h-32" />
            <Skel className="h-32" />
            <Skel className="h-32" />
          </div>
        </div>
      )}

      {story && (
        <section className="mt-10">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="flex-1 min-w-0">
              <h2
                className="font-display text-4xl md:text-5xl tracking-tight"
                data-testid="story-title"
              >
                {story.title}
              </h2>
              <p
                className="mt-3 text-base text-muted-foreground max-w-2xl"
                data-testid="story-synopsis"
              >
                {story.synopsis}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <CopyButton
                text={`${story.title}\n\n${story.synopsis}\n\n${story.acts
                  .map(
                    (a) =>
                      `Act ${a.actNumber}: ${a.title}\n${a.description}\nKey moment: ${a.keyMoment}`,
                  )
                  .join("\n\n")}`}
                label="Copy story"
                testId="button-copy-story"
              />
            </div>
          </div>

          <div className="mt-8">
            <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-3">
              Acts Timeline
            </h3>
            <div className="flex gap-3 overflow-x-auto pb-3 -mx-2 px-2">
              {story.acts.map((act) => (
                <div
                  key={act.actNumber}
                  className="min-w-[260px] max-w-[320px] border border-border rounded-md p-4 bg-card flex-shrink-0"
                  data-testid={`act-${act.actNumber}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-primary">
                      Act {act.actNumber}
                    </span>
                  </div>
                  <h4 className="mt-1 font-display text-2xl tracking-tight">
                    {act.title}
                  </h4>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {act.description}
                  </p>
                  <div className="mt-3 border-t border-border pt-3">
                    <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                      Key moment
                    </div>
                    <p className="text-xs text-foreground mt-1">
                      {act.keyMoment}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="border border-border rounded-md p-4 bg-card md:col-span-1">
              <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                Characters
              </h3>
              <ul className="mt-3 space-y-3">
                {story.characters.map((c) => (
                  <li key={c.name}>
                    <div className="font-display text-lg tracking-tight">
                      {c.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {c.description}
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="border border-border rounded-md p-4 bg-card">
              <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                Mood
              </h3>
              <p className="mt-3 text-sm">{story.mood}</p>

              <h3 className="mt-5 font-mono text-xs uppercase tracking-widest text-muted-foreground">
                Color Palette
              </h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {story.colorPalette.map((hex) => (
                  <div
                    key={hex}
                    className="flex items-center gap-2 border border-border rounded-md px-2 py-1"
                  >
                    <span
                      className="w-4 h-4 rounded-sm border border-border"
                      style={{ background: hex }}
                    />
                    <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                      {hex}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-border rounded-md p-4 bg-card">
              <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                Music Suggestion
              </h3>
              <p className="mt-3 text-sm">{story.musicSuggestion}</p>
            </div>
          </div>

          {/* Confirmation strip + actions */}
          <div
            className="mt-8 flex flex-wrap items-center gap-3 px-4 py-3 rounded-md border border-border bg-card"
            data-testid="post-story-strip"
          >
            <div className="text-[10px] font-mono uppercase tracking-widest text-primary">
              Story ready
            </div>
            <span className="text-muted-foreground/40">·</span>
            <div className="font-mono text-xs uppercase tracking-widest text-foreground">
              {styleName ?? "no style"}
            </div>
            <span className="text-muted-foreground/40">·</span>
            <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              {totalDurationSeconds}s · {partsCount} parts
            </div>
            {voLanguage !== "none" && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <div
                  className="font-mono text-xs uppercase tracking-widest text-emerald-300"
                  data-testid="post-story-vo"
                >
                  VO: {voLanguage}
                </div>
              </>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={storyCall.loading}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-md border border-border font-mono text-xs uppercase tracking-widest hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
              data-testid="button-regenerate"
            >
              <Sparkles className="w-4 h-4" /> Regenerate
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-md border border-border font-mono text-xs uppercase tracking-widest hover:border-primary hover:text-primary transition-colors"
              data-testid="button-save-story"
            >
              <Save className="w-4 h-4" /> Save to project
            </button>
            <button
              type="button"
              onClick={handleStartPrompts}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-md bg-primary text-black font-mono text-xs uppercase tracking-widest hover:bg-[#D4EB3A] transition-colors"
              data-testid="button-to-prompts"
            >
              Generate video prompts <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-10 border border-border rounded-md p-6 bg-card">
            <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <BookOpen className="w-3.5 h-3.5" /> Continue this story
            </h3>
            <textarea
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
              placeholder="What direction should the next acts take?"
              rows={2}
              className="mt-3 w-full bg-background border border-border rounded-md p-3 text-sm focus:outline-none focus:border-primary"
              data-testid="input-direction"
            />
            <button
              type="button"
              onClick={handleContinue}
              disabled={continueCall.loading}
              className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-md border border-border font-mono text-xs uppercase tracking-widest hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
              data-testid="button-continue-story"
            >
              {continueCall.loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Extending…
                </>
              ) : (
                <>Add more acts</>
              )}
            </button>
            {continueCall.error && (
              <div className="mt-4">
                <ErrorCard
                  message={continueCall.error}
                  onRetry={handleContinue}
                />
              </div>
            )}
          </div>
        </section>
      )}

      {/* Inline Prompts panel */}
      {showPrompts && project?.story && styleName && (
        <InlinePrompts
          project={project}
          style={styleName}
          partsCount={partsCount}
          initialVoiceoverLanguage={voLanguage}
          onProjectUpdated={(p) => setProject(p)}
        />
      )}
    </div>
  );
}

function Skel({ className }: { className?: string }) {
  return (
    <div
      className={`bg-secondary/40 rounded-md animate-pulse ${className ?? ""}`}
    />
  );
}
