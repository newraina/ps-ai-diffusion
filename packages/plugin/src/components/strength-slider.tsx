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
      <input
        type="range"
        className="strength-slider"
        min={1}
        max={100}
        value={strength}
        onChange={handleSliderChange}
      />
      <input
        type="checkbox"
        className="strength-checkbox"
        checked={strength < 100}
        onChange={() => setStrength(strength === 100 ? 75 : 100)}
      />
      <span className="strength-display">Strength: {displayValue}</span>
      <ActionButton quiet className="control-button" title="Add Control Layer">
        ⊞
      </ActionButton>
      <ActionButton quiet className="region-button" title="Add Region">
        ▣
      </ActionButton>
    </div>
  )
}
