// utils/style-utils.ts
import type { Style } from '../types'

/**
 * Apply style_prompt template to user prompt.
 * Template uses {prompt} as placeholder.
 */
export function applyStylePrompt(stylePrompt: string, userPrompt: string): string {
  if (!stylePrompt || stylePrompt === '{prompt}') {
    return userPrompt
  }
  return stylePrompt.replace('{prompt}', userPrompt)
}

/**
 * Merge style negative prompt with user negative prompt.
 */
export function mergeNegativePrompts(styleNegative: string, userNegative: string): string {
  if (!styleNegative) return userNegative
  if (!userNegative) return styleNegative
  return `${styleNegative}, ${userNegative}`
}

/**
 * Get the first available checkpoint from style, or empty string.
 */
export function getStyleCheckpoint(style: Style): string {
  return style.checkpoints?.[0] || ''
}
