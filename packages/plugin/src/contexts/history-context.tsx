import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { HistoryGroup } from '../types'
import { mockHistory, placeholderThumbnail } from '../services/mock-data'

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
  // Initialize with placeholder thumbnails
  const [groups, setGroups] = useState<HistoryGroup[]>(() =>
    mockHistory.map(g => ({
      ...g,
      images: g.images.map(img => ({
        ...img,
        thumbnail: img.thumbnail || placeholderThumbnail,
      })),
    }))
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, _setLoading] = useState(false)

  const selectImage = useCallback((jobId: string, index: number) => {
    setSelectedId(`${jobId}-${index}`)
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedId(null)
  }, [])

  const applyImage = useCallback(async (jobId: string, index: number) => {
    // Mark as applied
    setGroups(prev =>
      prev.map(g =>
        g.job_id === jobId
          ? {
              ...g,
              images: g.images.map((img, i) =>
                i === index ? { ...img, applied: true } : img
              ),
            }
          : g
      )
    )
    // TODO: Call actual apply logic
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
