import { useState, useCallback } from 'react'
import { PromptInput } from './prompt-input'
import { ResizeHandle } from './resize-handle'
import { useGeneration } from '../contexts/generation-context'

interface PromptSectionProps {
  onSubmit?: () => void
  disabled?: boolean
}

export function PromptSection({ onSubmit, disabled = false }: PromptSectionProps) {
  const { prompt, setPrompt, negativePrompt, setNegativePrompt } = useGeneration()
  const [promptRows, setPromptRows] = useState(3)
  // TODO: Add toggle for negative prompt section
  const [showNegative, _setShowNegative] = useState(false)

  const handleResize = useCallback((deltaY: number) => {
    setPromptRows(prev => {
      const lineHeight = 20  // approximate
      const deltaRows = deltaY / lineHeight
      return Math.max(2, Math.min(10, prev + deltaRows))
    })
  }, [])

  return (
    <div className="prompt-section">
      <PromptInput
        value={prompt}
        onChange={setPrompt}
        minRows={Math.round(promptRows)}
        maxRows={10}
        onSubmit={onSubmit}
        disabled={disabled}
      />
      <ResizeHandle onResize={handleResize} />
      {showNegative && (
        <PromptInput
          value={negativePrompt}
          onChange={setNegativePrompt}
          isNegative
          minRows={2}
          maxRows={5}
          disabled={disabled}
        />
      )}
    </div>
  )
}
