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
- **Output Token Budget**: `max_tokens` are dynamically set per route (e.g., 8192 for stories, 12000 for video prompts) to prevent truncation while optimizing for generation speed. Error handling for truncation is explicit, prompting users to be more concise.

**Content Studio AI Frontend (`artifacts/contentstudio-ai`):**
- **Project State Management**: Utilizes `localStorage` for persisting project data (style, voiceover language, duration, parts count, parts array). Includes `migrateProject()` for backfilling new fields in legacy data.
- **Background Generation**: Uses a `<GenerationProvider>` to manage `AbortControllers` and job states, allowing AI generation to continue across page navigations. Completed parts are incrementally persisted to `localStorage` and broadcast via events.
- **Story Builder**: Implemented as a chat interface. Initial story generation is followed by a conversation flow for refinements (`/api/continue-story`). A "Finalize" button locks the story and initiates video prompt generation.
- **Story Chat Commentary**: AI can provide 2-3 sentence chat-style commentary (`commentary` field in `StoryResponse`) on story generation, explaining changes or creative choices.
- **Video Prompt Generation**:
    - Generates one part at a time, allowing user interaction to trigger the next part.
    - Each part generation is client-side capped at 240 seconds.
    - `copyablePrompt` is hard-bounded to 4200-4500 characters for faster generation and compatibility with external tools. Server-side enforcement: a `validate` callback in `generateJson` triggers up to 3 LLM retries with corrective length feedback. If retries don't land in band, a `finalRecover` step picks the structurally-complete attempt closest to band (or as a last resort, truncates the smallest overshoot at a section boundary that preserves all four headings).
    - The `copyablePrompt` is the PURE VISUAL prompt — it intentionally excludes any `[VOICEOVER]` header or `VO:` line. Voiceover lives only in the separate `autoVoiceoverScript` field, rendered in its own UI panel (`inline-prompts.tsx` ~line 769). This separation is what makes the strict 4200-4500 band achievable with rich Devanagari/Hinglish scripts.
    - Required `copyablePrompt` sections (in this order): `## SHOT-BY-SHOT EFFECTS TIMELINE`, `## MASTER EFFECTS INVENTORY`, `## EFFECTS DENSITY MAP`, `## ENERGY ARC`. Per-section character budgets and a hard shot-count cap (5-8 depending on duration) are baked into the system prompt so the model naturally lands inside the band.
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