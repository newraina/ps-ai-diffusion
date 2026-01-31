// packages/plugin/src/services/settings.ts
export interface Settings {
  comfyUrl: string
  authToken: string
}

const STORAGE_KEY = 'ps-ai-diffusion-settings'
const DEFAULT_SETTINGS: Settings = {
  comfyUrl: 'http://localhost:8188',
  authToken: '',
}

export function getSettings(): Settings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return { ...DEFAULT_SETTINGS, ...parsed }
    }
  } catch {
    // Ignore parse errors, return defaults
  }
  return DEFAULT_SETTINGS
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}
