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
  - Inline video prompt generation lives in `src/components/inline-prompts.tsx` and is mounted from the Story page after a story is generated; it calls `/api/generate-video-prompts` once per part with `voiceoverLanguage`/`bgmStyle` etc.
  - Sidebar `Current Project` sub-nav is rendered when `storage.getCurrentProject()` returns a project.
  - Templates modal on the dashboard pre-fills the Story Builder via `sessionStorage["cs_template"]`.
