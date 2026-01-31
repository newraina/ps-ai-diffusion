import { useRef, useEffect } from 'react'

interface PromptInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  isNegative?: boolean
  minRows?: number
  maxRows?: number
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

function getVerticalPaddingPx(textarea: HTMLTextAreaElement): number {
  const styles = getComputedStyle(textarea)
  const pt = parseFloat(styles.paddingTop) || 0
  const pb = parseFloat(styles.paddingBottom) || 0
  return pt + pb
}

export function PromptInput({
  value,
  onChange,
  placeholder,
  isNegative = false,
  minRows = 3,
  maxRows = 10,
  onSubmit,
  disabled = false,
}: PromptInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    textarea.style.height = 'auto'
    const lineHeightPx = getLineHeightPx(textarea)
    const paddingY = getVerticalPaddingPx(textarea)
    const minHeight = lineHeightPx * minRows + paddingY
    const maxHeight = lineHeightPx * maxRows + paddingY
    const scrollHeight = textarea.scrollHeight

    textarea.style.height = `${Math.min(Math.max(scrollHeight, minHeight), maxHeight)}px`
  }, [value, minRows, maxRows])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Shift+Enter to submit
    if (e.key === 'Enter' && e.shiftKey && onSubmit) {
      e.preventDefault()
      onSubmit()
    }

    // Ctrl+Up/Down for weight adjustment (future feature)
    if (e.ctrlKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault()
      // TODO: Implement weight adjustment
    }
  }

  return (
    <div className={`prompt-input ${isNegative ? 'negative' : ''}`}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || (isNegative ? 'Describe content you want to avoid.' : 'Describe the content you want to see, or leave empty.')}
        disabled={disabled}
        rows={minRows}
      />
    </div>
  )
}
