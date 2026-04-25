import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, Save, Sparkles, ArrowRight, BookOpen } from "lucide-react";
import { toast } from "sonner";
import {
  useGenerateStory,
  useContinueStory,
} from "@workspace/api-client-react";
import { storage, createEmptyProject, GENRES, type Project } from "@/lib/storage";
import { useApiCall, mutationCaller } from "@/lib/api-call";
import { ErrorCard } from "@/components/error-card";
import { CopyButton } from "@/components/copy-button";

const DURATIONS = [5, 10, 15, 20, 30, 60];

export default function StoryBuilder() {
  const [, navigate] = useLocation();
  const [brief, setBrief] = useState("");
  const [genre, setGenre] = useState("Drama");
  const [duration, setDuration] = useState(30);
  const [project, setProject] = useState<Project | null>(null);
  const [direction, setDirection] = useState("");

  const generateStoryMut = useGenerateStory();
  const continueStoryMut = useContinueStory();
  const storyCall = useApiCall(mutationCaller(generateStoryMut.mutateAsync));
  const continueCall = useApiCall(
    mutationCaller(continueStoryMut.mutateAsync),
  );

  useEffect(() => {
    const current = storage.getCurrentProject();
    if (current) {
      setProject(current);
      setBrief(current.brief);
      setGenre(current.genre);
      setDuration(current.totalDuration);
      if (current.story) {
        storyCall.setData(current.story);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGenerate = async () => {
    if (!brief.trim()) {
      toast.error("Add a brief first");
      return;
    }
    const result = await storyCall.run({ brief, genre, duration });
    if (result) {
      toast.success("Story generated");
    }
  };

  const handleSave = () => {
    if (!storyCall.data) return;
    const story = storyCall.data;
    let p = project;
    if (!p) {
      p = createEmptyProject({
        title: story.title,
        brief,
        genre,
        totalDuration: duration,
      });
    } else {
      p = { ...p, title: story.title, brief, genre, totalDuration: duration };
    }
    p.story = story;
    const saved = storage.saveProject(p);
    storage.setCurrentProjectId(saved.id);
    setProject(saved);
    window.dispatchEvent(new Event("cs:projects-changed"));
    toast.success("Project saved");
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
          Step {story ? "2" : "1"} of 2
        </div>
        <h1 className="font-display text-4xl md:text-5xl tracking-tight mt-1">
          Story Builder
        </h1>
      </div>

      {/* Step 1 — brief input (always visible, collapsible vibe) */}
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

        <div className="mt-5">
          <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Total Duration
          </h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {DURATIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDuration(d)}
                className={`px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-widest border transition-colors ${
                  duration === d
                    ? "bg-primary text-black border-primary"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                }`}
                data-testid={`pill-duration-${d}`}
              >
                {d}s
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={storyCall.loading}
          className="mt-6 w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-md bg-primary text-black font-mono text-xs uppercase tracking-widest hover:bg-[#D4EB3A] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          data-testid="button-generate-story"
        >
          {storyCall.loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Writing your story…
            </>
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

          <div className="mt-8 flex flex-wrap gap-3">
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
              onClick={() => {
                handleSave();
                navigate("/generate");
              }}
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
