import { useState } from 'react'

function App() {
  const [status, setStatus] = useState('disconnected')

  return (
    <div className="app">
      <h1>PS AI Diffusion</h1>
      <p>Status: {status}</p>
      <button onClick={() => setStatus('connecting...')}>
        Connect
      </button>
    </div>
  )
}

export default App
