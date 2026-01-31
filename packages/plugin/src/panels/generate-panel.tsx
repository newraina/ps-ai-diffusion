import { useState, useRef, useCallback } from 'react'
import { Button } from '@swc-react/button'
import { PromptInput } from '../components/prompt-input'
import {
  generate,
  getJobStatus,
  getJobImages,
  cancelJob,
  type JobStatus,
} from '../services/bridge-client'
import {
  hasActiveDocument,
  updatePreviewLayer,
  applyAsLayer,
} from '../services/photoshop-layer'

interface GeneratePanelProps {
  isConnected: boolean
}

type GenerationState =
  | 'idle'
  | 'submitting'
  | 'queued'
  | 'executing'
  | 'fetching'
  | 'placing'
  | 'finished'
  | 'error'

interface GeneratedImage {
  id: string
  imageBase64: string
  prompt: string
  seed: number
}

const POLL_INTERVAL_QUEUED = 1000
const POLL_INTERVAL_EXECUTING = 500
const BATCH_SIZE_OPTIONS = [1, 2, 3, 4]

export function GeneratePanel({ isConnected }: GeneratePanelProps) {
  const [prompt, setPrompt] = useState('')
  const [negativePrompt, setNegativePrompt] = useState('')
  const [batchSize, setBatchSize] = useState(4)
  const [state, setState] = useState<GenerationState>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)

  // Results state
  const [results, setResults] = useState<GeneratedImage[]>([])
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [checkedIndices, setCheckedIndices] = useState<Set<number>>(new Set())

  const pollTimeoutRef = useRef<number | null>(null)
  const abortRef = useRef(false)

  const clearPollTimeout = useCallback(() => {
    if (pollTimeoutRef.current !== null) {
      clearTimeout(pollTimeoutRef.current)
      pollTimeoutRef.current = null
    }
  }, [])

  const pollJobStatus = useCallback(
    async (id: string, currentPrompt: string) => {
      if (abortRef.current) return

      try {
        const status: JobStatus = await getJobStatus(id)

        if (abortRef.current) return

        switch (status.status) {
          case 'queued':
            setState('queued')
            setProgress(0)
            pollTimeoutRef.current = window.setTimeout(
              () => pollJobStatus(id, currentPrompt),
              POLL_INTERVAL_QUEUED,
            )
            break

          case 'executing':
            setState('executing')
            setProgress(status.progress)
            pollTimeoutRef.current = window.setTimeout(
              () => pollJobStatus(id, currentPrompt),
              POLL_INTERVAL_EXECUTING,
            )
            break

          case 'finished':
            setState('fetching')
            setProgress(1)

            // Fetch images
            const images = await getJobImages(id)

            if (abortRef.current) return

            if (images.images.length > 0) {
              // Add new images to results
              const newImages: GeneratedImage[] = images.images.map(
                (imageBase64, index) => ({
                  id: `${id}-${index}`,
                  imageBase64,
                  prompt: currentPrompt,
                  seed: images.seeds[index],
                }),
              )

              setResults((prev) => [...prev, ...newImages])

              // Auto-select and preview the first new image
              const firstNewIndex = results.length
              setSelectedIndex(firstNewIndex)

              setState('placing')
              await updatePreviewLayer(newImages[0].imageBase64, currentPrompt)
            }

            setState('finished')
            // Reset to idle after a short delay
            setTimeout(() => {
              if (!abortRef.current) {
                setState('idle')
                setJobId(null)
              }
            }, 1000)
            break

          case 'error':
            setState('error')
            setError(status.error || 'Generation failed')
            break

          case 'interrupted':
            setState('idle')
            setJobId(null)
            break
        }
      } catch (e) {
        if (!abortRef.current) {
          setState('error')
          setError(e instanceof Error ? e.message : 'Failed to get job status')
        }
      }
    },
    [results.length],
  )

  async function handleGenerate() {
    if (!prompt.trim()) return

    // Check for active document
    if (!hasActiveDocument()) {
      setError('Please open a document first')
      return
    }

    // Reset state
    abortRef.current = false
    clearPollTimeout()
    setError(null)
    setState('submitting')
    setProgress(0)

    const currentPrompt = prompt

    try {
      const response = await generate({
        prompt,
        negative_prompt: negativePrompt,
        width: 512,
        height: 512,
        batch_size: batchSize,
      })

      setJobId(response.job_id)
      setState('queued')

      // Start polling
      pollJobStatus(response.job_id, currentPrompt)
    } catch (e) {
      setState('error')
      setError(e instanceof Error ? e.message : 'Failed to start generation')
    }
  }

  async function handleCancel() {
    abortRef.current = true
    clearPollTimeout()

    if (jobId) {
      try {
        await cancelJob(jobId)
      } catch (e) {
        console.error('Failed to cancel job:', e)
      }
    }

    setState('idle')
    setJobId(null)
    setProgress(0)
  }

  async function handleThumbnailClick(index: number) {
    if (index === selectedIndex) return

    setSelectedIndex(index)
    const image = results[index]
    if (image) {
      await updatePreviewLayer(image.imageBase64, image.prompt)
    }
  }

  function handleCheckboxChange(index: number, checked: boolean) {
    setCheckedIndices((prev) => {
      const next = new Set(prev)
      if (checked) {
        next.add(index)
      } else {
        next.delete(index)
      }
      return next
    })
  }

  async function handleApply() {
    if (checkedIndices.size === 0) return

    // Apply all checked images as layers
    const indicesToApply = Array.from(checkedIndices).sort((a, b) => a - b)

    for (const index of indicesToApply) {
      const image = results[index]
      if (image) {
        await applyAsLayer(image.imageBase64, image.prompt, image.seed)
      }
    }

    // Clear checked indices after applying
    setCheckedIndices(new Set())
  }

  function handleClearAll() {
    setResults([])
    setSelectedIndex(null)
    setCheckedIndices(new Set())
  }

  const isGenerating =
    state !== 'idle' && state !== 'finished' && state !== 'error'
  const showProgress = isGenerating || state === 'finished'
  const hasChecked = checkedIndices.size > 0

  function getStatusText(): string {
    switch (state) {
      case 'submitting':
        return 'Submitting...'
      case 'queued':
        return 'Queued...'
      case 'executing':
        return `Generating... ${Math.round(progress * 100)}%`
      case 'fetching':
        return 'Fetching result...'
      case 'placing':
        return 'Placing in document...'
      case 'finished':
        return 'Done!'
      case 'error':
        return 'Error'
      default:
        return ''
    }
  }

  return (
    <div className="generate-panel">
      <div className="prompt-section">
        <sp-body size="S">Prompt</sp-body>
        <PromptInput
          value={prompt}
          onChange={setPrompt}
          placeholder="Describe what you want to generate..."
          disabled={isGenerating}
        />
      </div>

      <div className="prompt-section">
        <sp-body size="S">Negative Prompt</sp-body>
        <PromptInput
          value={negativePrompt}
          onChange={setNegativePrompt}
          placeholder="What to avoid..."
          isNegative
          disabled={isGenerating}
        />
      </div>

      <div className="batch-size-row">
        <sp-body size="S">Batch Size</sp-body>
        <select
          value={batchSize}
          onChange={(e) => setBatchSize(Number(e.target.value))}
          disabled={isGenerating}
        >
          {BATCH_SIZE_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      {showProgress && (
        <div className="progress-section">
          <sp-body size="S">{getStatusText()}</sp-body>
          <sp-progressbar value={progress * 100} />
        </div>
      )}

      {error && (
        <sp-body size="S" className="error">
          {error}
        </sp-body>
      )}

      <div className="button-row">
        {!isGenerating ? (
          <>
            <Button
              variant="accent"
              onClick={handleGenerate}
              disabled={!isConnected || !prompt.trim()}
            >
              Generate
            </Button>
            {hasChecked && (
              <Button variant="primary" onClick={handleApply}>
                Apply ({checkedIndices.size})
              </Button>
            )}
          </>
        ) : (
          <Button variant="secondary" onClick={handleCancel}>
            Cancel
          </Button>
        )}
      </div>

      {results.length > 0 && (
        <div className="results-section">
          <div className="results-header">
            <sp-body size="S">Results ({results.length})</sp-body>
            <Button
              variant="secondary"
              size="s"
              onClick={handleClearAll}
              disabled={isGenerating}
            >
              Clear All
            </Button>
          </div>
          <div className="results-grid">
            {results.map((image, index) => (
              <div
                key={image.id}
                className={`result-item ${selectedIndex === index ? 'selected' : ''}`}
                onClick={() => handleThumbnailClick(index)}
              >
                <div
                  className="result-checkbox"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={checkedIndices.has(index)}
                    onChange={(e) =>
                      handleCheckboxChange(index, e.target.checked)
                    }
                  />
                </div>
                <img
                  src={`data:image/png;base64,${image.imageBase64}`}
                  alt={`Generated ${index + 1}`}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
