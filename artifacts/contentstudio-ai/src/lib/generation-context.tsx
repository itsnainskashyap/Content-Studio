import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { generateVideoPrompts } from "@workspace/api-client-react";
import { storage, type Project, type ProjectPart, type VoiceoverLanguage } from "@/lib/storage";

export interface GenerationConfig {
  projectId: string;
  story: NonNullable<Project["story"]>;
  style: string;
  partsCount: number;
  partDuration: number;
  voiceoverLanguage: VoiceoverLanguage;
  voiceoverTone: string;
  bgm: { name: string; tempo: string; instruments: string[] } | null;
}

export interface GenerationJob {
  projectId: string;
  // running       = currently generating ONE part
  // awaiting_next = the previous part finished; user must click "Generate next prompt"
  // done          = all parts generated
  status: "running" | "awaiting_next" | "done" | "error" | "cancelled";
  total: number;
  current: number; // number of parts completed so far
  parts: ProjectPart[];
  error: string | null;
  config: GenerationConfig;
  startedAt: number;
  previousLastFrame?: string;
}

interface GenerationContextValue {
  getJob: (projectId: string) => GenerationJob | null;
  /** Begin a new run and generate the FIRST part only. */
  startGeneration: (config: GenerationConfig) => void;
  /** Generate the next single part using the existing job's config. */
  generateNextPart: (projectId: string) => void;
  cancel: (projectId: string) => void;
  clear: (projectId: string) => void;
  /**
   * Replace a single part in the in-memory job (after an inline edit).
   * No-op if there's no job for this project.
   */
  replaceJobPart: (projectId: string, replacement: ProjectPart) => void;
}

const GenerationContext = createContext<GenerationContextValue | null>(null);

// Per-part client timeout. The server can take 60-150s for a richly detailed
// part (especially when voiceover + BGM are included and the model produces
// 14k+ chars of copyablePrompt). 240s gives a comfortable margin so the
// AbortController doesn't fire on a slightly slower-than-average response,
// while still protecting against an actually-stuck request.
const TIMEOUT_MS = 240_000;

function normalizeError(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    const raw = String((err as { message: unknown }).message);
    const lower = raw.toLowerCase();
    if (lower.includes("rate") && lower.includes("limit")) {
      return "Hit the AI rate limit. Please wait 30 seconds and try again.";
    }
    if (lower.includes("429")) {
      return "Too many requests right now. Please wait 30 seconds and try again.";
    }
    if (raw) return raw;
  }
  return "Something went wrong. Please try again.";
}

export function GenerationProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<Record<string, GenerationJob>>({});
  // Refs for the actual mutable state used by the running async loop —
  // setJobs only mirrors for the React render path.
  const jobsRef = useRef<Record<string, GenerationJob>>({});
  const controllersRef = useRef<Record<string, AbortController>>({});

  const updateJob = useCallback((projectId: string, patch: Partial<GenerationJob>) => {
    const cur = jobsRef.current[projectId];
    if (!cur) return;
    const next = { ...cur, ...patch };
    jobsRef.current[projectId] = next;
    setJobs((s) => ({ ...s, [projectId]: next }));
  }, []);

  // Generates ONE part (the next one) using the job already stored for this
  // project. Caller is responsible for ensuring a job exists.
  const runOnePart = useCallback(
    async (projectId: string) => {
      const job = jobsRef.current[projectId];
      if (!job) return;
      if (job.status === "running") return; // already running
      if (job.current >= job.total) return; // nothing left
      const partNumber = job.current + 1;
      const config = job.config;

      // Cancel any previous controller for safety
      const prev = controllersRef.current[projectId];
      if (prev) prev.abort();

      const controller = new AbortController();
      controllersRef.current[projectId] = controller;
      updateJob(projectId, { status: "running", error: null });

      const partTimer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const result = await generateVideoPrompts(
          {
            story: config.story,
            style: config.style,
            duration: config.partDuration,
            part: partNumber,
            totalParts: config.partsCount,
            previousLastFrame: job.previousLastFrame,
            voiceoverLanguage:
              config.voiceoverLanguage === "none" ? null : config.voiceoverLanguage,
            voiceoverTone:
              config.voiceoverLanguage === "none" ? null : config.voiceoverTone,
            bgmStyle: config.bgm?.name ?? null,
            bgmTempo: config.bgm?.tempo ?? null,
            bgmInstruments: config.bgm?.instruments ?? [],
          },
          { signal: controller.signal },
        );
        clearTimeout(partTimer);

        const part: ProjectPart = {
          ...result,
          partNumber,
          voiceoverLanguage:
            config.voiceoverLanguage === "none" ? null : config.voiceoverLanguage,
          bgmStyle: config.bgm?.name ?? null,
          bgmTempo: config.bgm?.tempo ?? null,
        };
        const collected = [...job.parts, part];

        // Persist incrementally
        const proj = storage.getProject(projectId);
        if (proj) {
          const saved = storage.saveProject({
            ...proj,
            style: config.style,
            duration: config.partDuration,
            partsCount: config.partsCount,
            voiceoverLanguage: config.voiceoverLanguage,
            parts: [...collected],
          });
          storage.setCurrentProjectId(saved.id);
          window.dispatchEvent(new Event("cs:projects-changed"));
        }

        const isDone = partNumber >= config.partsCount;
        updateJob(projectId, {
          parts: collected,
          current: partNumber,
          previousLastFrame: result.lastFrameDescription,
          status: isDone ? "done" : "awaiting_next",
        });
      } catch (err) {
        clearTimeout(partTimer);
        if (controller.signal.aborted) {
          updateJob(projectId, { status: "cancelled" });
        } else {
          updateJob(projectId, {
            status: "error",
            error: normalizeError(err),
          });
        }
      } finally {
        if (controllersRef.current[projectId] === controller) {
          delete controllersRef.current[projectId];
        }
      }
    },
    [updateJob],
  );

  const startGeneration = useCallback(
    (config: GenerationConfig) => {
      // Cancel any previous run for this project
      const prev = controllersRef.current[config.projectId];
      if (prev) prev.abort();

      const job: GenerationJob = {
        projectId: config.projectId,
        status: "awaiting_next",
        total: config.partsCount,
        current: 0,
        parts: [],
        error: null,
        config,
        startedAt: Date.now(),
        previousLastFrame: undefined,
      };
      jobsRef.current[config.projectId] = job;
      setJobs((s) => ({ ...s, [config.projectId]: job }));

      // Kick off the FIRST part automatically
      void runOnePart(config.projectId);
    },
    [runOnePart],
  );

  const generateNextPart = useCallback(
    (projectId: string) => {
      const job = jobsRef.current[projectId];
      if (!job) return;
      if (job.status === "running") return;
      if (job.current >= job.total) return;
      void runOnePart(projectId);
    },
    [runOnePart],
  );

  const cancel = useCallback((projectId: string) => {
    const c = controllersRef.current[projectId];
    if (c) c.abort();
    delete controllersRef.current[projectId];
    const cur = jobsRef.current[projectId];
    if (cur && cur.status === "running") {
      updateJob(projectId, { status: "cancelled" });
    }
  }, [updateJob]);

  const replaceJobPart = useCallback(
    (projectId: string, replacement: ProjectPart) => {
      const cur = jobsRef.current[projectId];
      if (!cur) return;
      const idx = cur.parts.findIndex(
        (p) => p.partNumber === replacement.partNumber,
      );
      if (idx < 0) return;
      const nextParts = [...cur.parts];
      nextParts[idx] = replacement;
      // If the replaced part is the LAST one we've completed so far, also
      // refresh previousLastFrame so any subsequent "generate next" picks
      // up the new continuation frame.
      const isLastCompleted = idx === cur.parts.length - 1;
      updateJob(projectId, {
        parts: nextParts,
        previousLastFrame: isLastCompleted
          ? replacement.lastFrameDescription
          : cur.previousLastFrame,
      });
    },
    [updateJob],
  );

  const clear = useCallback((projectId: string) => {
    const c = controllersRef.current[projectId];
    if (c) c.abort();
    delete controllersRef.current[projectId];
    delete jobsRef.current[projectId];
    setJobs((s) => {
      const next = { ...s };
      delete next[projectId];
      return next;
    });
  }, []);

  const getJob = useCallback(
    (projectId: string): GenerationJob | null => jobs[projectId] ?? null,
    [jobs],
  );

  // Cleanup on unmount (only fires when entire app unmounts, not on route change)
  useEffect(() => {
    return () => {
      for (const c of Object.values(controllersRef.current)) c.abort();
    };
  }, []);

  return (
    <GenerationContext.Provider
      value={{
        getJob,
        startGeneration,
        generateNextPart,
        cancel,
        clear,
        replaceJobPart,
      }}
    >
      {children}
    </GenerationContext.Provider>
  );
}

export function useGeneration(): GenerationContextValue {
  const ctx = useContext(GenerationContext);
  if (!ctx) throw new Error("useGeneration must be used inside GenerationProvider");
  return ctx;
}
