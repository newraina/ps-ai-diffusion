// Bridge API modes:
// - ComfyUI extension (default): http://localhost:8188/api/ps-ai-diffusion-bridge
// - Standalone service: http://localhost:7860/api

const DEFAULT_COMFY_URL = 'http://localhost:8188'
const COMFYUI_API_PREFIX = '/api/ps-ai-diffusion-bridge'
const STANDALONE_API_PREFIX = '/api'

let baseUrl = DEFAULT_COMFY_URL
let apiPrefix = COMFYUI_API_PREFIX

export function setBridgeMode(
  mode: 'comfyui' | 'standalone',
  url: string = DEFAULT_COMFY_URL,
) {
  baseUrl = url.replace(/\/$/, '')
  if (mode === 'comfyui') {
    apiPrefix = COMFYUI_API_PREFIX
  } else {
    apiPrefix = STANDALONE_API_PREFIX
  }
}

export function getBridgeUrl(): string {
  return `${baseUrl}${apiPrefix}`
}

function getApiUrl(path: string): string {
  return `${baseUrl}${apiPrefix}${path}`
}

export interface CloudUser {
  id: string
  name: string
  credits: number
  images_generated: number
}

export interface CloudNews {
  text: string
  digest: string
}

export interface CloudFeatures {
  ip_adapter: boolean
  translation: boolean
  max_upload_size: number
  max_control_layers: number
}

export interface ConnectionStatus {
  status: 'disconnected' | 'connecting' | 'connected' | 'error' | 'auth_pending'
  backend: 'local' | 'cloud'
  comfy_url: string
  error: string | null
  user?: CloudUser // Only present for cloud backend when connected
  web_url?: string
  account_url?: string
  buy_tokens_url?: string
  features?: CloudFeatures | null
  news?: CloudNews | null
}

export interface DiagnosticsResponse {
  backend?: 'local' | 'cloud'
  connected: boolean
  error?: string
  missing_nodes: string[]
  missing_required_models: string[]
  missing_optional_models: string[]
}

export interface GenerateRequest {
  prompt: string
  negative_prompt?: string
  width?: number
  height?: number
  steps?: number
  cfg_scale?: number
  seed?: number
  image?: string
  strength?: number // 0.0-1.0, denoise strength for img2img
  mask?: string
  // Inpaint parameters (best-effort; supported by bridge for local/cloud workflows)
  inpaint_mode?: string
  inpaint_fill?: string
  inpaint_context?: string
  inpaint_padding?: number
  inpaint_grow?: number
  inpaint_feather?: number
  batch_size?: number
  sampler?: string
  scheduler?: string
  model?: string
  loras?: Array<{ name: string; strength?: number; data?: string }>
  control?: Array<{
    mode: string
    image?: string
    strength?: number
    range?: [number, number]
  }>
  regions?: Array<{
    positive?: string
    mask: string
    bounds?: { x: number; y: number; width: number; height: number }
    control?: Array<{
      mode: string
      image?: string
      strength?: number
      range?: [number, number]
    }>
    loras?: Array<{ name: string; strength?: number; data?: string }>
  }>
}

export interface UpscaleRequest {
  image: string // Base64 encoded PNG
  factor: number
  model?: string
  // Optional tiled diffusion refine after upscaling
  refine?: boolean
  checkpoint?: string
  prompt?: string
  negative_prompt?: string
  steps?: number
  cfg_scale?: number
  sampler?: string
  scheduler?: string
  seed?: number
  strength?: number
  tile_overlap?: number
  loras?: Array<{ name: string; strength?: number; data?: string }>
}

export interface GenerateResponse {
  job_id: string
  status: string
}

export async function getHealth(): Promise<{ status: string }> {
  const response = await fetch(getApiUrl('/health'))
  return response.json()
}

export async function getConnection(): Promise<ConnectionStatus> {
  const response = await fetch(getApiUrl('/connection'))
  return response.json()
}

export async function getDiagnostics(): Promise<DiagnosticsResponse> {
  const response = await fetch(getApiUrl('/diagnostics'))
  return response.json()
}

export async function connect(
  backend: 'local' | 'cloud' = 'local',
  comfyUrl?: string,
  authToken?: string,
): Promise<ConnectionStatus> {
  const response = await fetch(getApiUrl('/connection'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      backend,
      comfy_url: comfyUrl,
      auth_token: authToken || null,
    }),
  })
  return response.json()
}

export async function testConnection(): Promise<{ reachable: boolean; error?: string }> {
  try {
    const response = await fetch(getApiUrl('/health'))
    if (response.ok) {
      return { reachable: true }
    }
    return { reachable: false, error: `HTTP ${response.status}` }
  } catch (e) {
    return { reachable: false, error: String(e) }
  }
}

export interface JobStatus {
  job_id: string
  status: 'queued' | 'executing' | 'finished' | 'error' | 'interrupted'
  progress: number
  error: string | null
  payment_required?: {
    url: string
    credits?: number | null
    details?: Record<string, unknown> | null
  } | null
  image_count: number
}

export interface JobImages {
  job_id: string
  images: string[] // Base64 encoded PNG images
  seeds: number[] // Seed used for each image
}

export interface StyleSummary {
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

export interface StylesResponse {
  styles: StyleSummary[]
}

export async function generate(
  request: GenerateRequest,
): Promise<GenerateResponse> {
  const response = await fetch(getApiUrl('/generate'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || error.error || 'Generation failed')
  }
  return response.json()
}

export async function getJobStatus(jobId: string): Promise<JobStatus> {
  const response = await fetch(getApiUrl(`/jobs/${jobId}`))
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || error.error || 'Failed to get job status')
  }
  return response.json()
}

export async function getJobImages(jobId: string): Promise<JobImages> {
  const response = await fetch(getApiUrl(`/jobs/${jobId}/images`))
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || error.error || 'Failed to get job images')
  }
  return response.json()
}

export async function cancelJob(jobId: string): Promise<void> {
  const response = await fetch(getApiUrl(`/jobs/${jobId}/cancel`), {
    method: 'POST',
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || error.error || 'Failed to cancel job')
  }
}

export async function getStyles(): Promise<StylesResponse> {
  const response = await fetch(getApiUrl('/styles'))
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || error.error || 'Failed to get styles')
  }
  return response.json()
}

export async function upscale(request: UpscaleRequest): Promise<GenerateResponse> {
  const response = await fetch(getApiUrl('/upscale'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || error.error || 'Upscale failed')
  }
  return response.json()
}

export async function runCustomWorkflow(workflow: Record<string, unknown>): Promise<GenerateResponse> {
  const response = await fetch(getApiUrl('/custom'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workflow }),
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || error.error || 'Custom workflow failed')
  }
  return response.json()
}

// Cloud Authentication APIs

export interface SignInResponse {
  sign_in_url: string
  status: 'pending'
}

export interface AuthConfirmResponse {
  status: 'pending' | 'authorized' | 'timeout' | 'error'
  token?: string
  user?: CloudUser
  error?: string
}

export interface AuthValidateResponse {
  valid: boolean
  user?: CloudUser
  error?: string
}

export async function signIn(): Promise<SignInResponse> {
  const response = await fetch(getApiUrl('/auth/sign-in'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || error.error || 'Sign-in failed')
  }
  return response.json()
}

export async function authConfirm(): Promise<AuthConfirmResponse> {
  const response = await fetch(getApiUrl('/auth/confirm'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  return response.json()
}

export async function authValidate(token: string): Promise<AuthValidateResponse> {
  const response = await fetch(getApiUrl('/auth/validate'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
  return response.json()
}
