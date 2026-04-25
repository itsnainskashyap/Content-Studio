import { Link } from "wouter";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Video,
  Sparkles,
  Music,
  Mic,
} from "lucide-react";
import { storage, type Project } from "@/lib/storage";

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);

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

  return (
    <div className="px-6 py-10 md:px-12 md:py-14 max-w-6xl mx-auto">
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
        />
        <QuickCard
          href="/generate"
          icon={Video}
          title="Quick Prompt"
          desc="Skip the story — go straight to shot list"
          testId="quick-prompt"
        />
        <QuickCard
          href="/music"
          icon={Music}
          title="Music Brief"
          desc="Suno + Udio prompts for your story"
          testId="quick-music"
        />
        <QuickCard
          href="/voiceover"
          icon={Mic}
          title="Voiceover"
          desc="English / Hindi / Hinglish scripts"
          testId="quick-voiceover"
        />
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
          <Sparkles className="w-8 h-8 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-mono uppercase tracking-widest">
            No projects yet
          </p>
          <p className="text-xs mt-2">
            Start a new story to fill this space.
          </p>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {recent.map((p) => (
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
                  <span className="px-2 py-0.5 border border-border rounded">
                    {p.style}
                  </span>
                )}
                <span className="px-2 py-0.5 border border-border rounded">
                  {p.totalDuration}s
                </span>
                <span className="px-2 py-0.5 border border-border rounded">
                  {p.parts.length} part{p.parts.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="mt-3 text-[11px] text-muted-foreground/70 font-mono">
                {new Date(p.updatedAt).toLocaleString()}
              </div>
            </Link>
          ))}
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
}: {
  href: string;
  icon: React.ElementType;
  title: string;
  desc: string;
  testId: string;
}) {
  return (
    <Link
      href={href}
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
