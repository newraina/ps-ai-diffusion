import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@swc-react/button'
import { StyleSelector } from '../components/style-selector'
import { PromptSection } from '../components/prompt-section'
import { ProgressBar } from '../components/progress-bar'
import { GenerationSettings } from '../components/sections/generation-settings'
import { useGeneration } from '../contexts/generation-context'
import { generate, getJobStatus, getJobImages, cancelJob } from '../services/bridge-client'
import { hasActiveDocument, updatePreviewLayer, applyAsLayer, deletePreviewLayer } from '../services/photoshop-layer'
import { applyStylePrompt, mergeNegativePrompts, getStyleCheckpoint } from '../utils/style-utils'
import { resolveStyleSampler } from '../utils/sampler-utils'
import { openBrowser } from '../utils/uxp'

interface LivePanelProps {
  isConnected: boolean
  onOpenSettings?: () => void
  connectionStatus?: string
}

const POLL_INTERVAL = 500

export function LivePanel({ isConnected, onOpenSettings, connectionStatus }: LivePanelProps) {
  const {
    prompt,
    negativePrompt,
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
    setProgress,
    setIsGenerating,
  } = useGeneration()
  const [isLive, setIsLive] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const currentJobRef = useRef<string | null>(null)
  const cancelledRef = useRef(false)
  const lastPreviewRef = useRef<string | null>(null)

  const runLivePreview = useCallback(async () => {
    if (!prompt.trim()) return
    if (!hasActiveDocument()) {
      alert('Please open a document first')
      return
    }
    if (!isConnected) {
      alert('Please connect to the bridge first')
      return
    }

    setIsRefreshing(true)
    cancelledRef.current = false
    setIsGenerating(true)
    setProgress(0, 'Live preview...')

    try {
      const finalPrompt = style
        ? applyStylePrompt(style.style_prompt, prompt)
        : prompt
      const finalNegative = style
        ? mergeNegativePrompts(style.negative_prompt, negativePrompt)
        : negativePrompt
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

      const response = await generate({
        prompt: finalPrompt,
        negative_prompt: finalNegative,
        width,
        height,
        steps: finalSteps,
        cfg_scale: finalCfgScale,
        sampler: finalSampler,
        scheduler: finalScheduler,
        seed: fixedSeed ? seed : -1,
        batch_size: 1,
        model: checkpoint,
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
            setProgress(status.progress, `Live preview... ${Math.round(status.progress * 100)}%`)
            break
          case 'finished':
            finished = true
            setProgress(1, 'Fetching preview...')
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
            throw new Error(status.error || 'Live preview failed')
          case 'interrupted':
            finished = true
            break
        }
      }

      if (cancelledRef.current) return

      const imagesResponse = await getJobImages(jobId)
      if (imagesResponse.images.length === 0) {
        throw new Error('No images generated')
      }

      const preview = `data:image/png;base64,${imagesResponse.images[0]}`
      lastPreviewRef.current = preview
      await updatePreviewLayer(preview, prompt)
      setProgress(1, 'Preview updated')
      setTimeout(() => setProgress(0), 600)
    } catch (error) {
      console.error('Live preview failed:', error)
      alert(`Live preview failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      currentJobRef.current = null
      setIsGenerating(false)
      setIsRefreshing(false)
    }
  }, [
    prompt,
    negativePrompt,
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
    isConnected,
    setProgress,
    setIsGenerating,
  ])

  useEffect(() => {
    if (!isLive) return
    const timer = setTimeout(() => {
      if (!isRefreshing) {
        runLivePreview()
      }
    }, 600)
    return () => clearTimeout(timer)
  }, [
    isLive,
    isRefreshing,
    runLivePreview,
    prompt,
    negativePrompt,
    style,
    width,
    height,
    steps,
    cfgScale,
    sampler,
    scheduler,
  ])

  const handleToggleLive = async () => {
    if (isLive) {
      setIsLive(false)
      cancelledRef.current = true
      if (currentJobRef.current) {
        try {
          await cancelJob(currentJobRef.current)
        } catch (error) {
          console.error('Failed to cancel live preview job:', error)
        }
      }
      await deletePreviewLayer()
      setProgress(0)
      setIsGenerating(false)
      return
    }
    setIsLive(true)
    runLivePreview()
  }

  const handleApply = async () => {
    if (!lastPreviewRef.current) return
    await applyAsLayer(lastPreviewRef.current, prompt, seed)
    await deletePreviewLayer()
  }

  return (
    <div className="live-panel">
      <StyleSelector
        onOpenSettings={onOpenSettings}
        connectionStatus={connectionStatus}
      />
      <PromptSection disabled={isRefreshing} />
      <GenerationSettings />

      <div className="live-controls">
        <Button
          size="s"
          variant={isLive ? 'secondary' : 'accent'}
          onClick={handleToggleLive}
          disabled={!prompt.trim()}
        >
          {isLive ? 'Stop Live' : 'Start Live'}
        </Button>
        <Button
          size="s"
          variant="secondary"
          onClick={runLivePreview}
          disabled={isRefreshing || !prompt.trim()}
        >
          Refresh
        </Button>
        <Button
          size="s"
          variant="secondary"
          onClick={handleApply}
          disabled={!lastPreviewRef.current}
        >
          Apply
        </Button>
      </div>
      <ProgressBar />
    </div>
  )
}
