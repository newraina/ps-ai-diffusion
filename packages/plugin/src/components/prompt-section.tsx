import { useState, useCallback } from 'react'
import { PromptInput } from './prompt-input'
import { useGeneration } from '../contexts/generation-context'

interface PromptSectionProps {
  onSubmit?: () => void
  disabled?: boolean
}

export function PromptSection({ onSubmit, disabled = false }: PromptSectionProps) {
  const { prompt, setPrompt, negativePrompt, setNegativePrompt } = useGeneration()
  const [promptRows, setPromptRows] = useState(4)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStartY, setDragStartY] = useState(0)
  // TODO: Add toggle for negative prompt section
  const [showNegative, _setShowNegative] = useState(false)

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    setDragStartY(e.clientY)
  }, [])

  const handleResizeMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return
    const deltaY = e.clientY - dragStartY
    setDragStartY(e.clientY)
    setPromptRows(prev => {
      const lineHeight = 18
      const deltaRows = deltaY / lineHeight
      return Math.max(2, Math.min(12, prev + deltaRows))
    })
  }, [isDragging, dragStartY])

  const handleResizeEnd = useCallback(() => {
    setIsDragging(false)
  }, [])

  return (
    <div
      className={`prompt-section ${isDragging ? 'resizing' : ''}`}
      onMouseMove={handleResizeMove}
      onMouseUp={handleResizeEnd}
      onMouseLeave={handleResizeEnd}
    >
      <PromptInput
        value={prompt}
        onChange={setPrompt}
        minRows={Math.round(promptRows)}
        maxRows={12}
        onSubmit={onSubmit}
        disabled={disabled}
      />
      <div className="resize-handle" onMouseDown={handleResizeStart}>
        <span className="resize-dots">•••</span>
      </div>
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
