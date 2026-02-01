import { useCallback, useRef, useState } from 'react'
import { Button } from '@swc-react/button'
import { StyleSelector } from '../components/style-selector'
import { PromptSection } from '../components/prompt-section'
import { ProgressBar } from '../components/progress-bar'
import { useGeneration } from '../contexts/generation-context'
import {
  upscale,
  getJobStatus,
  getJobImages,
  cancelJob,
} from '../services/bridge-client'
import { openBrowser } from '../utils/uxp'
import {
  hasActiveDocument,
  getDocumentImageBase64,
  placeImageAsLayer,
} from '../services/photoshop-layer'
import { applyStylePrompt, mergeNegativePrompts, getStyleCheckpoint } from '../utils/style-utils'

interface UpscalePanelProps {
  isConnected: boolean
  onOpenSettings?: () => void
  connectionStatus?: string
}

const POLL_INTERVAL = 500

export function UpscalePanel({
  isConnected,
  onOpenSettings,
  connectionStatus,
}: UpscalePanelProps) {
  const [factor, setFactor] = useState<2 | 4>(2)
  const [upscaleModel, setUpscaleModel] = useState('')
  const [refineAfter, setRefineAfter] = useState(false)
  const [tileOverlap, setTileOverlap] = useState(-1)
  const [refineStrength, setRefineStrength] = useState(0.35)

  const {
    prompt,
    negativePrompt,
    style,
    steps,
    cfgScale,
    sampler,
    scheduler,
    seed,
    fixedSeed,
    loras,
    isGenerating,
    setIsGenerating,
    setProgress,
  } = useGeneration()

  const currentJobRef = useRef<string | null>(null)
  const cancelledRef = useRef(false)

  const handleUpscale = useCallback(async () => {
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

    if (!hasActiveDocument()) {
      alert('Please open a document first')
      return
    }

    setIsGenerating(true)
    setProgress(0, 'Reading document...')
    cancelledRef.current = false

    try {
      // Read document image
      const imageBase64 = await getDocumentImageBase64()

      setProgress(0.1, 'Submitting...')

      // Submit upscale job
      const checkpoint = style ? getStyleCheckpoint(style) : ''
      const finalPrompt = style
        ? applyStylePrompt(style.style_prompt, prompt)
        : prompt
      const finalNegative = style
        ? mergeNegativePrompts(style.negative_prompt, negativePrompt)
        : negativePrompt

      const response = await upscale({
        image: imageBase64,
        factor,
        model: upscaleModel || undefined,
        refine: refineAfter,
        checkpoint: refineAfter ? checkpoint : undefined,
        prompt: refineAfter ? finalPrompt : undefined,
        negative_prompt: refineAfter ? finalNegative : undefined,
        steps: refineAfter ? steps : undefined,
        cfg_scale: refineAfter ? cfgScale : undefined,
        sampler: refineAfter ? sampler : undefined,
        scheduler: refineAfter ? scheduler : undefined,
        seed: refineAfter ? (fixedSeed ? seed : -1) : undefined,
        strength: refineAfter ? refineStrength : undefined,
        tile_overlap: refineAfter ? tileOverlap : undefined,
        loras: refineAfter
          ? loras.filter(l => l.name.trim()).map(l => ({ name: l.name.trim(), strength: l.strength }))
          : undefined,
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
            setProgress(0.1, 'Queued...')
            break
          case 'executing':
            // Scale progress from 0.1 to 0.9 during execution
            setProgress(0.1 + status.progress * 0.8, `Upscaling... ${Math.round(status.progress * 100)}%`)
            break
          case 'finished':
            finished = true
            setProgress(0.9, 'Fetching result...')
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
            throw new Error(status.error || 'Upscale failed')
          case 'interrupted':
            finished = true
            break
        }
      }

      if (cancelledRef.current) {
        return
      }

      // Fetch result image
      const imagesResponse = await getJobImages(jobId)

      if (imagesResponse.images.length === 0) {
        throw new Error('No image returned')
      }

      // Place as new layer
      const layerName = `Upscaled ${factor}x`
      await placeImageAsLayer(imagesResponse.images[0], layerName)

      setProgress(1, 'Done!')
      setTimeout(() => {
        setIsGenerating(false)
        setProgress(0)
        currentJobRef.current = null
      }, 1000)

    } catch (error) {
      console.error('Upscale failed:', error)
      setIsGenerating(false)
      setProgress(0)
      currentJobRef.current = null
      alert(`Upscale failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }, [
    factor,
    isGenerating,
    setIsGenerating,
    setProgress,
    upscaleModel,
    refineAfter,
    tileOverlap,
    refineStrength,
    style,
    prompt,
    negativePrompt,
    steps,
    cfgScale,
    sampler,
    scheduler,
    seed,
    fixedSeed,
    loras,
  ])

  return (
    <div className="upscale-panel">
      <StyleSelector
        onOpenSettings={onOpenSettings}
        connectionStatus={connectionStatus}
      />

      <div className="upscale-options">
        <sp-label>Upscale Factor</sp-label>
        <div className="factor-buttons">
          <Button
            size="s"
            variant={factor === 2 ? 'accent' : 'secondary'}
            onClick={() => setFactor(2)}
            disabled={isGenerating}
          >
            2x
          </Button>
          <Button
            size="s"
            variant={factor === 4 ? 'accent' : 'secondary'}
            onClick={() => setFactor(4)}
            disabled={isGenerating}
          >
            4x
          </Button>
        </div>
      </div>

      <div className="upscale-options" style={{ marginTop: 12 }}>
        <sp-label>Upscale Model</sp-label>
        <input
          type="text"
          className="text-input"
          placeholder="(optional) e.g. 4x-UltraSharp.pth"
          value={upscaleModel}
          onChange={e => setUpscaleModel(e.target.value)}
          disabled={isGenerating}
        />
      </div>

      <div className="upscale-options" style={{ marginTop: 12 }}>
        <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={refineAfter}
            onChange={e => setRefineAfter(e.target.checked)}
            disabled={isGenerating}
          />
          <span>Refine after upscale (tiled diffusion)</span>
        </label>
      </div>

      {refineAfter && (
        <>
          <PromptSection disabled={isGenerating} />

          <div className="upscale-options" style={{ marginTop: 12 }}>
            <sp-label>Refine strength</sp-label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <sp-slider
                min={0.05}
                max={0.95}
                step={0.01}
                value={refineStrength}
                onInput={(e: any) => setRefineStrength(Number(e.target.value))}
                style={{ flex: 1 }}
              />
              <span style={{ width: 48, textAlign: 'right', fontSize: 11 }}>
                {refineStrength.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="upscale-options" style={{ marginTop: 12 }}>
            <sp-label>Tile overlap</sp-label>
            <input
              type="number"
              className="text-input"
              value={tileOverlap}
              onChange={e => setTileOverlap(parseInt(e.target.value, 10))}
              disabled={isGenerating}
            />
            <sp-body size="XS" style={{ opacity: 0.8 }}>
              Use -1 for Auto.
            </sp-body>
          </div>
        </>
      )}

      <Button
        size="m"
        variant="accent"
        onClick={handleUpscale}
        disabled={!isConnected}
        className="upscale-button"
      >
        {isGenerating ? 'Cancel' : 'Upscale'}
      </Button>

      <ProgressBar />
    </div>
  )
}
