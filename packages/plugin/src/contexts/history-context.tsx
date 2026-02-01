import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import type { HistoryGroup } from '../types'
import { updatePreviewLayer, applyAsLayer, deletePreviewLayer } from '../services/photoshop-layer'

interface HistoryContextValue {
  groups: HistoryGroup[]
  selectedId: string | null  // "jobId-index"
  loading: boolean
  selectImage: (jobId: string, index: number) => void
  clearSelection: () => void
  applyImage: (jobId: string, index: number) => Promise<void>
  discardImage: (jobId: string, index: number) => void
  clearHistory: () => void
  addGenerationResult: (group: HistoryGroup) => void
}

const HistoryContext = createContext<HistoryContextValue | null>(null)

export function HistoryProvider({ children }: { children: ReactNode }) {
  const STORAGE_KEY = 'ps-ai-diffusion-history-v1'

  const [groups, setGroups] = useState<HistoryGroup[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed as HistoryGroup[]
    } catch {
      return []
    }
  })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, _setLoading] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(groups))
    } catch {
      // Ignore storage errors (quota, etc.)
    }
  }, [groups])

  const selectImage = useCallback((jobId: string, index: number) => {
    setSelectedId(`${jobId}-${index}`)
    const group = groups.find(g => g.job_id === jobId)
    const image = group?.images[index]
    if (group && image) {
      updatePreviewLayer(image.thumbnail, group.prompt)
    }
  }, [groups])

  const clearSelection = useCallback(() => {
    setSelectedId(null)
    // Remove preview layer
    deletePreviewLayer()
  }, [])

  const applyImage = useCallback(async (jobId: string, index: number) => {
    // Find the group and image
    let group: HistoryGroup | undefined
    let imageData: { thumbnail: string; seed: number } | undefined

    setGroups(prev => {
      group = prev.find(g => g.job_id === jobId)
      if (group) {
        imageData = group.images[index]
      }
      // Mark as applied
      return prev.map(g =>
        g.job_id === jobId
          ? {
              ...g,
              images: g.images.map((img, i) =>
                i === index ? { ...img, applied: true } : img
              ),
            }
          : g
      )
    })

    // Apply to Photoshop layer
    if (group && imageData) {
      await applyAsLayer(imageData.thumbnail, group.prompt, imageData.seed)
      // Remove preview layer after applying
      await deletePreviewLayer()
    }
  }, [])

  const discardImage = useCallback((jobId: string, index: number) => {
    setGroups(prev =>
      prev.map(g =>
        g.job_id === jobId
          ? {
              ...g,
              images: g.images.filter((_, i) => i !== index),
            }
          : g
      ).filter(g => g.images.length > 0)
    )
    // Clear selection if discarded image was selected
    setSelectedId(prev => (prev === `${jobId}-${index}` ? null : prev))
  }, [])

  const clearHistory = useCallback(() => {
    setGroups([])
    setSelectedId(null)
  }, [])

  const addGenerationResult = useCallback((group: HistoryGroup) => {
    setGroups(prev => [...prev, group])
  }, [])

  return (
    <HistoryContext.Provider
      value={{
        groups,
        selectedId,
        loading,
        selectImage,
        clearSelection,
        applyImage,
        discardImage,
        clearHistory,
        addGenerationResult,
      }}
    >
      {children}
    </HistoryContext.Provider>
  )
}

export function useHistory() {
  const context = useContext(HistoryContext)
  if (!context) {
    throw new Error('useHistory must be used within HistoryProvider')
  }
  return context
}
