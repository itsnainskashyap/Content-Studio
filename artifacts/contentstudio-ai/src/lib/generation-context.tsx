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
  status: "running" | "done" | "error" | "cancelled";
  total: number;
  current: number;
  parts: ProjectPart[];
  error: string | null;
  config: GenerationConfig;
  startedAt: number;
}

interface GenerationContextValue {
  getJob: (projectId: string) => GenerationJob | null;
  startGeneration: (config: GenerationConfig) => void;
  cancel: (projectId: string) => void;
  clear: (projectId: string) => void;
}

const GenerationContext = createContext<GenerationContextValue | null>(null);

const TIMEOUT_MS = 90_000;

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

  const startGeneration = useCallback(
    (config: GenerationConfig) => {
      // Cancel any previous run for this project
      const prev = controllersRef.current[config.projectId];
      if (prev) prev.abort();

      const controller = new AbortController();
      controllersRef.current[config.projectId] = controller;

      const job: GenerationJob = {
        projectId: config.projectId,
        status: "running",
        total: config.partsCount,
        current: 0,
        parts: [],
        error: null,
        config,
        startedAt: Date.now(),
      };
      jobsRef.current[config.projectId] = job;
      setJobs((s) => ({ ...s, [config.projectId]: job }));

      (async () => {
        const collected: ProjectPart[] = [];
        let previousLastFrame: string | undefined = undefined;

        for (let i = 1; i <= config.partsCount; i++) {
          if (controller.signal.aborted) {
            updateJob(config.projectId, { status: "cancelled" });
            if (controllersRef.current[config.projectId] === controller) {
              delete controllersRef.current[config.projectId];
            }
            return;
          }
          updateJob(config.projectId, { current: i });
          const partTimer = setTimeout(() => controller.abort(), TIMEOUT_MS);
          try {
            const result = await generateVideoPrompts(
              {
                story: config.story,
                style: config.style,
                duration: config.partDuration,
                part: i,
                totalParts: config.partsCount,
                previousLastFrame,
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
              partNumber: i,
              voiceoverLanguage:
                config.voiceoverLanguage === "none" ? null : config.voiceoverLanguage,
              bgmStyle: config.bgm?.name ?? null,
              bgmTempo: config.bgm?.tempo ?? null,
            };
            collected.push(part);
            previousLastFrame = result.lastFrameDescription;

            // Persist incrementally so navigating away doesn't lose finished parts
            const proj = storage.getProject(config.projectId);
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
            updateJob(config.projectId, { parts: [...collected] });
          } catch (err) {
            clearTimeout(partTimer);
            if (controller.signal.aborted) {
              updateJob(config.projectId, { status: "cancelled" });
            } else {
              updateJob(config.projectId, {
                status: "error",
                error: normalizeError(err),
              });
            }
            // Drop reference to the controller for any terminal path
            if (controllersRef.current[config.projectId] === controller) {
              delete controllersRef.current[config.projectId];
            }
            return;
          }
        }

        updateJob(config.projectId, { status: "done", current: config.partsCount });
        if (controllersRef.current[config.projectId] === controller) {
          delete controllersRef.current[config.projectId];
        }
      })();
    },
    [updateJob],
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
    <GenerationContext.Provider value={{ getJob, startGeneration, cancel, clear }}>
      {children}
    </GenerationContext.Provider>
  );
}

export function useGeneration(): GenerationContextValue {
  const ctx = useContext(GenerationContext);
  if (!ctx) throw new Error("useGeneration must be used inside GenerationProvider");
  return ctx;
}
