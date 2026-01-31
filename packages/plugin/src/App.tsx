import { useState, useEffect } from 'react'
import { getConnection, connect, ConnectionStatus } from './services/bridgeClient'

function App() {
  const [connection, setConnection] = useState<ConnectionStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    checkConnection()
  }, [])

  async function checkConnection() {
    try {
      const status = await getConnection()
      setConnection(status)
      setError(null)
    } catch {
      setError('Bridge not running')
    }
  }

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
      <h1>PS AI Diffusion</h1>

      {error && <p className="error">{error}</p>}

      <div className="status">
        <p>Status: {connection?.status ?? 'unknown'}</p>
        <p>Backend: {connection?.backend ?? '-'}</p>
      </div>

      <button onClick={handleConnect} disabled={loading}>
        {loading ? 'Connecting...' : 'Connect to ComfyUI'}
      </button>
    </div>
  )
}

export default App
