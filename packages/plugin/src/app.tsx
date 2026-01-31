import { useEffect, useState } from 'react'
import { GeneratePanel } from './panels/generate-panel'
import {
  type ConnectionStatus,
  connect,
  getConnection,
} from './services/bridge-client'

function App() {
  const [connection, setConnection] = useState<ConnectionStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      const status = await connect('local')
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
        <h1>AI Diffusion</h1>
        <span className={`status-dot ${connection?.status ?? 'unknown'}`} />
      </header>

      {error && <p className="error">{error}</p>}

      {!isConnected ? (
        <div className="connection-section">
          <p>Status: {connection?.status ?? 'unknown'}</p>
          <button type="button" onClick={handleConnect} disabled={loading}>
            {loading ? 'Connecting...' : 'Connect to ComfyUI'}
          </button>
        </div>
      ) : (
        <GeneratePanel isConnected={isConnected} />
      )}
    </div>
  )
}

export default App
