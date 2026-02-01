import { Button } from '@swc-react/button'
import { StyleSelector } from '../components/style-selector'
import { openBrowser } from '../utils/uxp'

interface CustomPanelProps {
  isConnected: boolean
  onOpenSettings?: () => void
  connectionStatus?: string
}

export function CustomPanel({ onOpenSettings, connectionStatus }: CustomPanelProps) {
  return (
    <div className="placeholder-panel">
      <StyleSelector
        onOpenSettings={onOpenSettings}
        connectionStatus={connectionStatus}
      />
      <div className="placeholder-card">
        <h3>Custom Workflow</h3>
        <p>
          Custom ComfyUI workflows are not available in Photoshop yet.
          Use Krita for full graph support, or follow the docs for updates.
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
