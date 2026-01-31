import { useCallback } from 'react'
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
  cancelJob as _cancelJob,
} from '../services/bridge-client'
import {
  hasActiveDocument,
  updatePreviewLayer as _updatePreviewLayer,
} from '../services/photoshop-layer'

// Reserved for future use
void _cancelJob
void _updatePreviewLayer

interface GeneratePanelProps {
  isConnected: boolean
  onOpenSettings?: () => void
  connectionStatus?: string
}

export function GeneratePanel({ isConnected, onOpenSettings, connectionStatus }: GeneratePanelProps) {
  const {
    prompt,
    negativePrompt,
    strength: _strength,
    batchSize,
    isGenerating,
    setIsGenerating,
    setProgress,
  } = useGeneration()

  const { addGenerationResult: _addGenerationResult } = useHistory()

  // Reserved for future use
  void _strength
  void _addGenerationResult

  const handleGenerate = useCallback(async () => {
    if (isGenerating) {
      // Cancel logic
      setIsGenerating(false)
      setProgress(0)
      return
    }

    if (!prompt.trim()) return
    if (!hasActiveDocument()) {
      alert('Please open a document first')
      return
    }

    setIsGenerating(true)
    setProgress(0, 'Submitting...')

    try {
      // TODO: Use response.job_id to poll job status
      await generate({
        prompt,
        negative_prompt: negativePrompt,
        width: 512,
        height: 512,
        batch_size: batchSize,
      })

      // TODO: Poll job status and update progress
      // For now, simulate completion
      setProgress(1, 'Done!')

      setTimeout(() => {
        setIsGenerating(false)
        setProgress(0)
      }, 1000)

    } catch (error) {
      console.error('Generation failed:', error)
      setIsGenerating(false)
      setProgress(0)
    }
  }, [
    prompt,
    negativePrompt,
    batchSize,
    isGenerating,
    setIsGenerating,
    setProgress,
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
