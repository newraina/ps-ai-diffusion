import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { GenerationState, Workspace, Style, InpaintMode, InpaintFillMode, InpaintContext, ControlLayer, Region, QueueItem } from '../types'

interface GenerationContextValue extends GenerationState {
  setWorkspace: (workspace: Workspace) => void
  setStyle: (style: Style) => void
  setPrompt: (prompt: string) => void
  setNegativePrompt: (prompt: string) => void
  setStrength: (strength: number) => void
  setInpaintMode: (mode: InpaintMode) => void
  setInpaintFill: (mode: InpaintFillMode) => void
  setInpaintContext: (context: InpaintContext) => void
  setBatchSize: (size: number) => void
  setSeed: (seed: number) => void
  setFixedSeed: (fixed: boolean) => void
  randomizeSeed: () => void
  setWidth: (width: number) => void
  setHeight: (height: number) => void
  setSteps: (steps: number) => void
  setCfgScale: (cfgScale: number) => void
  setSampler: (sampler: string) => void
  setScheduler: (scheduler: string) => void
  setUseStyleDefaults: (useDefaults: boolean) => void
  setControlLayers: (layers: ControlLayer[]) => void
  addControlLayer: () => void
  updateControlLayer: (id: string, updates: Partial<ControlLayer>) => void
  removeControlLayer: (id: string) => void
  setRegions: (regions: Region[]) => void
  addRegion: () => void
  updateRegion: (id: string, updates: Partial<Region>) => void
  removeRegion: (id: string) => void
  setQueue: (items: QueueItem[]) => void
  enqueueJob: (item: QueueItem) => void
  removeQueueItem: (id: string) => void
  clearQueue: () => void
  setProgress: (progress: number, text?: string) => void
  setIsGenerating: (generating: boolean) => void
}

const defaultState: GenerationState = {
  workspace: 'generation',
  style: null,  // Will be set when styles load
  prompt: '',
  negativePrompt: '',
  strength: 100,
  inpaintMode: 'automatic',
  inpaintFill: 'neutral',
  inpaintContext: 'automatic',
  isGenerating: false,
  progress: 0,
  progressText: '',
  batchSize: 4,
  seed: Math.floor(Math.random() * 2147483647),
  fixedSeed: false,
  width: 512,
  height: 512,
  steps: 20,
  cfgScale: 7.0,
  sampler: 'euler',
  scheduler: 'normal',
  useStyleDefaults: true,
  controlLayers: [],
  regions: [],
  queue: [],
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

  const setInpaintFill = useCallback((inpaintFill: InpaintFillMode) => {
    setState(s => ({ ...s, inpaintFill }))
  }, [])

  const setInpaintContext = useCallback((inpaintContext: InpaintContext) => {
    setState(s => ({ ...s, inpaintContext }))
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

  const setWidth = useCallback((width: number) => {
    setState(s => ({ ...s, width }))
  }, [])

  const setHeight = useCallback((height: number) => {
    setState(s => ({ ...s, height }))
  }, [])

  const setSteps = useCallback((steps: number) => {
    setState(s => ({ ...s, steps }))
  }, [])

  const setCfgScale = useCallback((cfgScale: number) => {
    setState(s => ({ ...s, cfgScale }))
  }, [])

  const setSampler = useCallback((sampler: string) => {
    setState(s => ({ ...s, sampler }))
  }, [])

  const setScheduler = useCallback((scheduler: string) => {
    setState(s => ({ ...s, scheduler }))
  }, [])

  const setUseStyleDefaults = useCallback((useStyleDefaults: boolean) => {
    setState(s => ({ ...s, useStyleDefaults }))
  }, [])

  const setControlLayers = useCallback((controlLayers: ControlLayer[]) => {
    setState(s => ({ ...s, controlLayers }))
  }, [])

  const addControlLayer = useCallback(() => {
    const newLayer: ControlLayer = {
      id: crypto.randomUUID(),
      mode: 'canny',
      layerId: null,
      layerName: '',
      image: null,
      strength: 1.0,
      isEnabled: true,
      isPreprocessor: true,
    }
    setState(s => ({ ...s, controlLayers: [...s.controlLayers, newLayer] }))
  }, [])

  const updateControlLayer = useCallback((id: string, updates: Partial<ControlLayer>) => {
    setState(s => ({
      ...s,
      controlLayers: s.controlLayers.map(l => (l.id === id ? { ...l, ...updates } : l)),
    }))
  }, [])

  const removeControlLayer = useCallback((id: string) => {
    setState(s => ({
      ...s,
      controlLayers: s.controlLayers.filter(l => l.id !== id),
    }))
  }, [])

  const setRegions = useCallback((regions: Region[]) => {
    setState(s => ({ ...s, regions }))
  }, [])

  const addRegion = useCallback(() => {
    const newRegion: Region = {
      id: crypto.randomUUID(),
      name: `Region ${state.regions.length + 1}`,
      prompt: '',
      negativePrompt: '',
      layerId: null,
      isVisible: true,
    }
    setState(s => ({ ...s, regions: [...s.regions, newRegion] }))
  }, [])

  const updateRegion = useCallback((id: string, updates: Partial<Region>) => {
    setState(s => ({
      ...s,
      regions: s.regions.map(r => (r.id === id ? { ...r, ...updates } : r)),
    }))
  }, [])

  const removeRegion = useCallback((id: string) => {
    setState(s => ({
      ...s,
      regions: s.regions.filter(r => r.id !== id),
    }))
  }, [])

  const setQueue = useCallback((queue: QueueItem[]) => {
    setState(s => ({ ...s, queue }))
  }, [])

  const enqueueJob = useCallback((item: QueueItem) => {
    setState(s => ({ ...s, queue: [...s.queue, item] }))
  }, [])

  const removeQueueItem = useCallback((id: string) => {
    setState(s => ({
      ...s,
      queue: s.queue.filter(item => item.id !== id),
    }))
  }, [])

  const clearQueue = useCallback(() => {
    setState(s => ({ ...s, queue: [] }))
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
        setInpaintFill,
        setInpaintContext,
        setBatchSize,
        setSeed,
        setFixedSeed,
        randomizeSeed,
        setWidth,
        setHeight,
        setSteps,
        setCfgScale,
        setSampler,
        setScheduler,
        setUseStyleDefaults,
        setControlLayers,
        addControlLayer,
        updateControlLayer,
        removeControlLayer,
        setRegions,
        addRegion,
        updateRegion,
        removeRegion,
        setQueue,
        enqueueJob,
        removeQueueItem,
        clearQueue,
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
