import { Textfield } from '@swc-react/textfield'
import { FieldLabel } from '@swc-react/field-label'

interface PromptInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label: string
  id?: string
}

export function PromptInput({
  value,
  onChange,
  placeholder,
  label,
  id,
}: PromptInputProps) {
  const inputId = id ?? `prompt-input-${label.toLowerCase().replace(/\s+/g, '-')}`

  return (
    <div className="prompt-input">
      <FieldLabel for={inputId}>{label}</FieldLabel>
      <Textfield
        id={inputId}
        multiline
        grows
        value={value}
        placeholder={placeholder}
        onInput={(e) => onChange((e.target as HTMLInputElement).value)}
      />
    </div>
  )
}
