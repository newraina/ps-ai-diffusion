// utils/sampler-utils.ts

// Sampler preset mapping (subset of samplers.json for client-side resolution)
const SAMPLER_PRESETS: Record<string, { sampler: string; scheduler: string }> = {
  'Default - DPM++ 2M': { sampler: 'dpmpp_2m', scheduler: 'karras' },
  'Alternative - Euler A': { sampler: 'euler_ancestral', scheduler: 'normal' },
  'Creative - DPM++ 2M SDE': { sampler: 'dpmpp_2m_sde_gpu', scheduler: 'karras' },
  'Fast - UniPC BH2': { sampler: 'uni_pc_bh2', scheduler: 'gits' },
  'Euler beta': { sampler: 'euler', scheduler: 'beta' },
  'Turbo/Lightning Merge - DPM++ SDE': { sampler: 'dpmpp_sde_gpu', scheduler: 'karras' },
  'Lightning Merge - Euler A Uniform': { sampler: 'euler_ancestral', scheduler: 'sgm_uniform' },
  'Realtime - Hyper': { sampler: 'euler', scheduler: 'sgm_uniform' },
  'SD3 - DPM++ 2M Uniform': { sampler: 'dpmpp_2m', scheduler: 'sgm_uniform' },
  'Flux - Euler simple': { sampler: 'euler', scheduler: 'simple' },
  'Flux - Turbo': { sampler: 'euler', scheduler: 'simple' },
  'Flux 2 - Euler': { sampler: 'euler', scheduler: 'flux2' },
}

/**
 * Resolve a sampler preset name to actual sampler/scheduler values.
 */
export function resolveStyleSampler(presetName: string): { sampler: string; scheduler: string } {
  return SAMPLER_PRESETS[presetName] || { sampler: 'euler', scheduler: 'normal' }
}
