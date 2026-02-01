import { useCallback, useRef, useState } from 'react'
import { Button } from '@swc-react/button'
import { StyleSelector } from '../components/style-selector'
import { PromptSection } from '../components/prompt-section'
import { GenerationSettings } from '../components/sections/generation-settings'
import { StrengthSlider } from '../components/strength-slider'
import { ProgressBar } from '../components/progress-bar'
import { RegionSection } from '../components/sections/region-section'
import { ControlLayerSection } from '../components/sections/control-layer-section'
import { LoraSection } from '../components/sections/lora-section'
import { useGeneration } from '../contexts/generation-context'
import { useHistory } from '../contexts/history-context'
import { generate, getJobStatus, getJobImages, cancelJob } from '../services/bridge-client'
import {
  hasActiveDocument,
  hasActiveSelection,
  getSelectionMaskBase64,
  getDocumentImageBase64,
  getLayerImageBase64,
  placeImageAsLayer,
} from '../services/photoshop-layer'
import { applyStylePrompt, mergeNegativePrompts, getStyleCheckpoint } from '../utils/style-utils'
import { resolveStyleSampler } from '../utils/sampler-utils'
import type { HistoryGroup, HistoryImage } from '../types'

interface AnimationPanelProps {
  isConnected: boolean
  onOpenSettings?: () => void
  connectionStatus?: string
}

const POLL_INTERVAL = 500

export function AnimationPanel({ isConnected, onOpenSettings, connectionStatus }: AnimationPanelProps) {
  const {
    prompt,
    negativePrompt,
    strength,
    style,
    width,
    height,
    steps,
    cfgScale,
    sampler,
    scheduler,
    useStyleDefaults,
    seed,
    fixedSeed,
    inpaintMode,
    inpaintFill,
    inpaintContext,
    loras,
    controlLayers,
    regions,
    isGenerating,
    setIsGenerating,
    setProgress,
  } = useGeneration()
  const { addGenerationResult } = useHistory()

  const [frameCount, setFrameCount] = useState(8)
  const [seedStep, setSeedStep] = useState(1)
  const [applyAsLayers, setApplyAsLayers] = useState(true)

  const currentJobRef = useRef<string | null>(null)
  const cancelledRef = useRef(false)

  const runAnimation = useCallback(async () => {
    if (isGenerating && currentJobRef.current) {
      cancelledRef.current = true
      try {
        await cancelJob(currentJobRef.current)
      } catch {
        // Ignore cancel errors
      }
      setIsGenerating(false)
      setProgress(0)
      currentJobRef.current = null
      return
    }

    if (!prompt.trim()) return
    if (!hasActiveDocument()) {
      alert('Please open a document first')
      return
    }
    if (!isConnected) {
      alert('Please connect to the bridge first')
      return
    }

    const frames = Math.max(1, Math.min(120, Math.round(frameCount)))
    const step = Math.max(1, Math.round(seedStep))

    setIsGenerating(true)
    setProgress(0, 'Preparing animation...')
    cancelledRef.current = false

    const checkpoint = style ? getStyleCheckpoint(style) : ''
    const resolvedStyleSampler = style
      ? resolveStyleSampler(style.sampler)
      : { sampler: 'euler', scheduler: 'normal' }
    const finalSampler = useStyleDefaults && style
      ? resolvedStyleSampler.sampler
      : sampler
    const finalScheduler = useStyleDefaults && style
      ? resolvedStyleSampler.scheduler
      : scheduler
    const finalCfgScale = useStyleDefaults && style
      ? style.cfg_scale
      : cfgScale
    const finalSteps = useStyleDefaults && style
      ? style.steps
      : steps

    const finalPrompt = style
      ? applyStylePrompt(style.style_prompt, prompt)
      : prompt
    const finalNegative = style
      ? mergeNegativePrompts(style.negative_prompt, negativePrompt)
      : negativePrompt

    const mapControlMode = (mode: string): string => {
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

    const activeControlLayers = controlLayers.filter(
      l => l.isEnabled && (!!l.image || l.layerId !== null),
    )

    const activeRegions = regions.filter(r => r.isVisible && r.prompt.trim() && r.maskBase64)

    const historyImages: HistoryImage[] = []
    const groupId = `anim-${Date.now()}`

    try {
      for (let i = 0; i < frames; i++) {
        if (cancelledRef.current) break

        const baseProgress = i / frames
        setProgress(baseProgress, `Frame ${i + 1}/${frames}...`)

        const isRefineMode = strength < 100
        let maskBase64: string | null = null
        let imageBase64: string | undefined

        const hasSelection = await hasActiveSelection()
        if (!hasSelection && inpaintMode !== 'automatic') {
          throw new Error('No active selection found for inpaint.')
        }
        if (hasSelection) {
          maskBase64 = await getSelectionMaskBase64()
        }
        if (isRefineMode || maskBase64) {
          imageBase64 = await getDocumentImageBase64()
        }

        const controlNetArgs = []
        if (activeControlLayers.length > 0) {
          for (const layer of activeControlLayers) {
            const img = layer.image ? layer.image : await getLayerImageBase64(layer.layerId!)
            controlNetArgs.push({
              mode: mapControlMode(layer.mode),
              image: img,
              strength: layer.strength,
              range: [layer.rangeStart ?? 0, layer.rangeEnd ?? 1],
              preprocessor: layer.isPreprocessor,
            })
          }
        }

        const regionArgs = activeRegions.map(r => ({
          positive: r.prompt,
          mask: r.maskBase64!,
          bounds: r.bounds || undefined,
        }))

        const frameSeed = fixedSeed ? (seed + i * step) : -1

        const response = await generate({
          prompt: finalPrompt,
          negative_prompt: finalNegative,
          width,
          height,
          batch_size: 1,
          model: checkpoint,
          sampler: finalSampler,
          scheduler: finalScheduler,
          cfg_scale: finalCfgScale,
          steps: finalSteps,
          seed: frameSeed,
          inpaint_mode: inpaintMode,
          inpaint_fill: inpaintFill,
          inpaint_context: inpaintContext,
          control: controlNetArgs.length > 0 ? controlNetArgs : undefined,
          regions: regionArgs.length > 0 ? regionArgs : undefined,
          loras: loras.filter(l => l.name.trim()).map(l => ({ name: l.name.trim(), strength: l.strength })),
          mask: maskBase64 || undefined,
          ...(imageBase64 && {
            image: imageBase64,
            strength: strength / 100,
          }),
        })

        currentJobRef.current = response.job_id

        let finished = false
        while (!finished && !cancelledRef.current) {
          await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL))
          if (cancelledRef.current) break

          const status = await getJobStatus(response.job_id)
          switch (status.status) {
            case 'queued':
              setProgress(baseProgress, `Frame ${i + 1}/${frames}: queued...`)
              break
            case 'executing': {
              const p = baseProgress + (status.progress * (1 / frames))
              setProgress(p, `Frame ${i + 1}/${frames}: generating...`)
              break
            }
            case 'finished':
              finished = true
              break
            case 'error':
              throw new Error(status.error || 'Animation frame failed')
            case 'interrupted':
              finished = true
              break
          }
        }

        if (cancelledRef.current) break

        const imagesResponse = await getJobImages(response.job_id)
        if (imagesResponse.images.length === 0) {
          throw new Error('No images generated')
        }

        const pngBase64 = imagesResponse.images[0]
        const preview = `data:image/png;base64,${pngBase64}`
        const frameIndex = i + 1
        const layerName = `[Anim] Frame ${String(frameIndex).padStart(3, '0')}`

        historyImages.push({
          index: i,
          thumbnail: preview,
          applied: false,
          seed: imagesResponse.seeds[0] ?? frameSeed,
        })

        if (applyAsLayers) {
          await placeImageAsLayer(pngBase64, layerName)
        }
      }

      if (historyImages.length > 0) {
        const group: HistoryGroup = {
          job_id: groupId,
          timestamp: new Date().toISOString(),
          prompt,
          negative_prompt: negativePrompt,
          strength,
          style_id: style?.id ?? '',
          images: historyImages,
        }
        addGenerationResult(group)
      }

      setProgress(1, cancelledRef.current ? 'Cancelled' : 'Done!')
    } catch (e) {
      console.error('Animation failed:', e)
      alert(`Animation failed: ${e instanceof Error ? e.message : String(e)}`)
      setProgress(0)
    } finally {
      currentJobRef.current = null
      setTimeout(() => {
        setIsGenerating(false)
        setProgress(0)
      }, 600)
    }
  }, [
    isGenerating,
    prompt,
    negativePrompt,
    strength,
    style,
    width,
    height,
    steps,
    cfgScale,
    sampler,
    scheduler,
    useStyleDefaults,
    seed,
    fixedSeed,
    inpaintMode,
    inpaintFill,
    inpaintContext,
    loras,
    controlLayers,
    regions,
    frameCount,
    seedStep,
    applyAsLayers,
    isConnected,
    setIsGenerating,
    setProgress,
    addGenerationResult,
  ])

  return (
    <div className="animation-panel">
      <StyleSelector
        onOpenSettings={onOpenSettings}
        connectionStatus={connectionStatus}
      />

      <RegionSection />
      <PromptSection disabled={isGenerating} />
      <LoraSection />
      <ControlLayerSection />
      <StrengthSlider />
      <GenerationSettings />

      <div style={{ marginTop: 12, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span className="settings-label" style={{ width: 90 }}>Frames</span>
          <input
            type="number"
            className="number-input"
            value={frameCount}
            min={1}
            max={120}
            onChange={e => setFrameCount(parseInt(e.target.value, 10))}
            disabled={isGenerating}
          />
          <span className="settings-label" style={{ width: 90 }}>Seed step</span>
          <input
            type="number"
            className="number-input"
            value={seedStep}
            min={1}
            max={1000}
            onChange={e => setSeedStep(parseInt(e.target.value, 10))}
            disabled={isGenerating}
          />
        </div>

        <label className="inline-toggle" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={applyAsLayers}
            onChange={e => setApplyAsLayers(e.target.checked)}
            disabled={isGenerating}
          />
          <span>Place frames as layers</span>
        </label>
      </div>

      <Button
        size="m"
        variant={isGenerating ? 'secondary' : 'accent'}
        onClick={runAnimation}
        disabled={!isConnected || !prompt.trim()}
      >
        {isGenerating ? 'Cancel' : 'Generate Frames'}
      </Button>

      <ProgressBar />
    </div>
  )
}
