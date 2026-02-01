import { useGeneration } from '../contexts/generation-context'
import { ActionButton } from '@swc-react/action-button'

export function StrengthSlider() {
  const { strength, setStrength } = useGeneration()

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setStrength(parseInt(e.target.value, 10))
  }

  const displayValue = strength === 1 ? 'Off' : `${strength}%`

  return (
    <div className="strength-row">
      <sp-slider
        className="strength-slider"
        min={1}
        max={100}
        value={strength}
        onInput={handleSliderChange}
      />
      <sp-checkbox
        className="strength-checkbox"
        checked={strength < 100 ? true : undefined}
        onClick={() => setStrength(strength === 100 ? 75 : 100)}
      />
      <span className="strength-display">Strength: {displayValue}</span>
      <ActionButton size="s" quiet className="control-button" title="Add Control Layer">
        ⊞
      </ActionButton>
      <ActionButton size="s" quiet className="region-button" title="Add Region">
        ▣
      </ActionButton>
    </div>
  )
}
