import { Link, useLocation } from "wouter";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Video,
  Play,
  Mic,
  LayoutTemplate,
  Volume2,
  X,
} from "lucide-react";
import {
  storage,
  styleAccent,
  type Project,
  type VoiceoverLanguage,
} from "@/lib/storage";

interface Template {
  key: string;
  title: string;
  blurb: string;
  prefill: {
    brief: string;
    genre: string;
    totalDurationSeconds: number;
    style: string;
    voiceoverLanguage: VoiceoverLanguage;
  };
}

const TEMPLATES: Template[] = [
  {
    key: "product-launch-ad",
    title: "Product Launch Ad",
    blurb: "30s · Live Action Cinematic · Hinglish VO",
    prefill: {
      brief:
        "A bold 30-second product reveal — the new product cuts through chaos in a city, snapping the audience to attention with confident swagger and unmissable detail shots.",
      genre: "Drama",
      totalDurationSeconds: 30,
      style: "Live Action Cinematic",
      voiceoverLanguage: "hinglish",
    },
  },
  {
    key: "cinematic-travel-reel",
    title: "Cinematic Travel Reel",
    blurb: "1 min · Live Action Cinematic · No VO",
    prefill: {
      brief:
        "A 1-minute cinematic travel reel through coastal mountains and golden-hour streets — wide vistas, intimate locals, sweeping movement, scored to a hopeful track.",
      genre: "Adventure",
      totalDurationSeconds: 60,
      style: "Live Action Cinematic",
      voiceoverLanguage: "none",
    },
  },
  {
    key: "anime-short",
    title: "Anime Short",
    blurb: "30s · Anime 2D · No VO",
    prefill: {
      brief:
        "A 30-second anime short: a young protagonist sprints through neon Tokyo rain to deliver a single envelope before midnight. Bold linework, dynamic camera, dramatic lighting.",
      genre: "Action",
      totalDurationSeconds: 30,
      style: "Anime 2D",
      voiceoverLanguage: "none",
    },
  },
  {
    key: "brand-film",
    title: "Brand Film",
    blurb: "2 min · Live Action Cinematic · English VO",
    prefill: {
      brief:
        "A 2-minute brand film weaving customer stories with founder narration. Real people, real moments, building to a quiet declaration of why the brand exists.",
      genre: "Drama",
      totalDurationSeconds: 120,
      style: "Live Action Cinematic",
      voiceoverLanguage: "english",
    },
  },
  {
    key: "horror-short",
    title: "Horror Short",
    blurb: "1 min · Horror Atmospheric · No VO",
    prefill: {
      brief:
        "A 1-minute slow-creep horror short: a lone figure in a too-quiet apartment gradually realises the layout has changed since they fell asleep.",
      genre: "Horror",
      totalDurationSeconds: 60,
      style: "Horror Atmospheric",
      voiceoverLanguage: "none",
    },
  },
  {
    key: "motivational-reel",
    title: "Motivational Reel",
    blurb: "30s · Music Video Hyper · Hindi VO",
    prefill: {
      brief:
        "30 सेकंड का motivational reel — सुबह 5 बजे की तैयारी, पसीना, ज़िद, और एक छोटी सी जीत। तेज़ कट, energetic music, और एक यादगार आख़िरी फ्रेम।",
      genre: "Drama",
      totalDurationSeconds: 30,
      style: "Music Video Hyper",
      voiceoverLanguage: "hindi",
    },
  },
];

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [, navigate] = useLocation();

  useEffect(() => {
    setProjects(storage.getProjects());
  }, []);

  const totalShots = projects.reduce(
    (sum, p) => sum + p.parts.reduce((s, part) => s + part.shots.length, 0),
    0,
  );
  const styleCounts = projects.reduce<Record<string, number>>((acc, p) => {
    if (p.style) acc[p.style] = (acc[p.style] ?? 0) + 1;
    return acc;
  }, {});
  const mostUsedStyle =
    Object.entries(styleCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

  const recent = [...projects]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 6);

  const applyTemplate = (t: Template) => {
    sessionStorage.setItem("cs_template", JSON.stringify(t.prefill));
    storage.setCurrentProjectId(null);
    setTemplatesOpen(false);
    navigate("/story");
  };

  return (
    <div className="px-4 py-8 md:px-12 md:py-14 max-w-6xl mx-auto">
      <div className="border-b border-border pb-10">
        <h1
          className="font-display text-5xl md:text-7xl leading-[0.95] tracking-tight text-foreground"
          data-testid="hero-heading"
        >
          Turn stories into
          <br />
          <span className="text-primary">cinematic prompts</span>
        </h1>
        <p className="mt-4 text-base md:text-lg text-muted-foreground max-w-xl">
          AI-powered shot lists for Seedance 2.0 — copy, paste, generate.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/story"
            onClick={() => storage.setCurrentProjectId(null)}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-md bg-primary text-black font-mono text-xs uppercase tracking-widest hover:bg-[#D4EB3A] transition-colors"
            data-testid="cta-new-project"
          >
            Start new project <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/history"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-md border border-border font-mono text-xs uppercase tracking-widest hover:border-primary hover:text-primary transition-colors"
            data-testid="cta-history"
          >
            View history
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-10">
        <Stat label="Total Projects" value={projects.length.toString()} />
        <Stat label="Shots Generated" value={totalShots.toString()} />
        <Stat label="Most Used Style" value={mostUsedStyle} />
      </div>

      <h2 className="mt-14 font-display text-3xl tracking-tight">
        Quick Start
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
        <QuickCard
          href="/story"
          icon={BookOpen}
          title="New Story"
          desc="Brief → 3-act story with characters and palette"
          testId="quick-story"
          onClick={() => storage.setCurrentProjectId(null)}
        />
        <QuickCard
          href="/generate"
          icon={Video}
          title="Quick Video"
          desc="Skip the story — go straight to shot list"
          testId="quick-prompt"
        />
        <QuickCard
          href="/voiceover"
          icon={Mic}
          title="Voiceover"
          desc="English / Hindi / Hinglish scripts"
          testId="quick-voiceover"
        />
        <button
          type="button"
          onClick={() => setTemplatesOpen(true)}
          className="border border-border rounded-md p-4 hover:border-primary group transition-colors text-left"
          data-testid="quick-templates"
        >
          <LayoutTemplate className="w-5 h-5 text-primary" />
          <div className="mt-3 font-display text-xl tracking-tight group-hover:text-primary">
            From Template
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Pick a preset and start in one click
          </div>
        </button>
      </div>

      <div className="mt-14 flex items-center justify-between">
        <h2 className="font-display text-3xl tracking-tight">
          Recent Projects
        </h2>
        <Link
          href="/history"
          className="text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-primary"
        >
          View all →
        </Link>
      </div>

      {recent.length === 0 ? (
        <div className="mt-4 border border-border rounded-md p-10 text-center text-muted-foreground">
          <Play className="w-8 h-8 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-mono uppercase tracking-widest">
            No projects yet
          </p>
          <p className="text-xs mt-2">
            Start a new story to fill this space.
          </p>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {recent.map((p) => {
            const accent = styleAccent(p.style);
            return (
              <Link
                key={p.id}
                href={`/history?id=${p.id}`}
                className="block border border-border rounded-md p-4 hover:border-primary transition-colors group"
                data-testid={`recent-card-${p.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-display text-xl tracking-tight group-hover:text-primary truncate">
                    {p.title}
                  </h3>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                  {p.style && (
                    <span
                      className="px-2 py-0.5 rounded border-l-2"
                      style={{
                        borderLeftColor: accent,
                        borderTop: "1px solid hsl(var(--border))",
                        borderRight: "1px solid hsl(var(--border))",
                        borderBottom: "1px solid hsl(var(--border))",
                        color: accent,
                      }}
                      data-testid={`recent-style-chip-${p.id}`}
                    >
                      {p.style}
                    </span>
                  )}
                  <span className="px-2 py-0.5 border border-border rounded">
                    {p.totalDurationSeconds ?? p.totalDuration}s
                  </span>
                  <span className="px-2 py-0.5 border border-border rounded">
                    {p.parts.length} part{p.parts.length === 1 ? "" : "s"}
                  </span>
                  {p.voiceoverLanguage && p.voiceoverLanguage !== "none" && (
                    <span
                      className="px-2 py-0.5 rounded border border-emerald-500/40 text-emerald-300 inline-flex items-center gap-1"
                      data-testid={`recent-vo-chip-${p.id}`}
                    >
                      <Volume2 className="w-2.5 h-2.5" /> VO ·{" "}
                      {p.voiceoverLanguage}
                    </span>
                  )}
                </div>
                <div className="mt-3 text-[11px] text-muted-foreground/70 font-mono">
                  {new Date(p.updatedAt).toLocaleString()}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {templatesOpen && (
        <div
          className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setTemplatesOpen(false)}
          data-testid="templates-modal"
        >
          <div
            className="bg-card border border-border rounded-md max-w-3xl w-full max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-card">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-primary">
                  Templates
                </div>
                <h3 className="mt-1 font-display text-2xl tracking-tight">
                  Start from a preset
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setTemplatesOpen(false)}
                className="text-muted-foreground hover:text-foreground"
                data-testid="templates-close"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
              {TEMPLATES.map((t) => {
                const accent = styleAccent(t.prefill.style);
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => applyTemplate(t)}
                    className="text-left border-l-4 border-r border-t border-b border-border rounded-md p-4 hover:border-r-primary hover:border-t-primary hover:border-b-primary transition-colors"
                    style={{ borderLeftColor: accent }}
                    data-testid={`template-${t.key}`}
                  >
                    <div className="font-display text-lg tracking-tight">
                      {t.title}
                    </div>
                    <div className="mt-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                      {t.blurb}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground line-clamp-2">
                      {t.prefill.brief}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border rounded-md p-4 bg-card">
      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 font-display text-3xl tracking-tight text-foreground truncate">
        {value}
      </div>
    </div>
  );
}

function QuickCard({
  href,
  icon: Icon,
  title,
  desc,
  testId,
  onClick,
}: {
  href: string;
  icon: React.ElementType;
  title: string;
  desc: string;
  testId: string;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="border border-border rounded-md p-4 hover:border-primary group transition-colors"
      data-testid={testId}
    >
      <Icon className="w-5 h-5 text-primary" />
      <div className="mt-3 font-display text-xl tracking-tight group-hover:text-primary">
        {title}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{desc}</div>
    </Link>
  );
}
