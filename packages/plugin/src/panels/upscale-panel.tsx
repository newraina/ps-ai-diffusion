import { useCallback, useRef, useState } from 'react'
import { Button } from '@swc-react/button'
import { StyleSelector } from '../components/style-selector'
import { ProgressBar } from '../components/progress-bar'
import { useGeneration } from '../contexts/generation-context'
import {
  upscale,
  getJobStatus,
  getJobImages,
  cancelJob,
} from '../services/bridge-client'
import {
  hasActiveDocument,
  getDocumentImageBase64,
  placeImageAsLayer,
} from '../services/photoshop-layer'

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
  const { isGenerating, setIsGenerating, setProgress } = useGeneration()

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
      const response = await upscale({
        image: imageBase64,
        factor,
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
  }, [factor, isGenerating, setIsGenerating, setProgress])

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
