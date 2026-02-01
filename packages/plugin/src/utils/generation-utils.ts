import type { Settings } from '../services/settings'

const MIN_SIZE = 64
const MULTIPLE = 8

function roundToMultiple(value: number, multiple: number): number {
  if (multiple <= 0) return Math.round(value)
  return Math.round(value / multiple) * multiple
}

export function applyPromptTranslation(
  prompt: string,
  settings: Settings,
): string {
  if (!settings.enablePromptTranslation) return prompt
  const language = settings.promptTranslation?.trim()
  if (!language) return prompt
  if (!prompt.trim()) return prompt
  return `lang:${language} ${prompt} lang:en `
}

export function applyAutoResize(
  width: number,
  height: number,
  settings: Settings,
): { width: number; height: number } {
  if (!settings.autoResize) {
    return { width, height }
  }

  const multiplier = Number.isFinite(settings.resolutionMultiplier)
    ? settings.resolutionMultiplier
    : 1.0
  let nextWidth = Math.round(width * multiplier)
  let nextHeight = Math.round(height * multiplier)

  const maxPixels = Number.isFinite(settings.maxPixels) ? settings.maxPixels : 0
  if (maxPixels > 0) {
    const pixelCount = nextWidth * nextHeight
    if (pixelCount > maxPixels) {
      const scale = Math.sqrt(maxPixels / pixelCount)
      nextWidth = Math.round(nextWidth * scale)
      nextHeight = Math.round(nextHeight * scale)
    }
  }

  nextWidth = Math.max(MIN_SIZE, roundToMultiple(nextWidth, MULTIPLE))
  nextHeight = Math.max(MIN_SIZE, roundToMultiple(nextHeight, MULTIPLE))

  return { width: nextWidth, height: nextHeight }
}
