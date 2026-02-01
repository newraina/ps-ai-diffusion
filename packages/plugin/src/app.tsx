import { useEffect, useState } from 'react'
import { Button } from '@swc-react/button'
import { GeneratePanel } from './panels/generate-panel'
import { UpscalePanel } from './panels/upscale-panel'
import { GenerationProvider, useGeneration } from './contexts/generation-context'
import { HistoryProvider } from './contexts/history-context'
import { StylesProvider } from './contexts/styles-context'
import {
  type ConnectionStatus,
  connect,
  getConnection,
  setBridgeMode,
} from './services/bridge-client'
import { getSettings } from './services/settings'

// Initialize bridge mode from saved settings
const initialSettings = getSettings()
setBridgeMode(
  initialSettings.connectionMode === 'comfyui-extension' ? 'comfyui' : 'standalone',
  initialSettings.comfyUrl,
)
import { SettingsModal } from './components/settings-modal'

interface AppContentProps {
  connection: ConnectionStatus | null
  loading: boolean
  error: string | null
  settingsOpen: boolean
  setSettingsOpen: (open: boolean) => void
  handleConnect: () => void
  handleSettingsClose: () => void
}

function AppContent({
  connection,
  loading,
  error,
  settingsOpen,
  setSettingsOpen,
  handleConnect,
  handleSettingsClose,
}: AppContentProps) {
  const { workspace } = useGeneration()
  const isConnected = connection?.status === 'connected'

  const renderPanel = () => {
    switch (workspace) {
      case 'upscaling':
        return (
          <UpscalePanel
            isConnected={isConnected}
            onOpenSettings={() => setSettingsOpen(true)}
            connectionStatus={connection?.status}
          />
        )
      default:
        return (
          <GeneratePanel
            isConnected={isConnected}
            onOpenSettings={() => setSettingsOpen(true)}
            connectionStatus={connection?.status}
          />
        )
    }
  }

  return (
    <div className="app">
      {error && <sp-body size="S" className="error">{error}</sp-body>}

      {!isConnected ? (
        <div className="connection-section">
          <sp-body size="S">Status: {connection?.status ?? 'unknown'}</sp-body>
          <div className="connection-buttons">
            <Button size="s" variant="primary" onClick={handleConnect} disabled={loading}>
              {loading ? 'Connecting...' : 'Connect'}
            </Button>
            <Button size="s" variant="secondary" onClick={() => setSettingsOpen(true)}>
              Settings
            </Button>
          </div>
        </div>
      ) : (
        renderPanel()
      )}

      <SettingsModal
        isOpen={settingsOpen}
        onClose={handleSettingsClose}
      />
    </div>
  )
}

function App() {
  const [connection, setConnection] = useState<ConnectionStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

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
    setError(null)
    try {
      const settings = getSettings()
      // Update bridge mode from latest settings
      setBridgeMode(
        settings.connectionMode === 'comfyui-extension' ? 'comfyui' : 'standalone',
        settings.comfyUrl,
      )

      if (settings.backendType === 'cloud') {
        // Cloud backend connection
        const status = await connect(
          'cloud',
          undefined,
          settings.cloudAccessToken || undefined,
        )
        setConnection(status)
      } else {
        // Local backend connection
        // In standalone mode, don't pass comfyUrl - let bridge use its default ComfyUI address
        // In comfyui-extension mode, pass the ComfyUI URL for the bridge to connect to itself
        const comfyUrlForBridge = settings.connectionMode === 'comfyui-extension'
          ? settings.comfyUrl
          : undefined
        const status = await connect(
          'local',
          comfyUrlForBridge,
          settings.authToken || undefined,
        )
        setConnection(status)
      }
    } catch {
      setError('Failed to connect')
    } finally {
      setLoading(false)
    }
  }

  function handleSettingsClose() {
    setSettingsOpen(false)
    // Re-check connection with updated settings
    handleConnect()
  }

  return (
    <StylesProvider>
      <GenerationProvider>
        <HistoryProvider>
          <AppContent
            connection={connection}
            loading={loading}
            error={error}
            settingsOpen={settingsOpen}
            setSettingsOpen={setSettingsOpen}
            handleConnect={handleConnect}
            handleSettingsClose={handleSettingsClose}
          />
        </HistoryProvider>
      </GenerationProvider>
    </StylesProvider>
  )
}

export default App
