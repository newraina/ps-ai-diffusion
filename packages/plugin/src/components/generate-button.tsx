import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@swc-react/button'
import { ActionButton } from '@swc-react/action-button'
import { useGeneration } from '../contexts/generation-context'
import { Icon, type IconName } from '../icons'
import type { InpaintMode } from '../types'

interface GenerateButtonProps {
  onClick: () => void
  onQueueCurrent?: () => void
  onQueueFront?: () => void
  onQueueReplace?: () => void
  onCancelAll?: () => void
  queueDisabled?: boolean
  disabled?: boolean
}

export function GenerateButton({
  onClick,
  onQueueCurrent,
  onQueueFront,
  onQueueReplace,
  onCancelAll,
  queueDisabled = false,
  disabled = false,
}: GenerateButtonProps) {
  const {
    strength,
    isGenerating,
    inpaintMode,
    setInpaintMode,
    queue,
    removeQueueItem,
    clearQueue,
  } = useGeneration()
  const [isModeOpen, setIsModeOpen] = useState(false)
  const [isQueueOpen, setIsQueueOpen] = useState(false)
  const [queueMode, setQueueMode] = useState<'back' | 'front' | 'replace'>('back')
  const modeRef = useRef<HTMLDivElement>(null)
  const queueRef = useRef<HTMLDivElement>(null)

  const modeOptions: Array<{ value: InpaintMode; label: string }> = useMemo(() => ([
    { value: 'automatic', label: 'Automatic' },
    { value: 'fill', label: 'Fill' },
    { value: 'expand', label: 'Expand' },
    { value: 'add_object', label: 'Add Content' },
    { value: 'remove_object', label: 'Remove Content' },
    { value: 'replace_background', label: 'Replace Background' },
    { value: 'custom', label: 'Custom' },
  ]), [])

  useEffect(() => {
    if (!isModeOpen && !isQueueOpen) return
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (modeRef.current && modeRef.current.contains(target)) {
        return
      }
      if (queueRef.current && queueRef.current.contains(target)) {
        return
      }
      setIsModeOpen(false)
      setIsQueueOpen(false)
    }
    window.addEventListener('mousedown', handleClick, { capture: true })
    return () => {
      window.removeEventListener('mousedown', handleClick, { capture: true })
    }
  }, [isModeOpen, isQueueOpen])

  // Determine button text based on state
  const getButtonText = () => {
    if (isGenerating) return 'Cancel'
    if (strength < 100) return 'Refine'
    return 'Generate'
  }

  // Determine button icon based on state
  const getButtonIcon = (): IconName => {
    if (isGenerating) return 'cancel'
    if (strength < 100) return 'refine'
    return 'generate'
  }

  const queueCount = queue.length + (isGenerating ? 1 : 0)
  const queueIcon: IconName = isGenerating
    ? 'queue-active'
    : queue.length > 0
      ? 'queue-waiting'
      : 'queue-inactive'

  const handleQueueCurrent = () => {
    if (queueMode === 'front' && onQueueFront) {
      onQueueFront()
      return
    }
    if (queueMode === 'replace' && onQueueReplace) {
      onQueueReplace()
      return
    }
    onQueueCurrent?.()
  }

  return (
    <div className="generate-row">
      <div className="generate-button-group">
        <Button
          size="s"
          variant={isGenerating ? 'secondary' : 'accent'}
          onClick={onClick}
          disabled={disabled && !isGenerating}
          className="generate-button"
        >
          <span className="generate-button-content">
            <Icon name={getButtonIcon()} size={14} className="generate-icon" />
            <span>{getButtonText()}</span>
          </span>
        </Button>
        <div ref={modeRef} className="mode-menu-anchor">
          <ActionButton
            size="s"
            quiet
            className="mode-dropdown-button"
            onClick={() => setIsModeOpen(open => !open)}
            title="Generation Mode"
          >
            <span className="dropdown-arrow">▼</span>
          </ActionButton>
          {isModeOpen && (
            <div className="mode-menu">
              {modeOptions.map(option => (
                <div
                  key={option.value}
                  className={`mode-menu-item ${option.value === inpaintMode ? 'selected' : ''}`}
                  onClick={() => {
                    setInpaintMode(option.value)
                    setIsModeOpen(false)
                  }}
                >
                  {option.label}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div ref={queueRef} className="queue-menu-anchor">
        <ActionButton
          size="s"
          quiet
          className="queue-button"
          title="Queue"
          onClick={() => setIsQueueOpen(open => !open)}
        >
          <Icon name={queueIcon} size={14} className="queue-icon" />
          <span className="queue-count">{queueCount}</span>
        </ActionButton>
        {isQueueOpen && (
          <div className="queue-menu">
            <div className="queue-menu-header">
              <span className="queue-title">Queue</span>
            </div>
            <div className="queue-status">
              {isGenerating ? 'Generating…' : 'Idle'}
            </div>
            <div className="queue-counts">
              <div className="queue-count-item">
                <span className="queue-count-label">Document</span>
                <span className="queue-count-value">{queueCount}</span>
              </div>
              <div className="queue-count-item">
                <span className="queue-count-label">Total</span>
                <span className="queue-count-value">{queueCount}</span>
              </div>
            </div>
            {onQueueCurrent && (
              <div className="queue-actions">
                <div className="queue-mode">
                  <label className="queue-mode-label" htmlFor="queue-mode-select">Enqueue</label>
                  <select
                    id="queue-mode-select"
                    className="queue-mode-select"
                    value={queueMode}
                    onChange={(event) => setQueueMode(event.target.value as 'back' | 'front' | 'replace')}
                  >
                    <option value="back">at the Back</option>
                    <option value="front">in Front (new jobs first)</option>
                    <option value="replace">Replace Queue</option>
                  </select>
                </div>
                <button
                  type="button"
                  className="queue-add"
                  onClick={handleQueueCurrent}
                  disabled={queueDisabled}
                >
                  Queue Current Settings
                </button>
              </div>
            )}
            {queue.length === 0 ? (
              <div className="queue-empty">No queued jobs</div>
            ) : (
              <div className="queue-list">
                {queue.map(item => (
                  <div key={item.id} className="queue-item">
                    <span className="queue-item-label">
                      {item.snapshot.prompt.trim() || 'Untitled prompt'}
                    </span>
                    <ActionButton
                      size="s"
                      quiet
                      className="queue-item-remove"
                      onClick={() => removeQueueItem(item.id)}
                      title="Remove from queue"
                    >
                      <Icon name="remove" size={12} />
                    </ActionButton>
                  </div>
                ))}
              </div>
            )}
            <div className="queue-actions">
              <button
                type="button"
                className="queue-clear"
                onClick={onClick}
                disabled={!isGenerating}
              >
                Cancel Active
              </button>
              <button
                type="button"
                className="queue-clear"
                onClick={() => clearQueue()}
                disabled={queue.length === 0}
              >
                Cancel Queued
              </button>
              <button
                type="button"
                className="queue-clear"
                onClick={onCancelAll}
                disabled={!isGenerating && queue.length === 0}
              >
                Cancel All
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
