const BRIDGE_URL = 'http://localhost:7860'

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
}

export interface GenerateResponse {
  job_id: string
  status: string
}

export async function getHealth(): Promise<{ status: string }> {
  const response = await fetch(`${BRIDGE_URL}/api/health`)
  return response.json()
}

export async function getConnection(): Promise<ConnectionStatus> {
  const response = await fetch(`${BRIDGE_URL}/api/connection`)
  return response.json()
}

export async function connect(
  backend: 'local' | 'cloud' = 'local',
  comfyUrl?: string,
  authToken?: string,
): Promise<ConnectionStatus> {
  const response = await fetch(`${BRIDGE_URL}/api/connection`, {
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

export async function generate(
  request: GenerateRequest,
): Promise<GenerateResponse> {
  const response = await fetch(`${BRIDGE_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  return response.json()
}
