import { useState } from 'react'
import { PromptInput } from '../components/PromptInput'
import { generate } from '../services/bridgeClient'

interface GeneratePanelProps {
  isConnected: boolean
}

export function GeneratePanel({ isConnected }: GeneratePanelProps) {
  const [prompt, setPrompt] = useState('')
  const [negativePrompt, setNegativePrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)

  async function handleGenerate() {
    if (!prompt.trim()) return

    setGenerating(true)
    try {
      const response = await generate({
        prompt,
        negative_prompt: negativePrompt,
        width: 512,
        height: 512,
      })
      setJobId(response.job_id)
    } catch (e) {
      console.error('Generation failed:', e)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="generate-panel">
      <PromptInput
        label="Prompt"
        value={prompt}
        onChange={setPrompt}
        placeholder="Describe what you want to generate..."
      />

      <PromptInput
        label="Negative Prompt"
        value={negativePrompt}
        onChange={setNegativePrompt}
        placeholder="What to avoid..."
      />

      <button
        type="button"
        onClick={handleGenerate}
        disabled={!isConnected || generating || !prompt.trim()}
        className="generate-button"
      >
        {generating ? 'Generating...' : 'Generate'}
      </button>

      {jobId && <p className="job-id">Job: {jobId}</p>}
    </div>
  )
}
