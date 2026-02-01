import { useState, useEffect } from 'react'
import { Picker, Item } from '@swc-react/picker'
import { ActionButton } from '@swc-react/action-button'
import { Icon } from '../icons'
import { useGeneration } from '../contexts/generation-context'
import { getLayers, type LayerInfo, getDocumentImageBase64 } from '../services/photoshop-layer'
import type { ControlLayer, ControlMode } from '../types'

interface ControlLayerItemProps {
  layer: ControlLayer
}

const controlModes: { value: ControlMode; label: string }[] = [
  { value: 'reference', label: 'Reference (IP-Adapter)' },
  { value: 'style', label: 'Style (IP-Adapter)' },
  { value: 'composition', label: 'Composition (IP-Adapter)' },
  { value: 'face', label: 'Face (IP-Adapter)' },
  { value: 'canny', label: 'Canny' },
  { value: 'depth', label: 'Depth' },
  { value: 'pose', label: 'Pose' },
  { value: 'lineart', label: 'Lineart' },
  { value: 'scribble', label: 'Scribble' },
  { value: 'segmentation', label: 'Segmentation' },
  { value: 'normal', label: 'Normal Map' },
  { value: 'softedge', label: 'Soft Edge' },
]

export function ControlLayerItem({ layer }: ControlLayerItemProps) {
  const { updateControlLayer, removeControlLayer } = useGeneration()
  const [psLayers, setPsLayers] = useState<LayerInfo[]>([])
  const [isCapturing, setIsCapturing] = useState(false)

  useEffect(() => {
    setPsLayers(getLayers())
  }, [])

  const handleModeChange = (e: Event) => {
    const target = e.target as HTMLSelectElement
    updateControlLayer(layer.id, { mode: target.value as ControlMode })
  }

  const handleLayerChange = (e: Event) => {
    const target = e.target as HTMLSelectElement
    const layerId = Number(target.value)
    const psLayer = psLayers.find(l => l.id === layerId)
    updateControlLayer(layer.id, { 
      layerId: layerId,
      layerName: psLayer?.name || ''
    })
  }

  const handleStrengthChange = (e: any) => {
    updateControlLayer(layer.id, { strength: Number(e.target.value) })
  }

  const handleEnabledChange = (e: any) => {
    updateControlLayer(layer.id, { isEnabled: e.target.checked })
  }

  const handlePreprocessorChange = (e: any) => {
    updateControlLayer(layer.id, { isPreprocessor: !!e.target.checked })
  }

  const handleRangeStartChange = (e: any) => {
    const start = Number(e.target.value)
    updateControlLayer(layer.id, {
      rangeStart: start,
      rangeEnd: Math.max(start, layer.rangeEnd),
    })
  }

  const handleRangeEndChange = (e: any) => {
    const end = Number(e.target.value)
    updateControlLayer(layer.id, {
      rangeStart: Math.min(layer.rangeStart, end),
      rangeEnd: end,
    })
  }

  const handleFromDoc = async () => {
    setIsCapturing(true)
    try {
      const img = await getDocumentImageBase64()
      updateControlLayer(layer.id, {
        image: img,
        layerId: null,
        layerName: '[Document]',
      })
    } catch (e) {
      console.error('Failed to capture document for control layer:', e)
      alert(`Failed to capture document: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setIsCapturing(false)
    }
  }

  const handleClearCaptured = () => {
    updateControlLayer(layer.id, { image: null })
  }

  return (
    <div className="control-layer-item" style={{ 
      border: '1px solid #444', 
      borderRadius: 4, 
      padding: 8, 
      marginBottom: 8,
      background: '#333'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <sp-checkbox 
          checked={layer.isEnabled ? true : undefined} 
          onClick={handleEnabledChange}
        />
        <div style={{ flex: 1 }}>
          <Picker 
            size="s" 
            value={layer.mode}
            change={handleModeChange}
            style={{ width: '100%' }}
          >
            {controlModes.map(m => (
              <Item key={m.value} value={m.value}>{m.label}</Item>
            ))}
          </Picker>
        </div>
        <ActionButton 
          size="s" 
          quiet 
          onClick={() => removeControlLayer(layer.id)}
        >
          <Icon name="remove" size={14} />
        </ActionButton>
      </div>

      <div style={{ marginBottom: 8 }}>
        <Picker 
          size="s" 
          value={layer.layerId?.toString() || ''}
          change={handleLayerChange}
          style={{ width: '100%' }}
        >
          <Item value="">Select Layer...</Item>
          {psLayers.map(l => (
            <Item key={l.id} value={l.id.toString()}>{l.name}</Item>
          ))}
        </Picker>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <sp-checkbox
          checked={layer.isPreprocessor ? true : undefined}
          onClick={handlePreprocessorChange}
        />
        <span style={{ fontSize: 11 }}>Preprocess</span>
        <div style={{ flex: 1 }} />
        <ActionButton
          size="s"
          quiet
          disabled={isCapturing}
          title="Use the whole document as control input"
          onClick={() => handleFromDoc()}
        >
          From Doc
        </ActionButton>
        <ActionButton
          size="s"
          quiet
          disabled={!layer.image}
          title="Clear captured control image"
          onClick={handleClearCaptured}
        >
          Clear
        </ActionButton>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, width: 50 }}>Strength</span>
        <sp-slider 
          min={0} 
          max={2} 
          step={0.05}
          value={layer.strength}
          onInput={handleStrengthChange}
          style={{ flex: 1 }}
        />
        <span style={{ fontSize: 11, width: 30, textAlign: 'right' }}>
          {layer.strength.toFixed(2)}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
        <span style={{ fontSize: 11, width: 50 }}>Range</span>
        <sp-slider
          min={0}
          max={1}
          step={0.01}
          value={layer.rangeStart}
          onInput={handleRangeStartChange}
          style={{ flex: 1 }}
        />
        <sp-slider
          min={0}
          max={1}
          step={0.01}
          value={layer.rangeEnd}
          onInput={handleRangeEndChange}
          style={{ flex: 1 }}
        />
        <span style={{ fontSize: 11, width: 56, textAlign: 'right' }}>
          {layer.rangeStart.toFixed(2)}–{layer.rangeEnd.toFixed(2)}
        </span>
      </div>
    </div>
  )
}
