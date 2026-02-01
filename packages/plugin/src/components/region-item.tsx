import { useState, useEffect } from 'react'
import { Picker, Item } from '@swc-react/picker'
import { ActionButton } from '@swc-react/action-button'
import { Icon } from '../icons'
import { PromptInput } from './prompt-input'
import { useGeneration } from '../contexts/generation-context'
import { getLayers, type LayerInfo } from '../services/photoshop-layer'
import type { Region } from '../types'

interface RegionItemProps {
  region: Region
}

export function RegionItem({ region }: RegionItemProps) {
  const { updateRegion, removeRegion } = useGeneration()
  const [psLayers, setPsLayers] = useState<LayerInfo[]>([])

  useEffect(() => {
    setPsLayers(getLayers())
  }, [])

  const handleLayerChange = (e: Event) => {
    const target = e.target as HTMLSelectElement
    const layerId = Number(target.value)
    updateRegion(region.id, { layerId: layerId })
  }

  const handlePromptChange = (value: string) => {
    updateRegion(region.id, { prompt: value })
  }

  const handleNegativePromptChange = (value: string) => {
    updateRegion(region.id, { negativePrompt: value })
  }

  return (
    <div className="region-item" style={{ 
      border: '1px solid #444', 
      borderRadius: 4, 
      padding: 8, 
      marginBottom: 8,
      background: '#333'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontWeight: 'bold', fontSize: 12 }}>{region.name}</span>
        <div style={{ flex: 1 }} />
        <ActionButton 
          size="s" 
          quiet 
          onClick={() => removeRegion(region.id)}
        >
          <Icon name="remove" size={14} />
        </ActionButton>
      </div>

      <div style={{ marginBottom: 8 }}>
        <Picker 
          size="s" 
          value={region.layerId?.toString() || ''}
          change={handleLayerChange}
          style={{ width: '100%' }}
        >
          <Item value="">Select Linked Layer...</Item>
          {psLayers.map(l => (
            <Item key={l.id} value={l.id.toString()}>{l.name}</Item>
          ))}
        </Picker>
      </div>

      <div style={{ marginBottom: 8 }}>
        <PromptInput 
          value={region.prompt} 
          onChange={handlePromptChange} 
          minRows={2} 
          maxRows={4}
          placeholder="Region Prompt"
        />
      </div>
      
      <div>
        <PromptInput 
          value={region.negativePrompt} 
          onChange={handleNegativePromptChange} 
          minRows={1} 
          maxRows={2}
          isNegative
          placeholder="Negative Prompt (Optional)"
        />
      </div>
    </div>
  )
}
