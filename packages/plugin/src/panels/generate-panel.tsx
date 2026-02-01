import { useCallback, useEffect, useRef } from 'react'
import { Button } from '@swc-react/button'
import { StyleSelector } from '../components/style-selector'
import { PromptSection } from '../components/prompt-section'
import { StrengthSlider } from '../components/strength-slider'
import { GenerateButton } from '../components/generate-button'
import { ProgressBar } from '../components/progress-bar'
import { HistorySection } from '../components/history-section'
import { RegionSection } from '../components/sections/region-section'
import { ControlLayerSection } from '../components/sections/control-layer-section'
import { InpaintSettings } from '../components/sections/inpaint-settings'
import { GenerationSettings } from '../components/sections/generation-settings'
import { LoraSection } from '../components/sections/lora-section'
import { useGeneration } from '../contexts/generation-context'
import { useHistory } from '../contexts/history-context'
import {
  generate,
  getJobStatus,
  getJobImages,
  cancelJob,
  createControlImage,
} from '../services/bridge-client'
import { hasActiveDocument, hasActiveSelection, getSelectionMaskBase64, getDocumentImageBase64, getLayerImageBase64 } from '../services/photoshop-layer'
import { applyStylePrompt, mergeNegativePrompts, getStyleCheckpoint } from '../utils/style-utils'
import { applyAutoResize, applyPromptTranslation } from '../utils/generation-utils'
import { resolveStyleSampler } from '../utils/sampler-utils'
import { buildRegionArgs } from '../utils/region-utils'
import { openBrowser } from '../utils/uxp'
import { getSettings } from '../services/settings'
import type { GenerationSnapshot, HistoryGroup, HistoryImage, QueueItem } from '../types'

interface GeneratePanelProps {
  isConnected: boolean
  onOpenSettings?: () => void
  connectionStatus?: string
}

const POLL_INTERVAL = 500 // ms

export function GeneratePanel({ isConnected, onOpenSettings, connectionStatus }: GeneratePanelProps) {
  const {
    prompt,
    negativePrompt,
    strength,
    batchSize,
    style,
    seed,
    fixedSeed,
    width,
    height,
    steps,
    cfgScale,
    sampler,
    scheduler,
    useStyleDefaults,
    inpaintMode,
    inpaintFill,
    inpaintContext,
    isGenerating,
    setIsGenerating,
    setProgress,
    loras,
    controlLayers,
    regions,
    queue,
    setQueue,
    enqueueJob,
    addRegion,
    addControlLayer,
  } = useGeneration()

  const { addGenerationResult } = useHistory()

  // Track current job for cancellation
  const currentJobRef = useRef<string | null>(null)
  const cancelledRef = useRef(false)
  const queueRef = useRef(queue)

  useEffect(() => {
    queueRef.current = queue
  }, [queue])

  const buildSnapshot = useCallback((): GenerationSnapshot => ({
    prompt,
    negativePrompt,
    strength,
    inpaintMode,
    inpaintFill,
    inpaintContext,
    batchSize,
    seed,
    fixedSeed,
    style,
    width,
    height,
    steps,
    cfgScale,
    sampler,
    scheduler,
    useStyleDefaults,
    loras,
    controlLayers,
    regions,
  }), [
    prompt,
    negativePrompt,
    strength,
    inpaintMode,
    inpaintFill,
    inpaintContext,
    batchSize,
    seed,
    fixedSeed,
    style,
    width,
    height,
    steps,
    cfgScale,
    sampler,
    scheduler,
    useStyleDefaults,
    loras,
    controlLayers,
    regions,
  ])

  const takeNextQueueItem = useCallback(() => {
    const [next, ...rest] = queueRef.current
    if (!next) return null
    setQueue(rest)
    return next
  }, [setQueue])

  const runGeneration = useCallback(async (snapshot: GenerationSnapshot) => {
    if (!snapshot.prompt.trim()) {
      const next = takeNextQueueItem()
      if (next) {
        await runGeneration(next.snapshot)
      }
      return
    }

    if (!hasActiveDocument()) {
      alert('Please open a document first')
      setIsGenerating(false)
      setProgress(0)
      currentJobRef.current = null
      return
    }

    setIsGenerating(true)
    setProgress(0)
    cancelledRef.current = false

    try {
      const isRefineMode = snapshot.strength < 100
      let imageBase64: string | undefined
      let maskBase64: string | null = null

      const hasSelection = await hasActiveSelection()
      if (!hasSelection && snapshot.inpaintMode !== 'automatic') {
        setIsGenerating(false)
        setProgress(0)
        alert('No active selection found for inpaint.')
        return
      }

      if (hasSelection) {
        setProgress(0, 'Capturing selection...')
        try {
          maskBase64 = await getSelectionMaskBase64()
          if (!maskBase64) {
            throw new Error('Selection mask is empty')
          }
        } catch (error) {
          throw new Error(`Failed to capture selection mask: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      }

      if (isRefineMode || maskBase64) {
        setProgress(0, 'Capturing document...')
        try {
          imageBase64 = await getDocumentImageBase64()
        } catch (error) {
          throw new Error(`Failed to capture document: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      }

      const settings = getSettings()
      const translatedPrompt = applyPromptTranslation(snapshot.prompt, settings)
      const translatedNegative = applyPromptTranslation(snapshot.negativePrompt, settings)
      const finalPrompt = snapshot.style
        ? applyStylePrompt(snapshot.style.style_prompt, translatedPrompt)
        : translatedPrompt
      const finalNegative = snapshot.style
        ? mergeNegativePrompts(snapshot.style.negative_prompt, translatedNegative)
        : translatedNegative
      const checkpoint = snapshot.style ? getStyleCheckpoint(snapshot.style) : ''
      const resolvedStyleSampler = snapshot.style
        ? resolveStyleSampler(snapshot.style.sampler)
        : { sampler: 'euler', scheduler: 'normal' }
      const finalSampler = snapshot.useStyleDefaults && snapshot.style
        ? resolvedStyleSampler.sampler
        : snapshot.sampler
      const finalScheduler = snapshot.useStyleDefaults && snapshot.style
        ? resolvedStyleSampler.scheduler
        : snapshot.scheduler
      const finalCfgScale = snapshot.useStyleDefaults && snapshot.style
        ? snapshot.style.cfg_scale
        : snapshot.cfgScale
      const finalSteps = snapshot.useStyleDefaults && snapshot.style
        ? snapshot.style.steps
        : snapshot.steps

      const activeControlLayers = snapshot.controlLayers.filter(
        l => l.isEnabled && (!!l.image || l.layerId !== null),
      )
      const controlNetArgs = []

      if (activeControlLayers.length > 0) {
        setProgress(0, 'Processing control layers...')
        const mapControlMode = (mode: string): string => {
          // Map Photoshop UI modes to shared.resources.ControlMode member names.
          switch (mode) {
            case 'canny':
              return 'canny_edge'
            case 'lineart':
              return 'line_art'
            case 'softedge':
              return 'soft_edge'
            default:
              return mode
          }
        }

        for (const layer of activeControlLayers) {
          try {
            const image = layer.image
              ? layer.image
              : await getLayerImageBase64(layer.layerId!)
            const bounds = layer.layerId
              ? await import('../services/photoshop-layer').then(m => m.getLayerBounds(layer.layerId!))
              : null
            const processedImage = layer.isPreprocessor
              ? (await createControlImage({
                mode: mapControlMode(layer.mode),
                image,
                bounds: bounds || undefined,
                seed: snapshot.fixedSeed ? snapshot.seed : -1,
                performance: {
                  max_pixels: settings.maxPixels,
                  resolution_multiplier: settings.resolutionMultiplier,
                },
              })).image
              : image
            controlNetArgs.push({
              mode: mapControlMode(layer.mode),
              image: processedImage,
              strength: layer.strength,
              range: [layer.rangeStart ?? 0, layer.rangeEnd ?? 1] as [number, number],
              preprocessor: layer.isPreprocessor,
            })
          } catch (e) {
            console.error(`Failed to get image for control layer ${layer.layerName}:`, e)
            throw new Error(`Failed to process control layer "${layer.layerName}"`)
          }
        }
      }

      let regionArgs = []
      if (snapshot.regions.some(r => r.isVisible && r.prompt.trim())) {
        setProgress(0, 'Processing regions...')
        regionArgs = await buildRegionArgs(snapshot.regions)
      }

      setProgress(0, 'Submitting...')
      const { width, height } = applyAutoResize(snapshot.width, snapshot.height, settings)
      const response = await generate({
        prompt: finalPrompt,
        negative_prompt: finalNegative,
        width,
        height,
        batch_size: snapshot.batchSize,
        model: checkpoint,
        sampler: finalSampler,
        scheduler: finalScheduler,
        cfg_scale: finalCfgScale,
        steps: finalSteps,
        seed: snapshot.fixedSeed ? snapshot.seed : -1,
        inpaint_mode: snapshot.inpaintMode,
        inpaint_fill: snapshot.inpaintFill,
        inpaint_context: snapshot.inpaintContext,
        inpaint_padding: settings.selectionPadding,
        inpaint_grow: settings.selectionGrow,
        inpaint_feather: settings.selectionFeather,
        loras: snapshot.loras
          .filter(l => l.name.trim())
          .map(l => ({ name: l.name.trim(), strength: l.strength })),
        control: controlNetArgs.length > 0 ? controlNetArgs : undefined,
        regions: regionArgs.length > 0 ? regionArgs : undefined,
        mask: maskBase64 || undefined,
        performance: {
          max_pixels: settings.maxPixels,
          resolution_multiplier: settings.resolutionMultiplier,
        },
        ...(isRefineMode && {
          image: imageBase64,
          strength: snapshot.strength / 100,
        }),
        ...(!isRefineMode && maskBase64 && {
          image: imageBase64,
          strength: snapshot.strength / 100,
        }),
      })

      const jobId = response.job_id
      currentJobRef.current = jobId

      let finished = false
      while (!finished && !cancelledRef.current) {
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL))

        if (cancelledRef.current) break

        const status = await getJobStatus(jobId)

        switch (status.status) {
          case 'queued':
            setProgress(0, 'Queued...')
            break
          case 'executing':
            setProgress(status.progress, `Generating... ${Math.round(status.progress * 100)}%`)
            break
          case 'finished':
            finished = true
            setProgress(1, 'Fetching images...')
            break
          case 'error':
            if (status.payment_required?.url) {
              const credits =
                typeof status.payment_required.credits === 'number'
                  ? status.payment_required.credits
                  : null
              const message =
                credits !== null
                  ? `Insufficient credits (remaining: ${credits}). Open your account to buy tokens?`
                  : 'Insufficient credits. Open your account to buy tokens?'
              if (confirm(message)) {
                openBrowser(status.payment_required.url)
              }
            }
            throw new Error(status.error || 'Generation failed')
          case 'interrupted':
            finished = true
            break
        }
      }

      if (cancelledRef.current) {
        const next = takeNextQueueItem()
        if (next) {
          await runGeneration(next.snapshot)
        }
        return
      }

      const imagesResponse = await getJobImages(jobId)

      if (imagesResponse.images.length === 0) {
        throw new Error('No images generated')
      }

      const historyImages: HistoryImage[] = imagesResponse.images.map((img, i) => ({
        index: i,
        thumbnail: `data:image/png;base64,${img}`,
        applied: false,
        seed: imagesResponse.seeds[i],
      }))

      const historyGroup: HistoryGroup = {
        job_id: jobId,
        timestamp: new Date().toISOString(),
        prompt: snapshot.prompt,
        negative_prompt: snapshot.negativePrompt,
        strength: snapshot.strength,
        style_id: snapshot.style?.id ?? '',
        images: historyImages,
      }

      addGenerationResult(historyGroup)

      setProgress(1, 'Done!')
      currentJobRef.current = null

      const next = takeNextQueueItem()
      if (next) {
        await runGeneration(next.snapshot)
      } else {
        setTimeout(() => {
          setIsGenerating(false)
          setProgress(0)
        }, 600)
      }

    } catch (error) {
      console.error('Generation failed:', error)
      setIsGenerating(false)
      setProgress(0)
      currentJobRef.current = null
      alert(`Generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }, [
    addGenerationResult,
    setIsGenerating,
    setProgress,
    takeNextQueueItem,
  ])

  const handleGenerate = useCallback(async () => {
    if (isGenerating && currentJobRef.current) {
      cancelledRef.current = true
      try {
        await cancelJob(currentJobRef.current)
      } catch (error) {
        console.error('Failed to cancel job:', error)
      }
      setIsGenerating(false)
      setProgress(0)
      currentJobRef.current = null
      return
    }

    if (!prompt.trim()) return
    await runGeneration(buildSnapshot())
  }, [
    buildSnapshot,
    isGenerating,
    prompt,
    runGeneration,
    setIsGenerating,
    setProgress,
  ])

  const handleQueueCurrent = useCallback(() => {
    if (!prompt.trim()) return
    const snapshot = buildSnapshot()
    const item: QueueItem = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      snapshot,
    }
    enqueueJob(item)
  }, [prompt, buildSnapshot, enqueueJob])

  const handleQueueFront = useCallback(() => {
    if (!prompt.trim()) return
    const snapshot = buildSnapshot()
    const item: QueueItem = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      snapshot,
    }
    setQueue([item, ...queueRef.current])
  }, [prompt, buildSnapshot, setQueue])

  const handleQueueReplace = useCallback(() => {
    if (!prompt.trim()) return
    const snapshot = buildSnapshot()
    const item: QueueItem = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      snapshot,
    }
    setQueue([item])
  }, [prompt, buildSnapshot, setQueue])

  const handleCancelAll = useCallback(async () => {
    // Cancel active job (if any) and clear queue.
    setQueue([])
    if (isGenerating && currentJobRef.current) {
      cancelledRef.current = true
      try {
        await cancelJob(currentJobRef.current)
      } catch (error) {
        console.error('Failed to cancel job:', error)
      }
      setIsGenerating(false)
      setProgress(0)
      currentJobRef.current = null
    }
  }, [isGenerating, setQueue, setIsGenerating, setProgress])

  return (
    <div className="generate-panel">
      <StyleSelector
        onOpenSettings={onOpenSettings}
        connectionStatus={connectionStatus}
      />
      
      <RegionSection />
      
      <PromptSection onSubmit={handleGenerate} disabled={isGenerating} />

      <LoraSection />
      
      <ControlLayerSection />
      
      <div className="inline-actions">
        <Button size="s" variant="secondary" onClick={addControlLayer}>Add Control</Button>
        <Button size="s" variant="secondary" onClick={addRegion}>Add Region</Button>
      </div>

      <StrengthSlider />
      <InpaintSettings />
      <GenerationSettings />

      <GenerateButton
        onClick={handleGenerate}
        onQueueCurrent={handleQueueCurrent}
        onQueueFront={handleQueueFront}
        onQueueReplace={handleQueueReplace}
        onCancelAll={handleCancelAll}
        queueDisabled={!prompt.trim()}
        disabled={!isConnected || !prompt.trim()}
      />
      <ProgressBar />
      <HistorySection />
    </div>
  )
}
