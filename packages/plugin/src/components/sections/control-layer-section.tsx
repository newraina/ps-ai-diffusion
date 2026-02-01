import { useGeneration } from '../../contexts/generation-context'
import { ControlLayerItem } from '../control-layer-item'

export function ControlLayerSection() {
  const { controlLayers } = useGeneration()

  if (controlLayers.length === 0) return null

  return (
    <div className="control-layer-section">
      {controlLayers.map(layer => (
        <ControlLayerItem key={layer.id} layer={layer} />
      ))}
    </div>
  )
}
