import { useEffect, useState } from 'react'
import { Button } from '@swc-react/button'
import { ActionButton } from '@swc-react/action-button'
import { GeneratePanel } from './panels/generate-panel'
import {
  type ConnectionStatus,
  connect,
  getConnection,
} from './services/bridge-client'
import { getSettings } from './services/settings'
import { SettingsModal } from './components/settings-modal'

function App() {
  const [connection, setConnection] = useState<ConnectionStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const isConnected = connection?.status === 'connected'

  useEffect(() => {
    async function checkConnection() {
      try {
        const status = await getConnection()
        setConnection(status)
        setError(null)
      } catch {
        setError('Bridge not running. Start the Python Bridge service.')
      }
    }
    checkConnection()
  }, [])

  async function handleConnect() {
    setLoading(true)
    try {
      const settings = getSettings()
      const status = await connect(
        'local',
        settings.comfyUrl,
        settings.authToken || undefined,
      )
      setConnection(status)
      setError(null)
    } catch {
      setError('Failed to connect')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app">
      <header>
        <sp-heading size="M">AI Diffusion</sp-heading>
        <div className="header-actions">
          <ActionButton
            quiet
            onClick={() => setSettingsOpen(true)}
            title="Settings"
          >
            ⚙
          </ActionButton>
          <span className={`status-dot ${connection?.status ?? 'unknown'}`} />
        </div>
      </header>

      {error && <sp-body size="S" className="error">{error}</sp-body>}

      {!isConnected ? (
        <div className="connection-section">
          <sp-body size="S">Status: {connection?.status ?? 'unknown'}</sp-body>
          <Button variant="primary" onClick={handleConnect} disabled={loading}>
            {loading ? 'Connecting...' : 'Connect to ComfyUI'}
          </Button>
        </div>
      ) : (
        <GeneratePanel isConnected={isConnected} />
      )}

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  )
}

export default App
