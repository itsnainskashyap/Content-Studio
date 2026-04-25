import { createContext, useContext } from "react";
import type { Project, ProjectPart, VoiceoverLanguage } from "@/lib/storage";

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
  status: "running" | "awaiting_next" | "done" | "error" | "cancelled";
  total: number;
  current: number;
  parts: ProjectPart[];
  error: string | null;
  config: GenerationConfig;
  startedAt: number;
  previousLastFrame?: string;
}

export interface GenerationContextValue {
  getJob: (projectId: string) => GenerationJob | null;
  startGeneration: (config: GenerationConfig) => void;
  generateNextPart: (projectId: string) => void;
  cancel: (projectId: string) => void;
  clear: (projectId: string) => void;
  replaceJobPart: (projectId: string, replacement: ProjectPart) => void;
}

export const GenerationContext = createContext<GenerationContextValue | null>(
  null,
);

export function useGeneration(): GenerationContextValue {
  const ctx = useContext(GenerationContext);
  if (!ctx)
    throw new Error("useGeneration must be used inside GenerationProvider");
  return ctx;
}
