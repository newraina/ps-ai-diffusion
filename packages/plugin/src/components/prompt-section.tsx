import { useState, useRef, useEffect, useCallback } from 'react'
import { PromptInput } from './prompt-input'
import { useGeneration } from '../contexts/generation-context'

interface PromptSectionProps {
  onSubmit?: () => void
  disabled?: boolean
}

export function PromptSection({ onSubmit, disabled = false }: PromptSectionProps) {
  const MIN_PROMPT_ROWS = 2
  // Keep a very high cap to avoid breaking layout with unbounded growth.
  const MAX_PROMPT_ROWS = 999

  const { prompt, setPrompt, negativePrompt, setNegativePrompt } = useGeneration()
  const [promptRows, setPromptRows] = useState(MIN_PROMPT_ROWS)
  const [isDragging, setIsDragging] = useState(false)
  const sectionRef = useRef<HTMLDivElement>(null)
  const dragStateRef = useRef({
    startY: 0,
    startRows: MIN_PROMPT_ROWS,
    lineHeight: 18,
    pointerId: null as number | null,
    mode: 'pointer' as 'pointer' | 'mouse',
  })
  const handleRef = useRef<HTMLDivElement>(null)
  // TODO: Add toggle for negative prompt section
  const [showNegative, _setShowNegative] = useState(false)

  const beginDrag = useCallback((clientY: number, mode: 'pointer' | 'mouse', pointerId?: number) => {
    const textarea = sectionRef.current?.querySelector('textarea')
    const lineHeightRaw = textarea ? parseFloat(getComputedStyle(textarea).lineHeight) : NaN
    const lineHeight = Number.isFinite(lineHeightRaw) && lineHeightRaw > 0 ? lineHeightRaw : 18

    dragStateRef.current = {
      startY: clientY,
      startRows: Math.round(promptRows),
      lineHeight,
      pointerId: typeof pointerId === 'number' ? pointerId : null,
      mode,
    }
    setIsDragging(true)
  }, [promptRows])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()

    // Capture the pointer to keep receiving events even if cursor leaves the handle.
    try {
      handleRef.current?.setPointerCapture(e.pointerId)
    } catch {
      // Ignore: pointer capture not supported in some hosts.
    }

    beginDrag(e.clientY, 'pointer', e.pointerId)
  }, [beginDrag])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Fallback for environments where pointer events are flaky.
    e.preventDefault()
    e.stopPropagation()
    beginDrag(e.clientY, 'mouse')
  }, [beginDrag])

  // Use document-level listeners for reliable tracking
  useEffect(() => {
    if (!isDragging) return

    const clampRows = (rows: number) => Math.max(MIN_PROMPT_ROWS, Math.min(MAX_PROMPT_ROWS, rows))

    const updateFromClientY = (clientY: number) => {
      const deltaY = clientY - dragStateRef.current.startY
      const step = dragStateRef.current.lineHeight
      const deltaRows = Math.round(deltaY / step)
      const newRows = clampRows(dragStateRef.current.startRows + deltaRows)
      setPromptRows(newRows)
    }

    const handlePointerMove = (e: PointerEvent) => {
      if (dragStateRef.current.mode !== 'pointer') return
      if (dragStateRef.current.pointerId !== null && e.pointerId !== dragStateRef.current.pointerId) return
      e.preventDefault()
      updateFromClientY(e.clientY)
    }

    const endDrag = () => {
      setIsDragging(false)
      if (dragStateRef.current.mode === 'pointer' && dragStateRef.current.pointerId !== null) {
        try {
          handleRef.current?.releasePointerCapture(dragStateRef.current.pointerId)
        } catch {
          // Ignore: not all hosts support releasePointerCapture.
        }
      }
      dragStateRef.current.pointerId = null
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (dragStateRef.current.mode !== 'mouse') return
      e.preventDefault()
      updateFromClientY(e.clientY)
    }

    // Use capture phase to ensure we get events.
    // Some hosts dispatch move/up on window rather than document.
    window.addEventListener('pointermove', handlePointerMove, { capture: true })
    window.addEventListener('pointerup', endDrag, { capture: true })
    window.addEventListener('pointercancel', endDrag, { capture: true })
    window.addEventListener('blur', endDrag, { capture: true })

    window.addEventListener('mousemove', handleMouseMove, { capture: true })
    window.addEventListener('mouseup', endDrag, { capture: true })

    return () => {
      window.removeEventListener('pointermove', handlePointerMove, { capture: true })
      window.removeEventListener('pointerup', endDrag, { capture: true })
      window.removeEventListener('pointercancel', endDrag, { capture: true })
      window.removeEventListener('blur', endDrag, { capture: true })

      window.removeEventListener('mousemove', handleMouseMove, { capture: true })
      window.removeEventListener('mouseup', endDrag, { capture: true })
    }
  }, [isDragging])

  return (
    <div ref={sectionRef} className={`prompt-section ${isDragging ? 'resizing' : ''}`}>
      <PromptInput
        value={prompt}
        onChange={setPrompt}
        minRows={Math.round(promptRows)}
        maxRows={MAX_PROMPT_ROWS}
        onSubmit={onSubmit}
        disabled={disabled}
      />
      <div
        ref={handleRef}
        className="resize-handle"
        onPointerDown={handlePointerDown}
        onMouseDown={handleMouseDown}
      >
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
