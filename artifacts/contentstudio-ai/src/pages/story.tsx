import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  Loader2,
  Play,
  ArrowRight,
  Volume2,
  CheckCircle2,
  RefreshCw,
  Send,
  Lock,
  Unlock,
  User,
  MessageCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  useGenerateStory,
  useContinueStory,
  type StoryResponse,
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
  seconds: number | null;
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

type ChatMessage =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; text: string; story: StoryResponse };

function newMsgId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function StoryBuilder() {
  const [, _navigate] = useLocation();
  void _navigate;
  const [brief, setBrief] = useState("");
  const [genre, setGenre] = useState("Drama");
  const [durationKey, setDurationKey] = useState<string>("30s");
  const [customMin, setCustomMin] = useState(0);
  const [customSec, setCustomSec] = useState(45);
  const [styleName, setStyleName] = useState<string | null>(null);
  const [voLanguage, setVoLanguage] = useState<VoiceoverLanguage>("none");
  const [project, setProject] = useState<Project | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [finalized, setFinalized] = useState(false);
  const [showPrompts, setShowPrompts] = useState(false);
  const [autoStartGen, setAutoStartGen] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const generateStoryMut = useGenerateStory();
  const continueStoryMut = useContinueStory();
  const storyCall = useApiCall(mutationCaller(generateStoryMut.mutateAsync));
  const continueCall = useApiCall(
    mutationCaller(continueStoryMut.mutateAsync),
  );

  const totalDurationSeconds = useMemo(() => {
    const preset = DURATIONS.find((d) => d.key === durationKey);
    if (!preset) return 30;
    if (preset.seconds !== null) return preset.seconds;
    return Math.max(15, customMin * 60 + customSec);
  }, [durationKey, customMin, customSec]);

  const partsCount = useMemo(
    () => Math.max(1, Math.ceil(totalDurationSeconds / 15)),
    [totalDurationSeconds],
  );

  // Scroll chat to bottom on new message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, storyCall.loading, continueCall.loading]);

  useEffect(() => {
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
        setMessages([
          {
            id: newMsgId(),
            role: "user",
            text: current.brief,
          },
          {
            id: newMsgId(),
            role: "assistant",
            text: "Here's your story.",
            story: current.story,
          },
        ]);
        // If parts already exist, treat as finalized
        if (current.parts.length > 0) {
          setFinalized(true);
          setShowPrompts(true);
        }
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
      storage.setCurrentProjectId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const latestStory: StoryResponse | null = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === "assistant") return m.story;
    }
    return null;
  }, [messages]);

  const persistProject = (story: StoryResponse, existing?: Project | null): Project => {
    let next = existing ?? project;
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

  const canGenerate =
    brief.trim().length > 0 && styleName !== null && totalDurationSeconds > 0;

  const handleGenerateInitial = async () => {
    if (!brief.trim()) {
      toast.error("Add a brief first");
      return;
    }
    if (!styleName) {
      toast.error("Pick a visual style");
      return;
    }
    // Reset chat
    setMessages([{ id: newMsgId(), role: "user", text: brief }]);
    setFinalized(false);
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
      setMessages((m) => [
        ...m,
        {
          id: newMsgId(),
          role: "assistant",
          text: "Here's your story. Read it through, then send any tweaks — \"make act 2 darker\", \"add a twist ending\", \"change the protagonist to a woman\", etc. When you're happy, hit Finalize.",
          story: result,
        },
      ]);
      persistProject(result);
      toast.success("Story generated");
    }
  };

  const handleSendChat = async () => {
    if (finalized) {
      toast.error("Story is locked. Unlock to keep editing.");
      return;
    }
    const text = chatInput.trim();
    if (!text) return;
    if (!latestStory) {
      toast.error("Generate the story first");
      return;
    }
    setChatInput("");
    setMessages((m) => [...m, { id: newMsgId(), role: "user", text }]);
    const result = await continueCall.run({
      existingStory: latestStory,
      direction: text,
    });
    if (result) {
      setMessages((m) => [
        ...m,
        {
          id: newMsgId(),
          role: "assistant",
          text: "Updated. Anything else?",
          story: result,
        },
      ]);
      persistProject(result);
    }
  };

  const handleFinalize = () => {
    if (!latestStory) return;
    persistProject(latestStory);
    setFinalized(true);
    setShowPrompts(true);
    setAutoStartGen(true);
    requestAnimationFrame(() => {
      const el = document.querySelector(
        '[data-testid="inline-prompts-section"]',
      );
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    toast.success("Story finalized — generating video prompts now…");
  };

  const handleUnlock = () => {
    setFinalized(false);
    setShowPrompts(false);
    toast.message("Story unlocked — keep editing");
  };

  const handleResetChat = () => {
    setMessages([]);
    setFinalized(false);
    setShowPrompts(false);
    storyCall.setData(null);
    continueCall.setData(null);
  };

  return (
    <div className="px-4 py-8 md:px-12 md:py-14 max-w-6xl mx-auto">
      <div className="mb-8">
        <div className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
          {finalized
            ? "Step 3 of 3 — generate prompts"
            : latestStory
              ? "Step 2 of 3 — refine in chat"
              : "Step 1 of 3 — brief"}
        </div>
        <h1 className="font-display text-4xl md:text-5xl tracking-tight mt-1">
          Story Builder
        </h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
          Set your brief, style and voiceover, then iterate with the AI as a
          chat. When the story feels right, finalize and turn it into video
          prompts.
        </p>
      </div>

      {/* Brief / setup section — collapses into a summary once a story exists */}
      {!latestStory ? (
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
                  data-testid={`vo-option-${o.key}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div
            className="mt-6 px-3 py-2 rounded-md border border-border bg-background text-xs font-mono text-muted-foreground"
            data-testid="generate-summary"
          >
            {totalDurationSeconds}s ·{" "}
            <span className="text-foreground">{styleName ?? "no style"}</span>{" "}
            ·{" "}
            <span className="text-foreground">
              {voLanguage === "none" ? "no voiceover" : voLanguage}
            </span>{" "}
            · {partsCount} part{partsCount === 1 ? "" : "s"}
          </div>

          <button
            type="button"
            onClick={handleGenerateInitial}
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
                <Play className="w-4 h-4" /> Start the story
              </>
            )}
          </button>

          {storyCall.error && (
            <div className="mt-4">
              <ErrorCard
                message={storyCall.error}
                onRetry={handleGenerateInitial}
              />
            </div>
          )}
        </section>
      ) : (
        // Compact summary chip strip when chat is active
        <section
          className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-md border border-border bg-card"
          data-testid="setup-summary"
        >
          <div className="text-[10px] font-mono uppercase tracking-widest text-primary">
            {finalized ? "Locked" : "Brief"}
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
          <div className="flex-1" />
          <button
            type="button"
            onClick={handleResetChat}
            className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-primary"
            data-testid="button-new-brief"
          >
            <RefreshCw className="w-3 h-3 inline mr-1" /> New brief
          </button>
        </section>
      )}

      {/* Chat thread */}
      {messages.length > 0 && (
        <section className="mt-6 border border-border rounded-md bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-primary" />
            <div className="text-[10px] font-mono uppercase tracking-widest text-primary">
              Story Chat
            </div>
            {finalized && (
              <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-primary">
                <Lock className="w-3 h-3" /> Finalized
              </span>
            )}
          </div>
          <div
            className="px-4 py-4 space-y-4 max-h-[640px] overflow-y-auto"
            data-testid="chat-messages"
          >
            {messages.map((m) =>
              m.role === "user" ? (
                <UserBubble key={m.id} text={m.text} />
              ) : (
                <AssistantBubble key={m.id} text={m.text} story={m.story} />
              ),
            )}
            {(storyCall.loading || continueCall.loading) && (
              <div
                className="flex items-center gap-2 text-xs font-mono text-muted-foreground"
                data-testid="chat-typing"
              >
                <Loader2 className="w-3 h-3 animate-spin text-primary" />
                <span className="opacity-80">AI is writing…</span>
              </div>
            )}
            {continueCall.error && (
              <ErrorCard
                message={continueCall.error}
                onRetry={() => {
                  // Try last user instruction again
                  const lastUser = [...messages]
                    .reverse()
                    .find((x) => x.role === "user");
                  if (lastUser && latestStory) {
                    continueCall.run({
                      existingStory: latestStory,
                      direction: lastUser.text,
                    });
                  }
                }}
              />
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Chat composer */}
          <div className="border-t border-border p-3 flex items-end gap-2">
            <textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              disabled={finalized || continueCall.loading}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendChat();
                }
              }}
              placeholder={
                finalized
                  ? "Story is locked. Unlock to keep editing."
                  : 'Tweak the story… e.g. "make act 2 more tense" or "add a twist ending"'
              }
              rows={2}
              className="flex-1 bg-background border border-border rounded-md p-3 text-sm resize-none focus:outline-none focus:border-primary disabled:opacity-50 placeholder:text-muted-foreground/60"
              data-testid="chat-input"
            />
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={handleSendChat}
                disabled={
                  finalized ||
                  continueCall.loading ||
                  chatInput.trim().length === 0
                }
                className="inline-flex items-center gap-1 px-3 py-2 rounded-md bg-primary text-black font-mono text-xs uppercase tracking-widest hover:bg-[#D4EB3A] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                data-testid="button-send-chat"
              >
                <Send className="w-3.5 h-3.5" />
                Send
              </button>
              {!finalized && latestStory && (
                <button
                  type="button"
                  onClick={handleFinalize}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-md border border-primary text-primary font-mono text-xs uppercase tracking-widest hover:bg-primary hover:text-black transition-colors"
                  data-testid="button-finalize-story"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Finalize
                </button>
              )}
              {finalized && (
                <button
                  type="button"
                  onClick={handleUnlock}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-md border border-border font-mono text-xs uppercase tracking-widest text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                  data-testid="button-unlock-story"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  Unlock
                </button>
              )}
            </div>
          </div>

          {finalized && !showPrompts && (
            <div className="border-t border-border px-4 py-3">
              <button
                type="button"
                onClick={() => setShowPrompts(true)}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-md bg-primary text-black font-mono text-xs uppercase tracking-widest hover:bg-[#D4EB3A] transition-colors"
                data-testid="button-to-prompts"
              >
                Generate video prompts <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </section>
      )}

      {/* Inline Prompts panel — shown after finalize, auto-starts generation */}
      {showPrompts && project?.story && styleName && (
        <InlinePrompts
          project={project}
          style={styleName}
          partsCount={partsCount}
          initialVoiceoverLanguage={voLanguage}
          onProjectUpdated={(p) => setProject(p)}
          autoStart={autoStartGen}
        />
      )}
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3" data-testid="chat-bubble-user">
      <div className="w-7 h-7 shrink-0 rounded-full bg-secondary border border-border flex items-center justify-center">
        <User className="w-3.5 h-3.5 text-muted-foreground" />
      </div>
      <div className="flex-1 max-w-[80%] rounded-md rounded-tl-sm bg-background border border-border px-3 py-2 text-sm whitespace-pre-wrap">
        {text}
      </div>
    </div>
  );
}

function AssistantBubble({
  text,
  story,
}: {
  text: string;
  story: StoryResponse;
}) {
  return (
    <div className="flex items-start gap-3" data-testid="chat-bubble-assistant">
      <div className="w-7 h-7 shrink-0 rounded-full bg-primary/15 border border-primary/40 flex items-center justify-center">
        <MessageCircle className="w-3.5 h-3.5 text-primary" />
      </div>
      <div className="flex-1 space-y-3">
        <div className="rounded-md rounded-tl-sm bg-background border border-border px-3 py-2 text-sm">
          {text}
        </div>
        <StoryCard story={story} />
      </div>
    </div>
  );
}

function StoryCard({ story }: { story: StoryResponse }) {
  return (
    <div
      className="rounded-md border border-border bg-background overflow-hidden"
      data-testid="story-card"
    >
      <div className="px-4 py-3 border-b border-border flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3
            className="font-display text-2xl md:text-3xl tracking-tight"
            data-testid="story-title"
          >
            {story.title}
          </h3>
          <p
            className="mt-1 text-xs text-muted-foreground line-clamp-3"
            data-testid="story-synopsis"
          >
            {story.synopsis}
          </p>
        </div>
        <CopyButton
          text={`${story.title}\n\n${story.synopsis}\n\n${story.acts
            .map(
              (a) =>
                `Act ${a.actNumber}: ${a.title}\n${a.description}\nKey moment: ${a.keyMoment}`,
            )
            .join("\n\n")}`}
          label="Copy"
          testId="button-copy-story"
        />
      </div>

      <div className="px-4 py-4">
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
          Acts
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
          {story.acts.map((act) => (
            <div
              key={act.actNumber}
              className="min-w-[220px] max-w-[280px] border border-border rounded-md p-3 bg-card flex-shrink-0"
              data-testid={`act-${act.actNumber}`}
            >
              <div className="text-[10px] font-mono uppercase tracking-widest text-primary">
                Act {act.actNumber}
              </div>
              <h4 className="mt-1 font-display text-base tracking-tight">
                {act.title}
              </h4>
              <p className="mt-1 text-[11px] text-muted-foreground line-clamp-3">
                {act.description}
              </p>
              <div className="mt-2 border-t border-border pt-2">
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                  Key moment
                </div>
                <p className="text-[11px] text-foreground mt-1 line-clamp-2">
                  {act.keyMoment}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-2">
          <div className="border border-border rounded-md p-3 bg-card">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Characters
            </div>
            <ul className="mt-2 space-y-1.5">
              {story.characters.map((c) => (
                <li key={c.name} className="text-[11px]">
                  <span className="font-display text-sm">{c.name}</span>
                  <span className="text-muted-foreground"> · {c.description}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="border border-border rounded-md p-3 bg-card">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Mood
            </div>
            <p className="mt-2 text-xs">{story.mood}</p>
            <div className="mt-3 flex flex-wrap gap-1">
              {story.colorPalette.map((hex) => (
                <span
                  key={hex}
                  className="w-4 h-4 rounded-sm border border-border"
                  style={{ background: hex }}
                  title={hex}
                />
              ))}
            </div>
          </div>
          <div className="border border-border rounded-md p-3 bg-card">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Music
            </div>
            <p className="mt-2 text-xs">{story.musicSuggestion}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
