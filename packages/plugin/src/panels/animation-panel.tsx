import { Button } from '@swc-react/button'
import { StyleSelector } from '../components/style-selector'
import { openBrowser } from '../utils/uxp'

interface AnimationPanelProps {
  isConnected: boolean
  onOpenSettings?: () => void
  connectionStatus?: string
}

export function AnimationPanel({ onOpenSettings, connectionStatus }: AnimationPanelProps) {
  return (
    <div className="placeholder-panel">
      <StyleSelector
        onOpenSettings={onOpenSettings}
        connectionStatus={connectionStatus}
      />
      <div className="placeholder-card">
        <h3>Animation</h3>
        <p>
          Animation workflows are not available in Photoshop yet.
          This workspace will support keyframe and frame batch generation.
        </p>
        <Button
          size="s"
          variant="secondary"
          onClick={() => openBrowser('https://docs.interstice.cloud')}
        >
          Open Docs
        </Button>
      </div>
    </div>
  )
}
