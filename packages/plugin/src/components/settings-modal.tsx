// packages/plugin/src/components/settings-modal.tsx
import { useEffect, useRef, useState } from 'react'
import { type Settings, getSettings, saveSettings } from '../services/settings'
import { testConnection } from '../services/bridge-client'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
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
      dialog.showModal()
    } else {
      dialog.close()
    }
  }, [isOpen])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    function handleClose() {
      onClose()
    }

    dialog.addEventListener('close', handleClose)
    return () => dialog.removeEventListener('close', handleClose)
  }, [onClose])

  async function handleSave() {
    setTesting(true)
    setTestResult(null)

    try {
      const result = await testConnection(
        settings.comfyUrl,
        settings.authToken || undefined,
      )
      if (result.status === 'connected') {
        setTestResult({ success: true, message: 'Connection successful' })
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

    saveSettings(settings)
  }

  function handleCancel() {
    setSettings(getSettings())
    setTestResult(null)
    dialogRef.current?.close()
  }

  return (
    <dialog
      ref={dialogRef}
      className="settings-dialog"
      aria-labelledby="settings-modal-title"
    >
      <h2 id="settings-modal-title" className="modal-title">Settings</h2>

      <div className="modal-body">
        <div className="form-field">
          <label htmlFor="comfy-url">ComfyUI Server</label>
          <input
            id="comfy-url"
            type="text"
            value={settings.comfyUrl}
            onChange={(e) =>
              setSettings({ ...settings, comfyUrl: e.target.value })
            }
            placeholder="http://localhost:8188"
          />
        </div>

        <div className="form-field">
          <label htmlFor="auth-token">Auth Token (optional)</label>
          <input
            id="auth-token"
            type="password"
            value={settings.authToken}
            onChange={(e) =>
              setSettings({ ...settings, authToken: e.target.value })
            }
            placeholder="Enter token if required"
          />
        </div>

        {testResult && (
          <div
            className={`test-result ${testResult.success ? 'success' : 'error'}`}
          >
            {testResult.success ? '✓' : '✗'} {testResult.message}
          </div>
        )}
      </div>

      <div className="modal-footer">
        <button
          type="button"
          className="btn-secondary"
          onClick={handleCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={handleSave}
          disabled={testing}
        >
          {testing ? 'Testing...' : 'Save'}
        </button>
      </div>
    </dialog>
  )
}
