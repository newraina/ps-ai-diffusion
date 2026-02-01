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

export type InpaintFillMode = 'none' | 'neutral' | 'blur' | 'border' | 'inpaint'
export type InpaintContext = 'automatic' | 'mask_bounds' | 'entire_image'

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

// LoRA types
export interface LoraItem {
  id: string
  name: string
  strength: number
}

// Control Layer types
export type ControlMode = 
  | 'reference'
  | 'style'
  | 'composition'
  | 'face'
  | 'canny'
  | 'depth'
  | 'pose'
  | 'lineart'
  | 'scribble'
  | 'segmentation'
  | 'normal'
  | 'softedge'

export interface ControlLayer {
  id: string
  mode: ControlMode
  layerId: number | null // Photoshop layer ID
  layerName: string
  image: string | null // base64
  strength: number
  rangeStart: number // 0.0-1.0
  rangeEnd: number // 0.0-1.0
  isEnabled: boolean
  isPreprocessor: boolean
}

// Region types
export type RegionMaskSource = 'selection' | 'layer'

export interface RegionBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface Region {
  id: string
  name: string
  prompt: string
  layerId: number | null // Linked Photoshop layer ID
  maskSource: RegionMaskSource
  maskBase64: string | null // base64 PNG (black/white)
  bounds: RegionBounds | null // bounds in document coordinates
  isVisible: boolean
}

export interface GenerationSnapshot {
  prompt: string
  negativePrompt: string
  strength: number
  inpaintMode: InpaintMode
  inpaintFill: InpaintFillMode
  inpaintContext: InpaintContext
  batchSize: number
  seed: number
  fixedSeed: boolean
  style: Style | null
  width: number
  height: number
  steps: number
  cfgScale: number
  sampler: string
  scheduler: string
  useStyleDefaults: boolean
  loras: LoraItem[]
  controlLayers: ControlLayer[]
  regions: Region[]
}

export interface QueueItem {
  id: string
  createdAt: string
  snapshot: GenerationSnapshot
}

// Generation state
export interface GenerationState {
  workspace: Workspace
  style: Style | null
  prompt: string
  negativePrompt: string
  strength: number
  inpaintMode: InpaintMode
  inpaintFill: InpaintFillMode
  inpaintContext: InpaintContext
  isGenerating: boolean
  progress: number
  progressText: string
  batchSize: number
  seed: number
  fixedSeed: boolean
  width: number
  height: number
  steps: number
  cfgScale: number
  sampler: string
  scheduler: string
  useStyleDefaults: boolean
  loras: LoraItem[]
  controlLayers: ControlLayer[]
  regions: Region[]
  queue: QueueItem[]
}

// Queue state
export interface QueueState {
  documentCount: number
  totalCount: number
}
