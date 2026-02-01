import { Picker, Item } from '@swc-react/picker'
import { useGeneration } from '../../contexts/generation-context'
import type { InpaintMode, InpaintFillMode, InpaintContext } from '../../types'

export function InpaintSettings() {
  const { 
    inpaintMode, setInpaintMode,
    inpaintFill, setInpaintFill,
    inpaintContext, setInpaintContext
  } = useGeneration()

  return (
    <div className="inpaint-settings" style={{ marginTop: 8, marginBottom: 8 }}>
      <div style={{ marginBottom: 8 }}>
        <Picker
          size="s"
          label="Inpaint Mode"
          value={inpaintMode}
          change={e => setInpaintMode(e.target.value as InpaintMode)}
          style={{ width: '100%' }}
        >
          <Item value="automatic">Automatic</Item>
          <Item value="fill">Fill</Item>
          <Item value="expand">Expand</Item>
          <Item value="add_object">Add Object</Item>
          <Item value="remove_object">Remove Object</Item>
          <Item value="replace_background">Replace Background</Item>
          <Item value="custom">Custom</Item>
        </Picker>
      </div>
      
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <Picker
            size="s"
            label="Fill"
            value={inpaintFill}
            change={e => setInpaintFill(e.target.value as InpaintFillMode)}
            style={{ width: '100%' }}
          >
            <Item value="none">None</Item>
            <Item value="neutral">Neutral</Item>
            <Item value="blur">Blur</Item>
            <Item value="border">Border</Item>
            <Item value="inpaint">Inpaint</Item>
          </Picker>
        </div>
        <div style={{ flex: 1 }}>
          <Picker
            size="s"
            label="Context"
            value={inpaintContext}
            change={e => setInpaintContext(e.target.value as InpaintContext)}
            style={{ width: '100%' }}
          >
            <Item value="automatic">Automatic</Item>
            <Item value="mask_bounds">Mask Bounds</Item>
            <Item value="entire_image">Entire Image</Item>
          </Picker>
        </div>
      </div>
    </div>
  )
}
