interface PromptInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label: string
}

export function PromptInput({ value, onChange, placeholder, label }: PromptInputProps) {
  return (
    <div className="prompt-input">
      <label>{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
      />
    </div>
  )
}
