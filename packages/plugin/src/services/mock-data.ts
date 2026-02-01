import type { HistoryGroup, Workspace } from '../types'

export const workspaceLabels: Record<Workspace, string> = {
  generation: 'Generate',
  upscaling: 'Upscale',
  live: 'Live',
  animation: 'Animation',
  custom: 'Custom Graph',
}

export const mockHistory: HistoryGroup[] = [
  {
    job_id: 'mock-job-1',
    timestamp: '16:56',
    prompt: '1 girl, fantasy landscape, detailed',
    negative_prompt: 'bad quality',
    strength: 1.0,
    style_id: 'digital-art-xl',
    images: [
      { index: 0, thumbnail: '', applied: false, seed: 12345 },
      { index: 1, thumbnail: '', applied: true, seed: 12346 },
      { index: 2, thumbnail: '', applied: false, seed: 12347 },
      { index: 3, thumbnail: '', applied: true, seed: 12348 },
    ],
  },
]

// Placeholder image for development (gray square)
export const placeholderThumbnail = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAAACXBIWXMAAAsTAAALEwEAmpwYAAABF0lEQVR4nO3cMQ6AIBAF0cX7H9o7GBttjIWJhfO6DYH8hGxgGgAAAAAAAAAAAAAAoM3c/f1/2/3+zzqmPuBVHbMALzqmPuBVHbMALzqmPuBVHfMWAO86Zn0AeNMx6wPAm45ZHwDedMz6APCmY9YHgDcdsz4AvOmY+gBw1TH1AeCqY+oDwFXH1AeAq46pDwBXHVMfAK46pj4AXHXM+gDwpmPWB4A3HbM+ALzpmPUB4E3HrA8AbzomPwC86pj8APCqY/IDwKuOyQ8ArzomPwC86pj6AHDVMfUB4Kpj6gPAVcfUB4CrjqkPAFcdUx8ArjqmPgBcdUx9ALjqmPoAcNUx6wPAm45ZHwDedAwAAAAAAAAAAAAAAHT4AZCxDmHFufHpAAAAAElFTkSuQmCC'
