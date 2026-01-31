import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { GenerationState, Workspace, Style, InpaintMode } from '../types'
import { mockStyles } from '../services/mock-data'

interface GenerationContextValue extends GenerationState {
  setWorkspace: (workspace: Workspace) => void
  setStyle: (style: Style) => void
  setPrompt: (prompt: string) => void
  setNegativePrompt: (prompt: string) => void
  setStrength: (strength: number) => void
  setInpaintMode: (mode: InpaintMode) => void
  setBatchSize: (size: number) => void
  setSeed: (seed: number) => void
  setFixedSeed: (fixed: boolean) => void
  randomizeSeed: () => void
  setProgress: (progress: number, text?: string) => void
  setIsGenerating: (generating: boolean) => void
}

const defaultState: GenerationState = {
  workspace: 'generation',
  style: mockStyles[0],
  prompt: '',
  negativePrompt: '',
  strength: 100,
  inpaintMode: 'automatic',
  isGenerating: false,
  progress: 0,
  progressText: '',
  batchSize: 4,
  seed: Math.floor(Math.random() * 2147483647),
  fixedSeed: false,
}

const GenerationContext = createContext<GenerationContextValue | null>(null)

export function GenerationProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GenerationState>(defaultState)

  const setWorkspace = useCallback((workspace: Workspace) => {
    setState(s => ({ ...s, workspace }))
  }, [])

  const setStyle = useCallback((style: Style) => {
    setState(s => ({ ...s, style }))
  }, [])

  const setPrompt = useCallback((prompt: string) => {
    setState(s => ({ ...s, prompt }))
  }, [])

  const setNegativePrompt = useCallback((negativePrompt: string) => {
    setState(s => ({ ...s, negativePrompt }))
  }, [])

  const setStrength = useCallback((strength: number) => {
    setState(s => ({ ...s, strength }))
  }, [])

  const setInpaintMode = useCallback((inpaintMode: InpaintMode) => {
    setState(s => ({ ...s, inpaintMode }))
  }, [])

  const setBatchSize = useCallback((batchSize: number) => {
    setState(s => ({ ...s, batchSize }))
  }, [])

  const setSeed = useCallback((seed: number) => {
    setState(s => ({ ...s, seed }))
  }, [])

  const setFixedSeed = useCallback((fixedSeed: boolean) => {
    setState(s => ({ ...s, fixedSeed }))
  }, [])

  const randomizeSeed = useCallback(() => {
    setState(s => ({ ...s, seed: Math.floor(Math.random() * 2147483647) }))
  }, [])

  const setProgress = useCallback((progress: number, progressText = '') => {
    setState(s => ({ ...s, progress, progressText }))
  }, [])

  const setIsGenerating = useCallback((isGenerating: boolean) => {
    setState(s => ({ ...s, isGenerating }))
  }, [])

  return (
    <GenerationContext.Provider
      value={{
        ...state,
        setWorkspace,
        setStyle,
        setPrompt,
        setNegativePrompt,
        setStrength,
        setInpaintMode,
        setBatchSize,
        setSeed,
        setFixedSeed,
        randomizeSeed,
        setProgress,
        setIsGenerating,
      }}
    >
      {children}
    </GenerationContext.Provider>
  )
}

export function useGeneration() {
  const context = useContext(GenerationContext)
  if (!context) {
    throw new Error('useGeneration must be used within GenerationProvider')
  }
  return context
}
