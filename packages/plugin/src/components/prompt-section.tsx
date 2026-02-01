import { useState, useRef, useEffect, useCallback } from 'react'
import { PromptInput } from './prompt-input'
import { useGeneration } from '../contexts/generation-context'
import { getSettings } from '../services/settings'

interface PromptSectionProps {
  onSubmit?: () => void
  disabled?: boolean
}

function getLineHeightPx(textarea: HTMLTextAreaElement): number {
  const styles = getComputedStyle(textarea)
  const lineHeightRaw = styles.lineHeight
  const fontSizePx = parseFloat(styles.fontSize) || 12

  // UXP may return unitless line-height (e.g. "1.4") instead of px.
  if (lineHeightRaw.endsWith('px')) {
    const px = parseFloat(lineHeightRaw)
    return Number.isFinite(px) && px > 0 ? px : fontSizePx * 1.4
  }

  const unitless = parseFloat(lineHeightRaw)
  if (Number.isFinite(unitless) && unitless > 0) {
    return fontSizePx * unitless
  }

  // "normal" or other non-numeric values.
  return fontSizePx * 1.4
}

export function PromptSection({ onSubmit, disabled = false }: PromptSectionProps) {
  const defaultPromptRows = Math.max(2, getSettings().promptLineCount || 2)
  // Keep a very high cap to avoid breaking layout with unbounded growth.
  const MAX_PROMPT_ROWS = 999

  const { prompt, setPrompt, negativePrompt, setNegativePrompt } = useGeneration()
  const [minPromptRows, setMinPromptRows] = useState(defaultPromptRows)
  const [promptRows, setPromptRows] = useState(defaultPromptRows)
  const [isDragging, setIsDragging] = useState(false)
  const sectionRef = useRef<HTMLDivElement>(null)
  const dragStateRef = useRef({
    startY: 0,
    startRows: defaultPromptRows,
    lineHeight: 18,
    pointerId: null as number | null,
    mode: 'pointer' as 'pointer' | 'mouse',
  })
  const handleRef = useRef<HTMLDivElement>(null)
  const [showNegative, setShowNegative] = useState(() => getSettings().showNegativePrompt)

  useEffect(() => {
    const updateFromSettings = (event?: Event) => {
      const customEvent = event as CustomEvent | undefined
      const detail = customEvent?.detail as { showNegativePrompt?: boolean; promptLineCount?: number } | undefined
      const nextValue = typeof detail?.showNegativePrompt === 'boolean'
        ? detail.showNegativePrompt
        : getSettings().showNegativePrompt
      setShowNegative(nextValue)

      const nextRows = typeof detail?.promptLineCount === 'number'
        ? detail.promptLineCount
        : getSettings().promptLineCount
      const safeRows = Math.max(2, nextRows || 2)
      setMinPromptRows(safeRows)
      setPromptRows(prev => Math.max(prev, safeRows))
    }

    updateFromSettings()
    window.addEventListener('ps-ai-diffusion-settings-updated', updateFromSettings as EventListener)
    return () => {
      window.removeEventListener('ps-ai-diffusion-settings-updated', updateFromSettings as EventListener)
    }
  }, [])

  const beginDrag = useCallback((clientY: number, mode: 'pointer' | 'mouse', pointerId?: number) => {
    const textarea = sectionRef.current?.querySelector('textarea')
    const lineHeight = textarea ? getLineHeightPx(textarea) : 18

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

    const clampRows = (rows: number) => Math.max(minPromptRows, Math.min(MAX_PROMPT_ROWS, rows))

    const updateFromClientY = (clientY: number) => {
      const deltaY = clientY - dragStateRef.current.startY
      const step = dragStateRef.current.lineHeight
      // Use full-line steps (less "twitchy" than rounding at half a line).
      const deltaRows = deltaY >= 0 ? Math.floor(deltaY / step) : Math.ceil(deltaY / step)
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
        enableAutocomplete
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
