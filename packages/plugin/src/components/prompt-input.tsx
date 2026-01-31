import { Textfield } from '@swc-react/textfield'

interface PromptInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label: string
  id?: string
  disabled?: boolean
}

export function PromptInput({
  value,
  onChange,
  placeholder,
  label,
  id,
  disabled = false,
}: PromptInputProps) {
  const inputId = id ?? `prompt-input-${label.toLowerCase().replace(/\s+/g, '-')}`

  return (
    <div className="prompt-input">
      <sp-body size="S">{label}</sp-body>
      <Textfield
        id={inputId}
        multiline
        grows
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onInput={(e) => onChange((e.target as HTMLInputElement).value)}
      />
    </div>
  )
}
