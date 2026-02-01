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
  comfyUrl: string = DEFAULT_COMFY_URL,
) {
  if (mode === 'comfyui') {
    baseUrl = comfyUrl.replace(/\/$/, '')
    apiPrefix = COMFYUI_API_PREFIX
  } else {
    baseUrl = 'http://localhost:7860'
    apiPrefix = STANDALONE_API_PREFIX
  }
}

export function getBridgeUrl(): string {
  return `${baseUrl}${apiPrefix}`
}

function getApiUrl(path: string): string {
  return `${baseUrl}${apiPrefix}${path}`
}

export interface ConnectionStatus {
  status: 'disconnected' | 'connecting' | 'connected' | 'error'
  backend: 'local' | 'cloud'
  comfy_url: string
  error: string | null
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
  mask?: string
  batch_size?: number
  sampler?: string
  scheduler?: string
  model?: string
}

export interface UpscaleRequest {
  image: string // Base64 encoded PNG
  factor: number
  model?: string
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

export async function testConnection(
  comfyUrl: string,
  authToken?: string,
): Promise<ConnectionStatus> {
  return connect('local', comfyUrl, authToken)
}

export interface JobStatus {
  job_id: string
  status: 'queued' | 'executing' | 'finished' | 'error' | 'interrupted'
  progress: number
  error: string | null
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
