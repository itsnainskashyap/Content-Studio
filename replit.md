# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Artifacts

- **`artifacts/api-server`** — Express AI API. Routes under `/api/`: `generate-story`, `continue-story`, `generate-video-prompts`, `generate-music-brief`, `generate-voiceover`. Uses Replit AI Integrations (Anthropic Claude). System/user prompts in `src/routes/ai/prompts.ts`.
- **`artifacts/contentstudio-ai`** — React + Vite app for AI video prompt creation (Seedance 2.0). Dark editorial design (#0A0A0A bg, #E8FF47 lime).
  - Pages: `dashboard`, `story` (Story Builder + inline prompts panel), `prompts` (`/generate`, fallback Quick Video), `music`, `voiceover`, `history`, `settings`.
  - Project state lives in `localStorage` (see `src/lib/storage.ts`). Key fields per project: `style`, `voiceoverLanguage`, `totalDurationSeconds`, `partsCount`, `parts[]`. `migrateProject()` in `getProjects()` backfills new fields on legacy data.
  - **Background generation**: `src/lib/generation-context.tsx` provides `<GenerationProvider>` (wrapped in `App.tsx` outside the router). It owns per-project AbortControllers + job state in refs so generation continues running across page navigation. Each completed part is persisted incrementally to localStorage and broadcast via the `cs:projects-changed` event. Components read live job state via `useGeneration()`.
  - Inline video prompt generation lives in `src/components/inline-prompts.tsx`. It reads the running job from `useGeneration()`, shows a Stop button while running, and accepts an `autoStart` prop. The Story page passes `autoStart={true}` after Finalize so generation kicks off automatically.
  - **Story Builder is a chat interface** (`src/pages/story.tsx`). After the initial story is generated, the page becomes a conversation: user messages call `/api/continue-story` with arbitrary refinement instructions ("make act 2 darker", "add a twist", "change the protagonist") and the AI returns the full updated story. A "Finalize" button locks the story and reveals the inline prompts panel which auto-starts video prompt generation. The CONTINUE_STORY_SYSTEM_PROMPT supports append / refine-act / change-character / change-tone / full rewrite / fix-detail.
  - **copyablePrompt format** uses the EXACT 4-section structure from the bundled video-prompt-builder skill: `## SHOT-BY-SHOT EFFECTS TIMELINE`, `## MASTER EFFECTS INVENTORY`, `## EFFECTS DENSITY MAP`, `## ENERGY ARC`, ending with `LAST FRAME:`. Optional `[VISUAL STYLE]`, `[BACKGROUND MUSIC]`, `[VOICEOVER]`, `[PART]` headers appear above when set.
  - Sidebar `Current Project` sub-nav is rendered when `storage.getCurrentProject()` returns a project.
  - Templates modal on the dashboard pre-fills the Story Builder via `sessionStorage["cs_template"]`.
  - **Auth**: localStorage-based account system in `src/lib/auth.tsx`. Accounts saved to `cs_accounts_v1`, session to `cs_session_v1`. Passwords are SHA-256 fingerprinted (not a security boundary — local-only). `<AuthProvider>` wraps the router in `App.tsx`. The home route renders `Landing` for logged-out users and `Dashboard` for logged-in users; other routes redirect to `/login` when logged out.
  - **Landing page** (`src/pages/landing.tsx`) + **Login page** (`src/pages/login.tsx`) use plain CSS in `src/index.css` (under "Landing + Auth — custom styles"). Landing has scroll-driven parallax hero shapes, IntersectionObserver-based reveal-on-scroll for sections, and a sign-in/sign-up flow that supports `?mode=signup`.
  - **Logos**: `public/logo-wide.png` (PC sidebar + landing/auth header) and `public/logo-icon.png` (mobile / auth small marks). Reused via `src/components/brand-logo.tsx` (`<BrandLogo variant="wide|icon|auto" />`).
  - **AI-cliché icon swaps** (per user request): `Sparkles` → `Play`, `Star` → `Diamond`, `Bot` → `MessageCircle`, sidebar `Zap` → wide logo image. Applied across `inline-prompts.tsx`, `story.tsx`, `prompts.tsx`, `dashboard.tsx`, `history.tsx`, `voiceover.tsx`, `music.tsx`, and `layout.tsx`.
  - **Copy ALL parts**: `inline-prompts.tsx` exposes a prominent highlighted "Copy ALL N parts" button (testid `button-copy-all-parts`) next to the Download .txt button. Uses Clipboard API with textarea fallback and shows a green "Copied!" state for 2.2s.
