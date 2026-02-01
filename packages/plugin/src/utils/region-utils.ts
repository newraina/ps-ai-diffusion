import type { Region, RegionBounds } from '../types'
import {
  getSelectionBounds,
  getSelectionMaskBase64,
  getLayerBounds,
  getLayerTransparencyMaskBase64,
} from '../services/photoshop-layer'

interface RegionArgsItem {
  positive: string
  mask: string
  bounds?: RegionBounds
}

export async function buildRegionArgs(regions: Region[]): Promise<RegionArgsItem[]> {
  const activeRegions = regions.filter(r => r.isVisible && r.prompt.trim())
  if (activeRegions.length === 0) return []

  const needsSelection = activeRegions.some(r => r.maskSource === 'selection')
  let selectionMask: string | null = null
  let selectionBounds: RegionBounds | null = null

  if (needsSelection) {
    selectionMask = await getSelectionMaskBase64()
    selectionBounds = await getSelectionBounds()
  }

  const args: RegionArgsItem[] = []

  for (const region of activeRegions) {
    let mask: string | null = null
    let bounds: RegionBounds | null = null

    if (region.maskSource === 'selection') {
      mask = selectionMask
      bounds = selectionBounds
    } else if (region.maskSource === 'layer' && region.layerId) {
      bounds = await getLayerBounds(region.layerId)
      mask = await getLayerTransparencyMaskBase64(region.layerId)
    }

    if (!mask) {
      mask = region.maskBase64
      bounds = bounds || region.bounds
    }

    if (!mask) {
      console.warn(`Skipping region "${region.name}" - no mask available`)
      continue
    }

    args.push({
      positive: region.prompt,
      mask,
      bounds: bounds || undefined,
    })
  }

  return args
}
