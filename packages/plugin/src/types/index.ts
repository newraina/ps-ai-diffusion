// Workspace types
export type Workspace = 'generation' | 'upscaling' | 'live' | 'animation' | 'custom'

// Style types - matches StyleSummary from API
export interface Style {
  id: string
  name: string
  architecture: string
  sampler: string
  cfg_scale: number
  steps: number
  style_prompt: string
  negative_prompt: string
  checkpoints: string[]
}

// Helper to get architecture prefix for display
export function getArchPrefix(arch: string): string {
  switch (arch) {
    case 'sdxl':
      return 'XL'
    case 'flux':
    case 'flux_k':
      return 'F'
    case 'sd3':
      return 'SD3'
    case 'sd15':
      return 'SD'
    default:
      return ''
  }
}

// Inpaint modes
export type InpaintMode =
  | 'automatic'
  | 'fill'
  | 'expand'
  | 'add_object'
  | 'remove_object'
  | 'replace_background'
  | 'custom'

// History types
export interface HistoryImage {
  index: number
  thumbnail: string  // base64
  applied: boolean
  seed: number
}

export interface HistoryGroup {
  job_id: string
  timestamp: string
  prompt: string
  negative_prompt: string
  strength: number
  style_id: string
  images: HistoryImage[]
}

// Generation state
export interface GenerationState {
  workspace: Workspace
  style: Style | null
  prompt: string
  negativePrompt: string
  strength: number
  inpaintMode: InpaintMode
  isGenerating: boolean
  progress: number
  progressText: string
  batchSize: number
  seed: number
  fixedSeed: boolean
}

// Queue state
export interface QueueState {
  documentCount: number
  totalCount: number
}
