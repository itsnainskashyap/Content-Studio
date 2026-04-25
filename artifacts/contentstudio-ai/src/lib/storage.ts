import type {
  StoryResponse,
  VideoPromptsResponse,
  MusicBriefResponse,
  VoiceoverResponse,
} from "@workspace/api-client-react";

export interface ProjectPart extends VideoPromptsResponse {
  partNumber: number;
  voiceoverLanguage?: string | null;
  bgmStyle?: string | null;
  bgmTempo?: string | null;
}

export interface ProjectVoiceoverPart extends VoiceoverResponse {
  partNumber: number;
}

export interface ProjectVoiceover {
  language: "english" | "hindi" | "hinglish";
  tone: string;
  parts: ProjectVoiceoverPart[];
}

export type VoiceoverLanguage = "none" | "english" | "hindi" | "hinglish";

export interface Project {
  id: string;
  title: string;
  brief: string;
  genre: string;
  story: StoryResponse | null;
  style: string | null;
  duration: number; // per-part seconds (kept for compat with /generate page)
  totalDuration: number; // total seconds requested at story creation (alias of totalDurationSeconds)
  totalDurationSeconds: number; // canonical name per spec
  partsCount: number; // Math.ceil(totalDurationSeconds / 15)
  voiceoverLanguage: VoiceoverLanguage;
  parts: ProjectPart[];
  music: MusicBriefResponse | null;
  voiceover: ProjectVoiceover | null;
  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  defaultDuration: number; // per-part
  defaultStyle: string;
  defaultLanguage: "english" | "hindi" | "hinglish";
}

const DEFAULT_SETTINGS: Settings = {
  defaultDuration: 5,
  defaultStyle: "Live Action Cinematic",
  defaultLanguage: "english",
};

const STORAGE_KEYS = {
  PROJECTS: "cs_projects",
  SETTINGS: "cs_settings",
  CURRENT_PROJECT_ID: "cs_current_project_id",
};

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createEmptyProject(input: {
  title: string;
  brief: string;
  genre: string;
  totalDuration: number;
  style?: string | null;
  voiceoverLanguage?: VoiceoverLanguage;
}): Project {
  const now = new Date().toISOString();
  const total = input.totalDuration;
  return {
    id: newId(),
    title: input.title || "Untitled project",
    brief: input.brief,
    genre: input.genre,
    story: null,
    style: input.style ?? null,
    duration: 15,
    totalDuration: total,
    totalDurationSeconds: total,
    partsCount: Math.max(1, Math.ceil(total / 15)),
    voiceoverLanguage: input.voiceoverLanguage ?? "none",
    parts: [],
    music: null,
    voiceover: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Migrate legacy projects in localStorage to ensure new required fields exist.
 * Called from getProjects() so reads always return well-shaped projects.
 */
function migrateProject(p: Project): Project {
  const total = p.totalDurationSeconds ?? p.totalDuration ?? 30;
  return {
    ...p,
    totalDurationSeconds: total,
    totalDuration: p.totalDuration ?? total,
    partsCount: p.partsCount ?? Math.max(1, Math.ceil(total / 15)),
    voiceoverLanguage: (p.voiceoverLanguage ?? "none") as VoiceoverLanguage,
  };
}

export const storage = {
  getProjects(): Project[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PROJECTS);
      const raw = data ? (JSON.parse(data) as Project[]) : [];
      return raw.map(migrateProject);
    } catch {
      return [];
    }
  },

  saveProject(project: Project): Project {
    const projects = storage.getProjects();
    const idx = projects.findIndex((p) => p.id === project.id);
    const updated = { ...project, updatedAt: new Date().toISOString() };
    if (idx >= 0) {
      projects[idx] = updated;
    } else {
      projects.unshift(updated);
    }
    localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(projects));
    return updated;
  },

  getProject(id: string): Project | undefined {
    return storage.getProjects().find((p) => p.id === id);
  },

  duplicateProject(id: string): Project | undefined {
    const original = storage.getProject(id);
    if (!original) return undefined;
    const copy: Project = {
      ...original,
      id: newId(),
      title: `${original.title} (copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return storage.saveProject(copy);
  },

  deleteProject(id: string): void {
    const projects = storage.getProjects().filter((p) => p.id !== id);
    localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(projects));
    if (storage.getCurrentProjectId() === id) {
      storage.setCurrentProjectId(null);
    }
  },

  getCurrentProjectId(): string | null {
    return localStorage.getItem(STORAGE_KEYS.CURRENT_PROJECT_ID);
  },

  setCurrentProjectId(id: string | null): void {
    if (id) {
      localStorage.setItem(STORAGE_KEYS.CURRENT_PROJECT_ID, id);
    } else {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_PROJECT_ID);
    }
  },

  getCurrentProject(): Project | null {
    const id = storage.getCurrentProjectId();
    if (!id) return null;
    return storage.getProject(id) ?? null;
  },

  getSettings(): Settings {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      return data
        ? { ...DEFAULT_SETTINGS, ...(JSON.parse(data) as Partial<Settings>) }
        : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  },

  saveSettings(settings: Settings): void {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  },

  clearAll(): void {
    localStorage.removeItem(STORAGE_KEYS.PROJECTS);
    localStorage.removeItem(STORAGE_KEYS.SETTINGS);
    localStorage.removeItem(STORAGE_KEYS.CURRENT_PROJECT_ID);
  },

  totalShots(project: Project): number {
    return project.parts.reduce((sum, p) => sum + p.shots.length, 0);
  },
};

export const STYLES: Array<{
  key: string;
  name: string;
  description: string;
  keywords: string;
  accent: string;
}> = [
  {
    key: "live-action",
    name: "Live Action Cinematic",
    description: "Real. Raw. Filmic.",
    keywords: "photoreal · 35mm · grain · anamorphic",
    accent: "#FF6B35",
  },
  {
    key: "anime-2d",
    name: "Anime 2D",
    description: "Bold. Expressive. Dynamic.",
    keywords: "cel-shaded · ink · sakura · dynamic",
    accent: "#FF4D8F",
  },
  {
    key: "pixar-3d",
    name: "3D Pixar Style",
    description: "Warm. Polished. Emotive.",
    keywords: "soft · 3D · expressive · render",
    accent: "#4DA6FF",
  },
  {
    key: "pixel-art",
    name: "Pixel Art",
    description: "Retro. Sharp. Nostalgic.",
    keywords: "pixels · 16-bit · retro · CRT",
    accent: "#9B59B6",
  },
  {
    key: "ghibli",
    name: "Studio Ghibli",
    description: "Painterly. Gentle. Alive.",
    keywords: "painterly · watercolor · gentle · wonder",
    accent: "#27AE60",
  },
  {
    key: "cyberpunk",
    name: "Cyberpunk Neon",
    description: "Electric. Dark. Futuristic.",
    keywords: "neon · rain · holo · noir",
    accent: "#00FFCC",
  },
  {
    key: "dark-fantasy",
    name: "Dark Fantasy",
    description: "Gothic. Heavy. Atmospheric.",
    keywords: "gothic · fog · candlelight · arcane",
    accent: "#8B0000",
  },
  {
    key: "claymation",
    name: "Claymation",
    description: "Tactile. Warm. Handmade.",
    keywords: "clay · stop-motion · tactile · warm",
    accent: "#F39C12",
  },
  {
    key: "wes-anderson",
    name: "Wes Anderson",
    description: "Symmetrical. Pastel. Deadpan.",
    keywords: "symmetry · pastel · deadpan · whimsy",
    accent: "#E91E8C",
  },
  {
    key: "documentary",
    name: "Documentary",
    description: "Natural. Honest. Vérité.",
    keywords: "handheld · vérité · natural · observational",
    accent: "#95A5A6",
  },
  {
    key: "horror",
    name: "Horror Atmospheric",
    description: "Dread. Shadows. Unsettling.",
    keywords: "shadow · desaturated · dread · uncanny",
    accent: "#2C2C2C",
  },
  {
    key: "music-video",
    name: "Music Video Hyper",
    description: "Fast. Punchy. Rhythm-driven.",
    keywords: "hyper · ramp · flash · pulse",
    accent: "#FF0066",
  },
];

export function styleAccent(name: string | null | undefined): string {
  if (!name) return "#94A3B8";
  const m = STYLES.find((s) => s.name === name);
  return m?.accent ?? "#94A3B8";
}

export const TONES: Array<{ key: string; label: string; emoji: string }> = [
  { key: "energetic", label: "Energetic", emoji: "⚡" },
  { key: "cinematic", label: "Cinematic", emoji: "🎬" },
  { key: "conversational", label: "Conversational", emoji: "💬" },
  { key: "motivational", label: "Motivational", emoji: "🔥" },
  { key: "mysterious", label: "Mysterious", emoji: "🌑" },
  { key: "humorous", label: "Humorous", emoji: "😄" },
];

export const GENRES = [
  "Action",
  "Drama",
  "Horror",
  "Romance",
  "Sci-Fi",
  "Fantasy",
  "Documentary",
  "Comedy",
  "Thriller",
  "Mystery",
  "Adventure",
  "Slice of Life",
];
