interface PromptInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label: string
}

export function PromptInput({
  value,
  onChange,
  placeholder,
  label,
}: PromptInputProps) {
  return (
    <label className="prompt-input">
      <span>{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
      />
    </label>
  )
}
