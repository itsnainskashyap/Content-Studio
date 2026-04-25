import { StoryBeat, VideoPrompt, MusicBriefResponse, VoiceoverResponse } from "@workspace/api-client-react";

export interface Project {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  story?: {
    title: string;
    logline?: string;
    genre?: string;
    tone?: string;
    beats: StoryBeat[];
  };
  prompts?: VideoPrompt[];
  music?: MusicBriefResponse;
  voiceover?: VoiceoverResponse;
}

export interface Settings {
  defaultAspectRatio: string;
  defaultLanguage: string;
  defaultVoiceProfile: string;
  defaultWPM: number;
  defaultDuration: number;
}

const DEFAULT_SETTINGS: Settings = {
  defaultAspectRatio: "16:9",
  defaultLanguage: "english",
  defaultVoiceProfile: "narrator",
  defaultWPM: 150,
  defaultDuration: 5,
};

const STORAGE_KEYS = {
  PROJECTS: "cs_projects",
  SETTINGS: "cs_settings",
  CURRENT_PROJECT_ID: "cs_current_project_id",
};

export const storage = {
  getProjects: (): Project[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PROJECTS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  saveProject: (project: Project): void => {
    const projects = storage.getProjects();
    const existingIndex = projects.findIndex((p) => p.id === project.id);
    const updated = { ...project, updatedAt: new Date().toISOString() };
    
    if (existingIndex >= 0) {
      projects[existingIndex] = updated;
    } else {
      projects.unshift(updated);
    }
    localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(projects));
  },

  getProject: (id: string): Project | undefined => {
    return storage.getProjects().find((p) => p.id === id);
  },

  deleteProject: (id: string): void => {
    const projects = storage.getProjects().filter((p) => p.id !== id);
    localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(projects));
    if (storage.getCurrentProjectId() === id) {
      storage.setCurrentProjectId(null);
    }
  },

  getCurrentProjectId: (): string | null => {
    return localStorage.getItem(STORAGE_KEYS.CURRENT_PROJECT_ID);
  },

  setCurrentProjectId: (id: string | null): void => {
    if (id) {
      localStorage.setItem(STORAGE_KEYS.CURRENT_PROJECT_ID, id);
    } else {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_PROJECT_ID);
    }
  },

  getSettings: (): Settings => {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      return data ? { ...DEFAULT_SETTINGS, ...JSON.parse(data) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  },

  saveSettings: (settings: Settings): void => {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  },

  exportData: (): string => {
    return JSON.stringify({
      projects: storage.getProjects(),
      settings: storage.getSettings(),
    });
  },

  importData: (jsonData: string): boolean => {
    try {
      const data = JSON.parse(jsonData);
      if (Array.isArray(data.projects)) {
        localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(data.projects));
      }
      if (data.settings) {
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(data.settings));
      }
      return true;
    } catch {
      return false;
    }
  },

  clearAll: (): void => {
    localStorage.removeItem(STORAGE_KEYS.PROJECTS);
    localStorage.removeItem(STORAGE_KEYS.SETTINGS);
    localStorage.removeItem(STORAGE_KEYS.CURRENT_PROJECT_ID);
  },
};
