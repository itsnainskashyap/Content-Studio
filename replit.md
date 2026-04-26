# Overview

This project is a pnpm workspace monorepo using TypeScript, focused on AI-powered video content creation. It includes an Express API for AI integrations and a React + Vite frontend application called "Content Studio AI" (Seedance 2.0).

**Key Capabilities:**
- AI-driven story generation and continuation.
- AI-generated video prompts based on stories, supporting iterative part-by-part generation and editing with continuity.
- AI-generated music briefs and voiceovers.
- Project management, backup, and restore functionalities in the client.

The business vision is to provide a comprehensive tool for creators to rapidly prototype and develop video concepts using AI, significantly streamlining the pre-production process.

# User Preferences

The user prefers an iterative development approach. They want to be able to stop and restart AI generation processes. They appreciate clear error messages that guide them to actionable solutions. They prefer a dark editorial design with specific color schemes.

# System Architecture

**Monorepo Structure:**
- Built as a pnpm workspace monorepo.
- Each package manages its own dependencies.

**Technology Stack:**
- **Node.js**: v24
- **TypeScript**: v5.9
- **Package Manager**: pnpm
- **API Framework**: Express 5
- **Database**: PostgreSQL with Drizzle ORM
- **Validation**: Zod (v4), `drizzle-zod`
- **API Codegen**: Orval (from OpenAPI spec)
- **Build Tool**: esbuild (CJS bundle)

**UI/UX Decisions (Content Studio AI - `artifacts/contentstudio-ai`):**
- **Design Theme**: Dark editorial design (`#0A0A0A` background, `#E8FF47` lime accents).
- **Core Pages**: Dashboard, Story Builder, Video Prompts, Music, Voiceover, History, Settings.
- **Branding**: Uses `public/logo-wide.png` and `public/logo-icon.png`, abstracted via `<BrandLogo />` component.
- **Feature Icons**: Real PNGs (e.g., `icon-story-chat.png`) used for landing page features, replacing generic Lucide shapes.
- **Mobile Responsiveness**: Adaptive layouts using `px-4 py-8 md:px-12 md:py-14` for page wrappers, `px-4 md:px-6` for inline panels, and flexible stacking for info blocks. Global `overflow-x:hidden; max-width:100vw` for safety.
- **Landing Page**: Features a cinematic photographic background with parallax, IntersectionObserver-based scroll reveals, and a sign-in/sign-up flow.
- **AI-cliché Icon Swaps**: Generic AI icons (Sparkles, Star, Bot, Zap) are replaced with more relevant or branded icons (Play, Diamond, MessageCircle, wide logo).

**Technical Implementations & Feature Specifications:**

**API Server (`artifacts/api-server`):**
- **AI Integrations**: Routes under `/api/` for `generate-story`, `continue-story`, `generate-video-prompts`, `generate-music-brief`, `generate-voiceover`.
- **LLM**: Primarily uses Anthropic Claude (via Replit AI Integrations), with `claude-sonnet-4-6` for video prompt generation. The model is centrally configured for easy modification.
- **Input Validation**: Request bodies are validated using Zod schemas generated from the OpenAPI spec. Invalid requests return HTTP 400 with human-readable errors.
- **Output Token Budget**: `max_tokens` are dynamically set per route (e.g., 8192 for stories, 20000 for video prompts) to prevent truncation while optimizing for generation speed. The 20000-token budget for video prompts is sized for the all-in-one Seedance prompt (copyablePrompt up to ~28K chars + structured shots/inventory/densityMap/energyArc + a Devanagari/Hinglish autoVoiceoverScript). Error handling for truncation is explicit, prompting users to be more concise.

**Content Studio AI Frontend (`artifacts/contentstudio-ai`):**
- **Project State Management**: Utilizes `localStorage` for persisting project data (style, voiceover language, duration, parts count, parts array). Includes `migrateProject()` for backfilling new fields in legacy data.
- **Background Generation**: Uses a `<GenerationProvider>` to manage `AbortControllers` and job states, allowing AI generation to continue across page navigations. Completed parts are incrementally persisted to `localStorage` and broadcast via events.
- **Story Builder**: Implemented as a chat interface. Initial story generation is followed by a conversation flow for refinements (`/api/continue-story`). A "Finalize" button locks the story and initiates video prompt generation.
- **Story Chat Commentary**: AI can provide 2-3 sentence chat-style commentary (`commentary` field in `StoryResponse`) on story generation, explaining changes or creative choices.
- **Video Prompt Generation**:
    - Generates one part at a time, allowing user interaction to trigger the next part.
    - Each part generation is client-side capped at 240 seconds.
    - **All-in-one Seedance prompt**: `copyablePrompt` is now a complete audio-visual scene — pasting it into Seedance 2.0 produces dialogue + BGM + lip-sync + per-shot SFX without any extra config. **Hard length cap: 4500 chars total** (target 3500-4400, floor 1500). The system prompt instructs extremely terse phrasing — sentence fragments, per-shot bullets ≤ 50 chars, no decorative adjectives, no prose paragraphs in section bodies. The structure (4 [BRACKET] headers + 6 mandatory sections + 7-bullet shots with embedded DIALOGUE/AUDIO) stays intact; only verbosity is reduced to fit the cap. Server-side enforcement is centralised in `checkVideoPromptShape(result, durationSec)` — a single shape predicate in `routes/ai/index.ts` that the validator (`makeVideoPromptValidator`) and the final-attempt recovery (`makeRecoverCopyablePrompt`) BOTH consult. The predicate verifies: `[VISUAL STYLE]` + `[PART]` bracket headers, all 6 mandatory `##` sections in canonical order (timeline / inventory / density / energy arc / dialogue / audio), shot count inside the skill's per-duration range (4-7 for ≤10s, 8-14 for 10-20s, 12-20 for 20-30s, ~0.5-0.7 shots/sec for 30s+) — both bounds enforced, and per-shot embedded audio (`• DIALOGUE:` and `• AUDIO:` bullet counts ≥ shot count). The length validator returns a tightening retry instruction when the model overshoots the 4500-char cap. `finalRecover` accepts only fully shape-compliant candidates inside the 1500-4500 length band; truncation is a last resort and re-checks the full shape after the cut. Token budget is `VIDEO_PROMPTS_MAX_TOKENS = 8000` (4500 chars ≈ 1500 tokens, plus headroom for the structured fields and an Indic-script `autoVoiceoverScript`).
    - The `copyablePrompt` now EMBEDS the dialogue, BGM cues, lip-sync directives, and per-shot SFX inside the prompt itself. The schema's structured `shots[]` array stays VISUAL-ONLY (its existing fields: `effects`, `description`, `cameraWork`, `speed`, `transition`, `isSignature`); dialogue and audio design live as per-shot bullets and as the two new `## DIALOGUE & VOICEOVER` and `## AUDIO DESIGN` sections inside `copyablePrompt`. The separate `autoVoiceoverScript` field is kept as a derived convenience for any UI panel that needs a flat VO script (`inline-prompts.tsx` ~line 769). The `audioSummary` field surfaces voiceoverIncluded / bgmIncluded / keySyncPoints for at-a-glance UI badges.
    - Required `copyablePrompt` structure: 4 `[BRACKET]` header lines (`[VISUAL STYLE]`, `[BACKGROUND MUSIC]` if BGM enabled, `[VOICEOVER]` if voiceover enabled, `[PART]`), 6 mandatory `##` sections in canonical order (`## SHOT-BY-SHOT EFFECTS TIMELINE`, `## MASTER EFFECTS INVENTORY`, `## EFFECTS DENSITY MAP`, `## ENERGY ARC`, `## DIALOGUE & VOICEOVER`, `## AUDIO DESIGN`), and per-shot blocks with **7 mandatory bullets** (`EFFECT`, visual description, camera work, speed/timing, transition, `DIALOGUE`, `AUDIO`). Skill-aligned shot counts and signature counts (1 for ≤10s, 1-2 for 10-20s, 2-3 for 20-30s) are baked into the system prompt.
    - Frontend timeout for AI calls is 240s (`artifacts/contentstudio-ai/src/lib/api-call.ts`) to accommodate worst-case 3-retry runs.
    - Supports per-part editing via `POST /api/edit-video-prompts`, maintaining continuity across parts using `previousLastFrame` and `nextFirstShot`.
    - **Cumulative Memory**: Both `generate-video-prompts` and `edit-video-prompts` use `previousParts: string[]` (digests of already-generated parts) to provide cumulative context to the AI, preventing repetition and ensuring consistency.
    - Displays a "Full Seedance prompt" panel for each part's `copyablePrompt`.
- **New Project Flow**: Explicitly clears `currentProjectId` in `localStorage` when creating a new project to ensure a blank canvas.
- **Authentication**: `localStorage`-based account system (`cs_accounts_v1`, `cs_session_v1`). Uses SHA-256 fingerprinting for local-only password hashing. `AuthProvider` wraps the router, redirecting unauthenticated users to `/login`.
- **Data Management**:
    - **Backup & Restore**: Projects can be exported (JSON envelope) and imported. The import process handles conflicts (skip, replace, import as copy) and provides error toasts for invalid data.
    - **Copy All Parts**: Prominent "Copy ALL N parts" button uses Clipboard API for easy transfer.
- **Development Fixes**: `generation-context` split into `GenerationProvider` and `useGeneration` hook to resolve React-Refresh HMR issues. Video prompt `duration` validation now allows up to 3600s per part, accommodating longer multi-part videos.

# External Dependencies

- **Replit AI Integrations**: Used for accessing Anthropic Claude.
- **PostgreSQL**: Relational database for storing project data.
- **Zod**: Schema validation library.
- **Drizzle ORM**: TypeScript ORM for PostgreSQL.
- **Orval**: API client and Zod schema generator from OpenAPI specifications.
- **esbuild**: JavaScript bundler for build processes.