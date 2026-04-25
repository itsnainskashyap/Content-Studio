import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowRight,
  Play,
  CheckCircle2,
  ChevronDown,
  Quote,
  Triangle,
  Square,
  Circle,
  Hexagon,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { BrandLogo } from "@/components/brand-logo";

export default function Landing() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [scrollY, setScrollY] = useState(0);
  const heroRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handler = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  // Reveal-on-scroll for sections
  useEffect(() => {
    const sections = document.querySelectorAll("[data-reveal]");
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("revealed");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.15 },
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);

  const goCTA = () => {
    if (user) navigate("/app");
    else navigate("/login");
  };

  return (
    <div className="cs-landing" data-testid="page-landing">
      {/* Top nav */}
      <header className="landing-nav">
        <div className="landing-nav-inner">
          <Link href="/" className="landing-brand" data-testid="landing-brand">
            <BrandLogo variant="auto" height={36} />
          </Link>
          <nav className="landing-nav-links">
            <a href="#features" data-testid="nav-features">Features</a>
            <a href="#how" data-testid="nav-how">How it works</a>
            <a href="#showcase" data-testid="nav-showcase">Showcase</a>
            <a href="#pricing" data-testid="nav-pricing">Pricing</a>
          </nav>
          <div className="landing-nav-actions">
            {user ? (
              <Link
                href="/app"
                className="btn btn-primary"
                data-testid="nav-open-app"
              >
                Open Studio <ArrowRight className="w-4 h-4" />
              </Link>
            ) : (
              <>
                <Link href="/login" data-testid="nav-signin" className="btn btn-ghost">
                  Sign in
                </Link>
                <Link
                  href="/login?mode=signup"
                  className="btn btn-primary"
                  data-testid="nav-signup"
                >
                  Get started
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero with parallax background */}
      <section className="hero" ref={heroRef}>
        <div
          className="hero-bg"
          style={{ transform: `translateY(${scrollY * 0.35}px)` }}
        />
        <div
          className="hero-grid"
          style={{ transform: `translateY(${scrollY * 0.18}px)` }}
        />
        <div className="hero-glow" />

        <div className="hero-shapes" aria-hidden="true">
          <Triangle
            className="shape shape-1"
            style={{ transform: `translateY(${scrollY * -0.4}px) rotate(12deg)` }}
          />
          <Square
            className="shape shape-2"
            style={{ transform: `translateY(${scrollY * -0.25}px) rotate(-8deg)` }}
          />
          <Circle
            className="shape shape-3"
            style={{ transform: `translateY(${scrollY * -0.55}px)` }}
          />
          <Hexagon
            className="shape shape-4"
            style={{ transform: `translateY(${scrollY * -0.32}px) rotate(20deg)` }}
          />
        </div>

        <div className="hero-inner">
          <div className="hero-eyebrow">
            <span className="dot" /> Built for Seedance 2.0 + every major AI
            video model
          </div>
          <h1 className="hero-title">
            Turn one brief into <em>cinema-grade</em> video prompts.
          </h1>
          <p className="hero-sub">
            Write your idea once. ContentStudio AI plans the story, breaks it
            into shots, scores the music, writes the voiceover, and hands you
            paste-ready prompts for every part of your video.
          </p>
          <div className="hero-cta">
            <button
              type="button"
              onClick={goCTA}
              className="btn btn-primary btn-lg"
              data-testid="hero-cta-start"
            >
              <Play className="w-4 h-4" />
              {user ? "Open the studio" : "Start free"}
            </button>
            <a
              href="#how"
              className="btn btn-outline btn-lg"
              data-testid="hero-cta-how"
            >
              See how it works
            </a>
          </div>
          <div className="hero-trust">
            <div>
              <div className="trust-num">15s</div>
              <div className="trust-label">parts per shot list</div>
            </div>
            <div>
              <div className="trust-num">12</div>
              <div className="trust-label">visual styles</div>
            </div>
            <div>
              <div className="trust-num">3</div>
              <div className="trust-label">voiceover languages</div>
            </div>
            <div>
              <div className="trust-num">∞</div>
              <div className="trust-label">refinements via chat</div>
            </div>
          </div>
        </div>

        <a href="#features" className="hero-scroll" aria-label="Scroll">
          <ChevronDown />
        </a>
      </section>

      {/* Feature preview window */}
      <section
        className="preview"
        data-reveal
        style={{ transform: `translateY(${Math.min(0, (scrollY - 600) * -0.05)}px)` }}
      >
        <div className="preview-window">
          <div className="preview-chrome">
            <span /> <span /> <span />
            <div className="preview-url">contentstudio.ai/story</div>
          </div>
          <div className="preview-body">
            <div className="preview-side">
              <div className="preview-side-title">
                <BrandLogo variant="icon" height={24} /> ContentStudio AI
              </div>
              <ul>
                <li className="active">Story Builder</li>
                <li>Video Prompts</li>
                <li>Music Brief</li>
                <li>Voiceover</li>
                <li>History</li>
              </ul>
            </div>
            <div className="preview-main">
              <div className="preview-chip">Step 2 of 3 · refine in chat</div>
              <h3 className="preview-h">The Midnight Graffiti</h3>
              <div className="preview-acts">
                {["Awakening", "Pursuit", "Reveal"].map((t, i) => (
                  <div className="preview-act" key={t}>
                    <div className="preview-act-num">Act {i + 1}</div>
                    <div className="preview-act-title">{t}</div>
                    <div className="preview-act-line" />
                    <div className="preview-act-line short" />
                  </div>
                ))}
              </div>
              <div className="preview-bubble user">
                "make act 2 more tense — add a chase across rooftops"
              </div>
              <div className="preview-bubble assistant">
                Updated. Act 2 now opens with a 9-shot rooftop chase. Anything
                else?
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features grid */}
      <section className="features" id="features" data-reveal>
        <div className="section-head">
          <div className="section-eyebrow">What you get</div>
          <h2 className="section-title">Everything between idea and edit.</h2>
          <p className="section-sub">
            One workspace. One brief. The whole prompt package — story, shots,
            music, voiceover — in minutes, not weeks.
          </p>
        </div>
        <div className="feature-grid">
          {FEATURES.map((f, i) => (
            <div className="feature-card" key={f.title} data-reveal style={{ animationDelay: `${i * 60}ms` }}>
              <div className="feature-icon" style={{ background: f.color }}>
                <f.Icon />
              </div>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works — three big steps with parallax */}
      <section className="how" id="how" data-reveal>
        <div className="section-head">
          <div className="section-eyebrow">How it works</div>
          <h2 className="section-title">Three steps. No technical skills.</h2>
        </div>
        <div className="steps">
          {STEPS.map((s, i) => (
            <div className="step" key={s.title} data-reveal>
              <div
                className="step-num"
                style={{ transform: `translateY(${Math.max(-30, (scrollY - 1400 - i * 200) * -0.06)}px)` }}
              >
                0{i + 1}
              </div>
              <div className="step-body">
                <h3>{s.title}</h3>
                <p>{s.body}</p>
                <ul>
                  {s.bullets.map((b) => (
                    <li key={b}>
                      <CheckCircle2 className="w-4 h-4" /> {b}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Showcase strip */}
      <section className="showcase" id="showcase" data-reveal>
        <div className="section-head">
          <div className="section-eyebrow">Showcase</div>
          <h2 className="section-title">Built for every visual style.</h2>
        </div>
        <div className="showcase-grid">
          {STYLES.map((s, i) => (
            <div
              className="showcase-card"
              key={s.name}
              data-reveal
              style={{
                background: s.gradient,
                transform: `translateY(${Math.sin((scrollY + i * 80) * 0.005) * 8}px)`,
              }}
            >
              <div className="showcase-frame">
                <div className="showcase-meta">
                  <span>{s.name}</span>
                  <span>{s.parts}</span>
                </div>
                <div className="showcase-shots">
                  {Array.from({ length: 8 }).map((_, j) => (
                    <span
                      key={j}
                      className="shot-dot"
                      style={{ animationDelay: `${j * 120}ms` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Quote */}
      <section className="quote-row" data-reveal>
        <Quote className="quote-mark" />
        <blockquote>
          “We used to spend a full afternoon just sketching the shot list. With
          ContentStudio AI we have the whole prompt package — story, shots,
          music brief — before our coffee gets cold.”
        </blockquote>
        <div className="quote-by">— Aanya, Director, indie short film</div>
      </section>

      {/* Pricing */}
      <section className="pricing" id="pricing" data-reveal>
        <div className="section-head">
          <div className="section-eyebrow">Pricing</div>
          <h2 className="section-title">Free while you're learning the craft.</h2>
        </div>
        <div className="price-grid">
          <div className="price-card">
            <div className="price-name">Creator</div>
            <div className="price-amount">
              <span className="big">Free</span>
            </div>
            <ul>
              <li><CheckCircle2 className="w-4 h-4" /> Up to 30s videos</li>
              <li><CheckCircle2 className="w-4 h-4" /> All 12 visual styles</li>
              <li><CheckCircle2 className="w-4 h-4" /> Story chat refinement</li>
              <li><CheckCircle2 className="w-4 h-4" /> Voiceover EN/HI/Hinglish</li>
            </ul>
            <button
              type="button"
              onClick={goCTA}
              className="btn btn-outline w-full"
              data-testid="price-cta-creator"
            >
              {user ? "Open the studio" : "Start for free"}
            </button>
          </div>
          <div className="price-card featured">
            <div className="price-badge">Most popular</div>
            <div className="price-name">Studio</div>
            <div className="price-amount">
              <span className="big">$19</span>
              <span className="small">/mo</span>
            </div>
            <ul>
              <li><CheckCircle2 className="w-4 h-4" /> Everything in Creator</li>
              <li><CheckCircle2 className="w-4 h-4" /> Up to 5 minute videos</li>
              <li><CheckCircle2 className="w-4 h-4" /> Background generation</li>
              <li><CheckCircle2 className="w-4 h-4" /> Music brief for Suno + Udio</li>
              <li><CheckCircle2 className="w-4 h-4" /> Priority Claude routing</li>
            </ul>
            <button
              type="button"
              onClick={goCTA}
              className="btn btn-primary w-full"
              data-testid="price-cta-studio"
            >
              {user ? "Open the studio" : "Get started"}
            </button>
          </div>
          <div className="price-card">
            <div className="price-name">Production</div>
            <div className="price-amount">
              <span className="big">Talk to us</span>
            </div>
            <ul>
              <li><CheckCircle2 className="w-4 h-4" /> Everything in Studio</li>
              <li><CheckCircle2 className="w-4 h-4" /> Team workspaces</li>
              <li><CheckCircle2 className="w-4 h-4" /> Brand style training</li>
              <li><CheckCircle2 className="w-4 h-4" /> Dedicated support</li>
            </ul>
            <a
              href="mailto:hello@contentstudio.ai"
              className="btn btn-outline w-full"
              data-testid="price-cta-production"
            >
              Contact sales
            </a>
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="final-cta" data-reveal>
        <div className="final-cta-bg" />
        <div className="final-cta-inner">
          <h2>Your next video starts with one sentence.</h2>
          <p>Open the studio and write it.</p>
          <button
            type="button"
            onClick={goCTA}
            className="btn btn-primary btn-lg"
            data-testid="final-cta"
          >
            <Play className="w-4 h-4" /> {user ? "Open the studio" : "Start free now"}
          </button>
        </div>
      </section>

      <footer className="landing-footer">
        <div>
          <BrandLogo variant="icon" height={28} />
          <span>© {new Date().getFullYear()} ContentStudio AI</span>
        </div>
        <div className="footer-links">
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <a href="#pricing">Pricing</a>
        </div>
      </footer>
    </div>
  );
}

const FEATURES: Array<{
  title: string;
  body: string;
  color: string;
  Icon: () => React.ReactElement;
}> = [
  {
    title: "Story chat",
    body: "Brief in, story out. Then refine via chat — \"make act 2 darker\", \"swap the protagonist\" — until it feels right.",
    color: "linear-gradient(135deg,#E8FF47,#B7E212)",
    Icon: () => <Triangle />,
  },
  {
    title: "Shot-by-shot prompts",
    body: "Each 15s part comes with a full shot list, named effects, density map and energy arc — paste-ready into Seedance 2.0.",
    color: "linear-gradient(135deg,#FF6B6B,#C0392B)",
    Icon: () => <Square />,
  },
  {
    title: "Background generation",
    body: "Hit Finalize and walk away. Every part keeps generating in the background and saves itself as it goes.",
    color: "linear-gradient(135deg,#4ECDC4,#1A8B82)",
    Icon: () => <Circle />,
  },
  {
    title: "Music brief",
    body: "Get a tempo, mood and instrument list per part — and a copy-ready prompt for Suno or Udio.",
    color: "linear-gradient(135deg,#A78BFA,#6D28D9)",
    Icon: () => <Hexagon />,
  },
  {
    title: "Voiceover EN · हिंदी · Hinglish",
    body: "Native scripts in three languages. Word counts tuned to part length. ElevenLabs-ready.",
    color: "linear-gradient(135deg,#FB923C,#C2410C)",
    Icon: () => <Triangle />,
  },
  {
    title: "Honest, literal AI",
    body: "Your brief is law. The model never invents characters or settings outside what you wrote.",
    color: "linear-gradient(135deg,#34D399,#0F766E)",
    Icon: () => <Square />,
  },
];

const STEPS: Array<{ title: string; body: string; bullets: string[] }> = [
  {
    title: "Write the brief",
    body: "Pick a duration, a style and a voiceover language. Drop your one-sentence idea.",
    bullets: ["12 visual styles", "30s → 5min", "EN / HI / Hinglish VO"],
  },
  {
    title: "Refine the story in chat",
    body: "The AI drafts the story. You react. Send any tweak — small or sweeping — until it sings.",
    bullets: ["Refine acts", "Swap characters", "Change tone or palette"],
  },
  {
    title: "Generate the prompt package",
    body: "One Finalize click and the studio writes every shot, the music brief and the voiceover.",
    bullets: ["Runs in background", "Auto-saves per part", "Copy or download .txt"],
  },
];

const STYLES: Array<{ name: string; parts: string; gradient: string }> = [
  { name: "Live Action Cinematic", parts: "8 parts · 2min", gradient: "linear-gradient(135deg,#0f1419 0%,#1a2332 100%)" },
  { name: "Cyberpunk Neon", parts: "6 parts · 90s", gradient: "linear-gradient(135deg,#1a0033 0%,#FF006E 100%)" },
  { name: "Studio Ghibli", parts: "4 parts · 60s", gradient: "linear-gradient(135deg,#2D5016 0%,#A8D5BA 100%)" },
  { name: "Anime 2D", parts: "10 parts · 2.5min", gradient: "linear-gradient(135deg,#FF6B9D 0%,#FFC75F 100%)" },
  { name: "Dark Fantasy", parts: "12 parts · 3min", gradient: "linear-gradient(135deg,#2C0033 0%,#5A189A 100%)" },
  { name: "Music Video Hyper", parts: "8 parts · 2min", gradient: "linear-gradient(135deg,#E8FF47 0%,#9BCB1A 100%)" },
];
