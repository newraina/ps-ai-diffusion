import { useCallback, useRef } from 'react'
import { StyleSelector } from '../components/style-selector'
import { PromptSection } from '../components/prompt-section'
import { StrengthSlider } from '../components/strength-slider'
import { GenerateButton } from '../components/generate-button'
import { ProgressBar } from '../components/progress-bar'
import { HistorySection } from '../components/history-section'
import { useGeneration } from '../contexts/generation-context'
import { useHistory } from '../contexts/history-context'
import {
  generate,
  getJobStatus,
  getJobImages,
  cancelJob,
} from '../services/bridge-client'
import { hasActiveDocument, getDocumentImageBase64 } from '../services/photoshop-layer'
import { applyStylePrompt, mergeNegativePrompts, getStyleCheckpoint } from '../utils/style-utils'
import { resolveStyleSampler } from '../utils/sampler-utils'
import type { HistoryGroup, HistoryImage } from '../types'

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
    isGenerating,
    setIsGenerating,
    setProgress,
  } = useGeneration()

  const { addGenerationResult } = useHistory()

  // Track current job for cancellation
  const currentJobRef = useRef<string | null>(null)
  const cancelledRef = useRef(false)

  const handleGenerate = useCallback(async () => {
    // Handle cancel
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
    if (!hasActiveDocument()) {
      alert('Please open a document first')
      return
    }

    setIsGenerating(true)
    setProgress(0)
    cancelledRef.current = false

    try {
      // Check if we're in refine mode (strength < 100)
      const isRefineMode = strength < 100
      let imageBase64: string | undefined

      if (isRefineMode) {
        setProgress(0, 'Capturing document...')
        try {
          imageBase64 = await getDocumentImageBase64()
        } catch (error) {
          throw new Error(`Failed to capture document: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      }

      // Apply style configuration
      const finalPrompt = style
        ? applyStylePrompt(style.style_prompt, prompt)
        : prompt
      const finalNegative = style
        ? mergeNegativePrompts(style.negative_prompt, negativePrompt)
        : negativePrompt
      const checkpoint = style ? getStyleCheckpoint(style) : ''
      const { sampler, scheduler } = style
        ? resolveStyleSampler(style.sampler)
        : { sampler: 'euler', scheduler: 'normal' }
      const cfgScale = style?.cfg_scale ?? 7.0
      const steps = style?.steps ?? 20

      // Submit generation job
      setProgress(0, 'Submitting...')
      const response = await generate({
        prompt: finalPrompt,
        negative_prompt: finalNegative,
        width: 512,
        height: 512,
        batch_size: batchSize,
        model: checkpoint,
        sampler,
        scheduler,
        cfg_scale: cfgScale,
        steps,
        // img2img params (only included when refining)
        ...(isRefineMode && {
          image: imageBase64,
          strength: strength / 100,  // Convert 0-100 to 0.0-1.0
        }),
      })

      const jobId = response.job_id
      currentJobRef.current = jobId

      // Poll for job status
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
            throw new Error(status.error || 'Generation failed')
          case 'interrupted':
            // User cancelled
            finished = true
            break
        }
      }

      if (cancelledRef.current) {
        return
      }

      // Fetch generated images
      const imagesResponse = await getJobImages(jobId)

      if (imagesResponse.images.length === 0) {
        throw new Error('No images generated')
      }

      // Add all images to history (user will select/apply from there)
      const historyImages: HistoryImage[] = imagesResponse.images.map((img, i) => ({
        index: i,
        thumbnail: `data:image/png;base64,${img}`, // Add data URL prefix for img src
        applied: false, // Not applied until user clicks Apply
        seed: imagesResponse.seeds[i],
      }))

      const historyGroup: HistoryGroup = {
        job_id: jobId,
        timestamp: new Date().toISOString(),
        prompt,
        negative_prompt: negativePrompt,
        strength,
        style_id: style?.id ?? '',
        images: historyImages,
      }

      addGenerationResult(historyGroup)

      setProgress(1, 'Done!')
      setTimeout(() => {
        setIsGenerating(false)
        setProgress(0)
        currentJobRef.current = null
      }, 1000)

    } catch (error) {
      console.error('Generation failed:', error)
      setIsGenerating(false)
      setProgress(0)
      currentJobRef.current = null
      alert(`Generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }, [
    prompt,
    negativePrompt,
    strength,
    batchSize,
    style,
    isGenerating,
    setIsGenerating,
    setProgress,
    addGenerationResult,
  ])

  return (
    <div className="generate-panel">
      <StyleSelector
        onOpenSettings={onOpenSettings}
        connectionStatus={connectionStatus}
      />
      <PromptSection onSubmit={handleGenerate} disabled={isGenerating} />
      <StrengthSlider />
      <GenerateButton
        onClick={handleGenerate}
        disabled={!isConnected || !prompt.trim()}
      />
      <ProgressBar />
      <HistorySection />
    </div>
  )
}
