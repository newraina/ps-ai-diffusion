import { useGeneration } from '../../contexts/generation-context'
import { RegionItem } from '../region-item'

export function RegionSection() {
  const { regions } = useGeneration()

  if (regions.length === 0) return null

  return (
    <div className="region-section">
      {regions.map(region => (
        <RegionItem key={region.id} region={region} />
      ))}
    </div>
  )
}
