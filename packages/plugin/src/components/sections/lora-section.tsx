import { ActionButton } from '@swc-react/action-button'
import { useGeneration } from '../../contexts/generation-context'

export function LoraSection() {
  const { loras, addLora, updateLora, removeLora } = useGeneration()

  return (
    <div className="lora-section" style={{ marginTop: 8, marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <sp-body size="XS" style={{ fontWeight: 600 }}>LoRAs</sp-body>
        <div style={{ flex: 1 }} />
        <ActionButton size="s" quiet title="Add LoRA" onClick={addLora}>
          + Add
        </ActionButton>
      </div>

      {loras.length === 0 && (
        <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 8 }}>
          No LoRAs. Click “+ Add” to attach one.
        </div>
      )}

      {loras.map(lora => (
        <div
          key={lora.id}
          style={{
            border: '1px solid #444',
            borderRadius: 4,
            padding: 8,
            marginBottom: 8,
            background: '#333',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <input
              type="text"
              className="text-input"
              value={lora.name}
              placeholder="LoRA name (e.g. my_lora.safetensors)"
              onChange={e => updateLora(lora.id, { name: e.target.value })}
              style={{ flex: 1 }}
            />
            <ActionButton size="s" quiet title="Remove LoRA" onClick={() => removeLora(lora.id)}>
              Remove
            </ActionButton>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, width: 60 }}>Strength</span>
            <sp-slider
              min={-2}
              max={2}
              step={0.05}
              value={lora.strength}
              onInput={(e: any) => updateLora(lora.id, { strength: Number(e.target.value) })}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 11, width: 44, textAlign: 'right' }}>
              {lora.strength.toFixed(2)}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

