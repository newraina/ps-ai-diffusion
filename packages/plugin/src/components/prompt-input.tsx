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
    const lineHeight = parseInt(getComputedStyle(textarea).lineHeight) || 20
    const minHeight = lineHeight * minRows
    const maxHeight = lineHeight * maxRows
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
