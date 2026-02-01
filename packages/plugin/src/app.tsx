import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@swc-react/button'
import { GeneratePanel } from './panels/generate-panel'
import { UpscalePanel } from './panels/upscale-panel'
import { LivePanel } from './panels/live-panel'
import { AnimationPanel } from './panels/animation-panel'
import { CustomPanel } from './panels/custom-panel'
import { GenerationProvider, useGeneration } from './contexts/generation-context'
import { HistoryProvider } from './contexts/history-context'
import { StylesProvider } from './contexts/styles-context'
import {
  type ConnectionStatus,
  type DiagnosticsResponse,
  connect,
  getConnection,
  getDiagnostics,
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
  diagnostics: DiagnosticsResponse | null
  diagnosticsError: string | null
  diagnosticsLoading: boolean
  isConnected: boolean
  onRunDiagnostics: () => void
  settingsOpen: boolean
  setSettingsOpen: (open: boolean) => void
  handleConnect: () => void
  handleSettingsClose: () => void
}

function AppContent({
  connection,
  loading,
  error,
  diagnostics,
  diagnosticsError,
  diagnosticsLoading,
  isConnected,
  onRunDiagnostics,
  settingsOpen,
  setSettingsOpen,
  handleConnect,
  handleSettingsClose,
}: AppContentProps) {
  const { workspace } = useGeneration()

  const renderDiagnosticsList = useCallback((items: string[], emptyLabel: string) => {
    if (!items || items.length === 0) {
      return <sp-body size="XS" className="diagnostics-empty">{emptyLabel}</sp-body>
    }
    return (
      <ul className="diagnostics-list">
        {items.map(item => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    )
  }, [])

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
      case 'live':
        return (
          <LivePanel
            isConnected={isConnected}
            onOpenSettings={() => setSettingsOpen(true)}
            connectionStatus={connection?.status}
          />
        )
      case 'animation':
        return (
          <AnimationPanel
            isConnected={isConnected}
            onOpenSettings={() => setSettingsOpen(true)}
            connectionStatus={connection?.status}
          />
        )
      case 'custom':
        return (
          <CustomPanel
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
          <div className="diagnostics-card">
            <div className="diagnostics-header">
              <span className="diagnostics-title">Diagnostics</span>
              <Button
                size="s"
                variant="secondary"
                onClick={onRunDiagnostics}
                disabled={diagnosticsLoading}
              >
                {diagnosticsLoading ? 'Running...' : 'Refresh'}
              </Button>
            </div>
            <sp-body size="XS" className="diagnostics-empty">
              Connect to the bridge to fetch diagnostics.
            </sp-body>
            {diagnosticsError && (
              <sp-body size="S" className="test-result error">
                {diagnosticsError}
              </sp-body>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="diagnostics-card">
            <div className="diagnostics-header">
              <span className="diagnostics-title">Diagnostics</span>
              <div className="diagnostics-actions">
                <Button
                  size="s"
                  variant="secondary"
                  onClick={onRunDiagnostics}
                  disabled={diagnosticsLoading}
                >
                  {diagnosticsLoading ? 'Running...' : 'Refresh'}
                </Button>
                {diagnostics && (
                  <sp-body
                    size="XS"
                    className={`diagnostics-status ${diagnostics.connected ? 'connected' : 'error'}`}
                  >
                    {diagnostics.connected ? 'Connected' : 'Not connected'}
                  </sp-body>
                )}
              </div>
            </div>
            {diagnosticsError && (
              <sp-body size="S" className="test-result error">
                {diagnosticsError}
              </sp-body>
            )}
            {diagnostics?.error && (
              <sp-body size="S" className="test-result error">
                {diagnostics.error}
              </sp-body>
            )}
            {diagnostics && !diagnostics.error && (
              <div className="diagnostics-results">
                <div className="diagnostics-block">
                  <span className="diagnostics-label">Missing nodes</span>
                  {renderDiagnosticsList(diagnostics.missing_nodes, 'None')}
                </div>
                <div className="diagnostics-block">
                  <span className="diagnostics-label">Missing required models</span>
                  {renderDiagnosticsList(diagnostics.missing_required_models, 'None')}
                </div>
                <div className="diagnostics-block">
                  <span className="diagnostics-label">Missing optional models</span>
                  {renderDiagnosticsList(diagnostics.missing_optional_models, 'None')}
                </div>
              </div>
            )}
          </div>
          {renderPanel()}
        </>
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
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResponse | null>(null)
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null)
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false)
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current)
        refreshTimerRef.current = null
      }
    }
  }, [])

  const runDiagnostics = useCallback(async () => {
    setDiagnosticsLoading(true)
    setDiagnosticsError(null)
    try {
      const result = await getDiagnostics()
      setDiagnostics(result)
    } catch (e) {
      setDiagnosticsError(String(e))
    } finally {
      setDiagnosticsLoading(false)
    }
  }, [])

  const scheduleDiagnosticsRefresh = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current)
    }
    refreshTimerRef.current = setTimeout(() => {
      runDiagnostics()
    }, 200)
  }, [runDiagnostics])

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
        scheduleDiagnosticsRefresh()
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
        scheduleDiagnosticsRefresh()
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
            diagnostics={diagnostics}
            diagnosticsError={diagnosticsError}
            diagnosticsLoading={diagnosticsLoading}
            isConnected={connection?.status === 'connected'}
            onRunDiagnostics={runDiagnostics}
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
