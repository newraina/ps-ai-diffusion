import { useEffect, useRef, useState } from 'react'
import { Button } from '@swc-react/button'
import { Textfield } from '@swc-react/textfield'
import { FieldLabel } from '@swc-react/field-label'
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
        <sp-body size="S" className="form-field">
          <FieldLabel size="s" for="comfy-url">ComfyUI Server</FieldLabel>
          <Textfield
            id="comfy-url"
            value={settings.comfyUrl}
            placeholder="http://localhost:8188"
            style={{ width: '100%' }}
            onInput={(e) =>
              setSettings((prev) => ({
                ...prev,
                comfyUrl: (e.target as HTMLInputElement).value,
              }))
            }
          />
        </sp-body>

        <sp-body size="S" className="form-field">
          <FieldLabel size="s" for="auth-token">Auth Token (optional)</FieldLabel>
          <Textfield
            id="auth-token"
            type="password"
            value={settings.authToken}
            placeholder="Enter token if required"
            style={{ width: '100%' }}
            onInput={(e) =>
              setSettings((prev) => ({
                ...prev,
                authToken: (e.target as HTMLInputElement).value,
              }))
            }
          />
        </sp-body>

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
