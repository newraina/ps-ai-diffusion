import { useRef, useEffect, useMemo, useState } from 'react'
import { PROMPT_SUGGESTIONS } from '../utils/prompt-suggestions'

interface PromptInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  isNegative?: boolean
  minRows?: number
  maxRows?: number
  onSubmit?: () => void
  disabled?: boolean
  enableAutocomplete?: boolean
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

const WORD_DELIMITERS = '.,/\\!?%^*;:{}=`~()<> \t\r\n'

function findWordRange(text: string, cursorPos: number): { start: number; end: number } {
  let start = cursorPos
  let end = cursorPos

  while (start > 0 && !WORD_DELIMITERS.includes(text[start - 1])) {
    start -= 1
  }
  while (end < text.length && !WORD_DELIMITERS.includes(text[end])) {
    end += 1
  }

  return { start, end }
}

function adjustAttention(text: string, positive: boolean): string {
  if (!text) return text
  const leading = text.match(/^\s*/)?.[0] ?? ''
  const trailing = text.match(/\s*$/)?.[0] ?? ''
  const trimmed = text.trim()
  if (!trimmed) return text

  let openBracket = '('
  let closeBracket = ')'
  let attentionString = trimmed
  let weight = 1.0

  if (
    (trimmed.startsWith('(') && trimmed.endsWith(')')) ||
    (trimmed.startsWith('<') && trimmed.endsWith('>'))
  ) {
    openBracket = trimmed[0]
    closeBracket = trimmed[trimmed.length - 1]
    const inner = trimmed.slice(1, -1)
    const colonIndex = inner.lastIndexOf(':')
    if (openBracket === '(' && colonIndex > 0) {
      const parsed = parseFloat(inner.slice(colonIndex + 1))
      if (Number.isFinite(parsed)) {
        attentionString = inner.slice(0, colonIndex)
        weight = parsed
      } else {
        attentionString = inner
      }
    } else {
      attentionString = inner
    }
  }

  weight = weight + (positive ? 0.1 : -0.1)
  weight = Math.min(Math.max(weight, -2.0), 2.0)

  const adjusted = weight === 1.0 && openBracket === '('
    ? attentionString
    : `${openBracket}${attentionString}:${weight.toFixed(1)}${closeBracket}`

  return `${leading}${adjusted}${trailing}`
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
  enableAutocomplete = false,
}: PromptInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [isFocused, setIsFocused] = useState(false)
  const [cursorPos, setCursorPos] = useState(0)

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

    // Ctrl+Up/Down for weight adjustment
    if (e.ctrlKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault()
      const textarea = textareaRef.current
      if (!textarea) return
      const start = textarea.selectionStart ?? 0
      const end = textarea.selectionEnd ?? 0
      const range = start !== end
        ? { start, end }
        : findWordRange(value, start)
      const selectedText = value.slice(range.start, range.end)
      if (!selectedText) return

      const adjusted = adjustAttention(selectedText, e.key === 'ArrowUp')
      const nextValue = value.slice(0, range.start) + adjusted + value.slice(range.end)
      onChange(nextValue)

      requestAnimationFrame(() => {
        const el = textareaRef.current
        if (!el) return
        el.selectionStart = range.start
        el.selectionEnd = range.start + adjusted.length
      })
    }
  }

  const updateCursor = () => {
    const textarea = textareaRef.current
    if (!textarea) return
    const pos = textarea.selectionStart ?? value.length
    setCursorPos(pos)
  }

  const suggestions = useMemo(() => {
    if (!enableAutocomplete || !isFocused) return []
    const beforeCursor = value.slice(0, cursorPos)
    const match = beforeCursor.match(/([^\s,]+)$/)
    const query = match ? match[1].toLowerCase() : ''
    if (query.length < 2) return []
    return PROMPT_SUGGESTIONS
      .filter(item => item.toLowerCase().startsWith(query))
      .slice(0, 8)
  }, [enableAutocomplete, isFocused, value, cursorPos])

  const applySuggestion = (suggestion: string) => {
    const textarea = textareaRef.current
    if (!textarea) return
    const start = textarea.selectionStart ?? value.length
    const end = textarea.selectionEnd ?? value.length
    const range = start !== end
      ? { start, end }
      : findWordRange(value, start)
    const nextValue =
      value.slice(0, range.start) +
      suggestion +
      value.slice(range.end)
    onChange(nextValue)

    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (!el) return
      const nextPos = range.start + suggestion.length
      el.selectionStart = nextPos
      el.selectionEnd = nextPos
    })
  }

  return (
    <div className={`prompt-input ${isNegative ? 'negative' : ''}`}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onKeyUp={updateCursor}
        onClick={updateCursor}
        onFocus={() => {
          setIsFocused(true)
          updateCursor()
        }}
        onBlur={() => setIsFocused(false)}
        placeholder={placeholder || (isNegative ? 'Describe content you want to avoid.' : 'Describe the content you want to see, or leave empty.')}
        disabled={disabled}
        rows={minRows}
      />
      {suggestions.length > 0 && (
        <div className="prompt-suggestions">
          {suggestions.map(suggestion => (
            <div
              key={suggestion}
              className="prompt-suggestion-item"
              onMouseDown={e => {
                e.preventDefault()
                applySuggestion(suggestion)
              }}
            >
              {suggestion}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
