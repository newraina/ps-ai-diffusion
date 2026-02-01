import { useEffect, useRef, useState } from 'react'
import { Button } from '@swc-react/button'
import {
  type ConnectionMode,
  type Settings,
  getSettings,
  saveSettings,
} from '../services/settings'
import { setBridgeMode, testConnection } from '../services/bridge-client'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

interface UXPDialog extends HTMLDialogElement {
  uxpShowModal(options?: {
    title?: string
    resize?: 'none' | 'horizontal' | 'vertical' | 'both'
    size?: { width?: number; height?: number }
  }): Promise<string>
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const dialogRef = useRef<UXPDialog>(null)
  const [settings, setSettings] = useState<Settings>(getSettings)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    success: boolean
    message: string
  } | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (isOpen) {
      dialog.uxpShowModal({
        title: 'Settings',
        resize: 'none',
        size: { width: 600, height: 400 },
      }).then(() => {
        onClose()
      })
    }
  }, [isOpen, onClose])

  async function handleSave() {
    setTesting(true)
    setTestResult(null)

    // Apply the connection mode before testing
    setBridgeMode(
      settings.connectionMode === 'comfyui-extension' ? 'comfyui' : 'standalone',
      settings.comfyUrl,
    )

    try {
      const result = await testConnection()
      if (result.reachable) {
        setTestResult({ success: true, message: 'Connection successful' })
        saveSettings(settings)
        dialogRef.current?.close('saved')
      } else {
        setTestResult({
          success: false,
          message: result.error || 'Connection failed',
        })
      }
    } catch {
      setTestResult({ success: false, message: 'Failed to test connection' })
    } finally {
      setTesting(false)
    }
  }

  function handleCancel() {
    setSettings(getSettings())
    setTestResult(null)
    dialogRef.current?.close('cancel')
  }

  function handleModeChange(mode: ConnectionMode) {
    const newSettings = { ...settings, connectionMode: mode }
    // Update default URL based on mode
    if (mode === 'comfyui-extension' && settings.comfyUrl === 'http://localhost:7860') {
      newSettings.comfyUrl = 'http://localhost:8188'
    } else if (mode === 'standalone-bridge' && settings.comfyUrl === 'http://localhost:8188') {
      newSettings.comfyUrl = 'http://localhost:7860'
    }
    setSettings(newSettings)
  }

  return (
    <dialog ref={dialogRef} className="settings-dialog">
      <div className="dialog-scroll-container">
        <div className="form-field">
          <label>Connection Mode</label>
          <div className="radio-group">
            <label className="radio-label">
              <input
                type="radio"
                name="connection-mode"
                checked={settings.connectionMode === 'comfyui-extension'}
                onChange={() => handleModeChange('comfyui-extension')}
              />
              <span>ComfyUI Extension</span>
              <span className="radio-hint">Requires bridge installed in ComfyUI custom_nodes</span>
            </label>
            <label className="radio-label">
              <input
                type="radio"
                name="connection-mode"
                checked={settings.connectionMode === 'standalone-bridge'}
                onChange={() => handleModeChange('standalone-bridge')}
              />
              <span>Standalone Bridge</span>
              <span className="radio-hint">Run bridge separately with python run.py</span>
            </label>
          </div>
        </div>

        <div className="form-field">
          <label htmlFor="comfy-url">
            {settings.connectionMode === 'comfyui-extension' ? 'ComfyUI Server' : 'Bridge Server'}
          </label>
          <input
            id="comfy-url"
            type="text"
            className="text-input"
            value={settings.comfyUrl}
            placeholder={settings.connectionMode === 'comfyui-extension' ? 'http://localhost:8188' : 'http://localhost:7860'}
            onChange={(e) =>
              setSettings((prev) => ({
                ...prev,
                comfyUrl: e.target.value,
              }))
            }
          />
        </div>

        <div className="form-field">
          <label htmlFor="auth-token">Auth Token (optional)</label>
          <input
            id="auth-token"
            type="password"
            className="text-input"
            value={settings.authToken}
            placeholder="Enter token if required"
            onChange={(e) =>
              setSettings((prev) => ({
                ...prev,
                authToken: e.target.value,
              }))
            }
          />
        </div>

        {testResult && (
          <sp-body
            size="S"
            className={`test-result ${testResult.success ? 'success' : 'error'}`}
          >
            {testResult.success ? '✓' : '✗'} {testResult.message}
          </sp-body>
        )}
      </div>

      <div className="modal-footer">
        <Button size="s" variant="secondary" onClick={handleCancel}>
          Cancel
        </Button>
        <Button size="s" variant="cta" onClick={handleSave} disabled={testing}>
          {testing ? 'Testing...' : 'Save'}
        </Button>
      </div>
    </dialog>
  )
}
