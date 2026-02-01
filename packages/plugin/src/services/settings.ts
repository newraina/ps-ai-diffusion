// packages/plugin/src/services/settings.ts
export type ConnectionMode = 'comfyui-extension' | 'standalone-bridge'
export type BackendType = 'local' | 'cloud'

export interface Settings {
  connectionMode: ConnectionMode
  comfyUrl: string
  authToken: string
  // Cloud service settings
  backendType: BackendType
  cloudAccessToken: string
  // General settings
  promptTranslation: string
  promptLineCount: number
  showNegativePrompt: boolean
  confirmDiscardImage: boolean
}

const STORAGE_KEY = 'ps-ai-diffusion-settings'
const DEFAULT_SETTINGS: Settings = {
  connectionMode: 'comfyui-extension',
  comfyUrl: 'http://localhost:8188',
  authToken: '',
  backendType: 'local',
  cloudAccessToken: '',
  promptTranslation: '',
  promptLineCount: 3,
  showNegativePrompt: true,
  confirmDiscardImage: true,
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
