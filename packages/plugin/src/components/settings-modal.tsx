import { useEffect, useRef, useState } from 'react'
import { Button } from '@swc-react/button'
import { type Settings, getSettings, saveSettings } from '../services/settings'
import { testConnection } from '../services/bridge-client'

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

    try {
      const result = await testConnection(
        settings.comfyUrl,
        settings.authToken || undefined,
      )
      if (result.status === 'connected') {
        setTestResult({ success: true, message: 'Connection successful' })
        saveSettings(settings)
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

  return (
    <dialog ref={dialogRef} className="settings-dialog">
      <div className="dialog-scroll-container">
        <div className="form-field">
          <label htmlFor="comfy-url">ComfyUI Server</label>
          <input
            id="comfy-url"
            type="text"
            className="text-input"
            value={settings.comfyUrl}
            placeholder="http://localhost:8188"
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
