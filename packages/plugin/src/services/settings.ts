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
  enablePromptTranslation: boolean
  promptTranslation: string
  promptLineCount: number
  showNegativePrompt: boolean
  confirmDiscardImage: boolean
  // Diffusion settings
  selectionPadding: number
  selectionGrow: number
  selectionFeather: number
  // Performance settings
  maxPixels: number
  resolutionMultiplier: number
  autoResize: boolean
}

const STORAGE_KEY = 'ps-ai-diffusion-settings'
const DEFAULT_SETTINGS: Settings = {
  connectionMode: 'comfyui-extension',
  comfyUrl: 'http://localhost:8188',
  authToken: '',
  backendType: 'local',
  cloudAccessToken: '',
  enablePromptTranslation: false,
  promptTranslation: 'en',
  promptLineCount: 3,
  showNegativePrompt: true,
  confirmDiscardImage: true,
  selectionPadding: 32,
  selectionGrow: 0,
  selectionFeather: 8,
  maxPixels: 12000000,
  resolutionMultiplier: 1.0,
  autoResize: true,
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
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('ps-ai-diffusion-settings-updated', { detail: settings }))
  }
}
