import type {
  StoryResponse,
  VideoPromptsResponse,
  MusicBriefResponse,
  VoiceoverResponse,
} from "@workspace/api-client-react";

export interface ProjectPart extends VideoPromptsResponse {
  partNumber: number;
}

export interface ProjectVoiceoverPart extends VoiceoverResponse {
  partNumber: number;
}

export interface ProjectVoiceover {
  language: "english" | "hindi" | "hinglish";
  tone: string;
  parts: ProjectVoiceoverPart[];
}

export interface Project {
  id: string;
  title: string;
  brief: string;
  genre: string;
  story: StoryResponse | null;
  style: string | null;
  duration: number; // per-part seconds
  totalDuration: number; // total seconds requested at story creation
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
}): Project {
  const now = new Date().toISOString();
  return {
    id: newId(),
    title: input.title || "Untitled project",
    brief: input.brief,
    genre: input.genre,
    story: null,
    style: null,
    duration: 5,
    totalDuration: input.totalDuration,
    parts: [],
    music: null,
    voiceover: null,
    createdAt: now,
    updatedAt: now,
  };
}

export const storage = {
  getProjects(): Project[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PROJECTS);
      return data ? (JSON.parse(data) as Project[]) : [];
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
    description: "Real camera, photorealistic, film grain, anamorphic lens flares",
    keywords: "photoreal · 35mm · grain · anamorphic",
    accent: "#9CA3AF",
  },
  {
    key: "anime-2d",
    name: "Anime 2D",
    description: "Hand-drawn animation, cel shading, dramatic lighting, Japanese anime",
    keywords: "cel-shaded · ink · sakura · dynamic",
    accent: "#FB7185",
  },
  {
    key: "pixar-3d",
    name: "3D Pixar Style",
    description: "Soft lighting, subsurface scattering, exaggerated proportions, Pixar render",
    keywords: "soft · 3D · expressive · render",
    accent: "#60A5FA",
  },
  {
    key: "pixel-art",
    name: "Pixel Art",
    description: "16-bit / 32-bit pixel aesthetic, retro gaming, limited color palette",
    keywords: "pixels · 16-bit · retro · CRT",
    accent: "#34D399",
  },
  {
    key: "ghibli",
    name: "Studio Ghibli",
    description: "Painterly watercolor backgrounds, Miyazaki movement, soft natural light",
    keywords: "painterly · watercolor · gentle · wonder",
    accent: "#F59E0B",
  },
  {
    key: "cyberpunk",
    name: "Cyberpunk Neon",
    description: "Neon lighting, rain-slicked streets, holographic UI, blade runner",
    keywords: "neon · rain · holo · noir",
    accent: "#22D3EE",
  },
  {
    key: "dark-fantasy",
    name: "Dark Fantasy",
    description: "Gothic, dramatic shadows, fog, medieval/magical environment, dark grade",
    keywords: "gothic · fog · candlelight · arcane",
    accent: "#A78BFA",
  },
  {
    key: "claymation",
    name: "Claymation",
    description: "Stop-motion clay texture, soft rounded forms, tactile warmth",
    keywords: "clay · stop-motion · tactile · warm",
    accent: "#F472B6",
  },
  {
    key: "wes-anderson",
    name: "Wes Anderson",
    description: "Symmetrical framing, pastel palette, deadpan flat lighting, whimsy",
    keywords: "symmetry · pastel · deadpan · whimsy",
    accent: "#FBBF24",
  },
  {
    key: "documentary",
    name: "Documentary Handheld",
    description: "Naturalistic, handheld shake, available light, vérité style",
    keywords: "handheld · vérité · natural · observational",
    accent: "#94A3B8",
  },
  {
    key: "horror",
    name: "Horror Atmospheric",
    description: "Deep shadows, desaturated color, slow creeping dread, unsettling angles",
    keywords: "shadow · desaturated · dread · uncanny",
    accent: "#EF4444",
  },
  {
    key: "music-video",
    name: "Music Video — Hyper Edit",
    description: "Fast cuts, speed ramps, flash transitions, high-energy rhythm editing",
    keywords: "hyper · ramp · flash · pulse",
    accent: "#E8FF47",
  },
];

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
