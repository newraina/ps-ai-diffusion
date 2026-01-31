import { Button } from '@swc-react/button'
import { ActionButton } from '@swc-react/action-button'
import { useGeneration } from '../contexts/generation-context'

interface GenerateButtonProps {
  onClick: () => void
  disabled?: boolean
}

export function GenerateButton({ onClick, disabled = false }: GenerateButtonProps) {
  const { strength, isGenerating, inpaintMode } = useGeneration()
  // inpaintMode will be used for mode dropdown feature
  void inpaintMode

  // Determine button text based on state
  const getButtonText = () => {
    if (isGenerating) return 'Cancel'
    if (strength < 100) return 'Refine'
    return 'Generate'
  }

  // Determine button icon based on state
  const getButtonIcon = () => {
    if (isGenerating) return '✕'
    if (strength < 100) return '✦'
    return '✦'
  }

  return (
    <div className="generate-row">
      <div className="generate-button-group">
        <Button
          variant={isGenerating ? 'secondary' : 'accent'}
          onClick={onClick}
          disabled={disabled && !isGenerating}
          className="generate-button"
        >
          <span className="generate-icon">{getButtonIcon()}</span>
          <span>{getButtonText()}</span>
        </Button>
        <ActionButton quiet className="mode-dropdown-button">
          ▼
        </ActionButton>
      </div>
      <ActionButton quiet className="queue-button" title="Queue">
        <span className="queue-icon">◷</span>
        <span className="queue-count">0</span>
      </ActionButton>
    </div>
  )
}
