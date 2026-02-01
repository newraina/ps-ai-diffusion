import { useState, useEffect } from 'react'
import { Picker, Item } from '@swc-react/picker'
import { ActionButton } from '@swc-react/action-button'
import { Icon } from '../icons'
import { PromptInput } from './prompt-input'
import { useGeneration } from '../contexts/generation-context'
import {
  getLayers,
  type LayerInfo,
  getSelectionMaskBase64,
  getSelectionBounds,
  getLayerBounds,
  getLayerTransparencyMaskBase64,
} from '../services/photoshop-layer'
import type { Region } from '../types'

interface RegionItemProps {
  region: Region
}

export function RegionItem({ region }: RegionItemProps) {
  const { updateRegion, removeRegion } = useGeneration()
  const [psLayers, setPsLayers] = useState<LayerInfo[]>([])
  const [isCapturing, setIsCapturing] = useState(false)

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

  const handleSourceChange = (e: Event) => {
    const target = e.target as HTMLSelectElement
    const value = target.value === 'layer' ? 'layer' : 'selection'
    updateRegion(region.id, {
      maskSource: value,
      // Clear captured mask when switching source to prevent accidental reuse.
      maskBase64: null,
      bounds: null,
    })
  }

  const captureSelection = async () => {
    setIsCapturing(true)
    try {
      const mask = await getSelectionMaskBase64()
      if (!mask) {
        alert('No active selection to capture')
        return
      }
      const bounds = await getSelectionBounds()
      updateRegion(region.id, {
        maskSource: 'selection',
        maskBase64: mask,
        bounds: bounds || null,
      })
    } catch (e) {
      console.error('Failed to capture selection mask:', e)
      alert(`Failed to capture selection mask: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setIsCapturing(false)
    }
  }

  const captureLayer = async () => {
    if (!region.layerId) {
      alert('Select a linked layer first')
      return
    }
    setIsCapturing(true)
    try {
      const bounds = await getLayerBounds(region.layerId)
      const mask = await getLayerTransparencyMaskBase64(region.layerId)
      updateRegion(region.id, {
        maskSource: 'layer',
        maskBase64: mask,
        bounds: bounds || null,
      })
    } catch (e) {
      console.error('Failed to capture layer mask:', e)
      alert(`Failed to capture layer mask: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setIsCapturing(false)
    }
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

      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <Picker
            size="s"
            value={region.maskSource}
            change={handleSourceChange}
            style={{ width: '100%' }}
          >
            <Item value="selection">Mask: Selection</Item>
            <Item value="layer">Mask: Layer</Item>
          </Picker>
        </div>
        <ActionButton
          size="s"
          quiet
          disabled={isCapturing}
          title="Capture selection as this region mask"
          onClick={() => captureSelection()}
        >
          Capture Sel
        </ActionButton>
        <ActionButton
          size="s"
          quiet
          disabled={isCapturing || !region.layerId}
          title="Capture linked layer transparency as this region mask"
          onClick={() => captureLayer()}
        >
          Capture Layer
        </ActionButton>
      </div>

      <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 8 }}>
        {region.maskBase64
          ? `Mask captured (${region.maskSource}${region.bounds ? `, bounds ${region.bounds.width}×${region.bounds.height}` : ''})`
          : 'No mask captured yet'}
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
