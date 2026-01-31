import { useGeneration } from '../contexts/generation-context'

export function ProgressBar() {
  const { progress, isGenerating } = useGeneration()

  if (!isGenerating && progress === 0) {
    return <div className="progress-bar-container" />
  }

  return (
    <div className="progress-bar-container">
      <div
        className="progress-bar-fill"
        style={{ width: `${progress * 100}%` }}
      />
    </div>
  )
}
