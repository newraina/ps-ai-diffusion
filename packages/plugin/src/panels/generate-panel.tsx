import { useState } from 'react'
import { Button } from '@swc-react/button'
import { PromptInput } from '../components/prompt-input'
import { generate } from '../services/bridge-client'

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

      <Button
        variant="accent"
        onClick={handleGenerate}
        disabled={!isConnected || generating || !prompt.trim()}
      >
        {generating ? 'Generating...' : 'Generate'}
      </Button>

      {jobId && <sp-body size="S" className="job-id">Job: {jobId}</sp-body>}
    </div>
  )
}
