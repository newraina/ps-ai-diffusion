import { Button } from '@swc-react/button'
import { ActionButton } from '@swc-react/action-button'
import { useGeneration } from '../contexts/generation-context'
import { Icon, type IconName } from '../icons'

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
  const getButtonIcon = (): IconName => {
    if (isGenerating) return 'cancel'
    if (strength < 100) return 'refine'
    return 'generate'
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
        <ActionButton size="s" quiet className="mode-dropdown-button">
          <span className="dropdown-arrow">▼</span>
        </ActionButton>
      </div>
      <ActionButton size="s" quiet className="queue-button" title="Queue">
        <Icon name="queue-inactive" size={14} className="queue-icon" />
        <span className="queue-count">0</span>
      </ActionButton>
    </div>
  )
}
