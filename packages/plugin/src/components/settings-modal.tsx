// packages/plugin/src/components/settings-modal.tsx
import { useEffect, useRef, useState } from 'react'
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
  const comfyUrlRef = useRef<HTMLInputElement>(null)
  const authTokenRef = useRef<HTMLInputElement>(null)
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

  // Sync sp-textfield values via refs (web components don't work well with React controlled inputs)
  useEffect(() => {
    if (comfyUrlRef.current) {
      comfyUrlRef.current.value = settings.comfyUrl
    }
    if (authTokenRef.current) {
      authTokenRef.current.value = settings.authToken
    }
  }, [settings])

  // Attach event listeners for sp-textfield inputs
  useEffect(() => {
    const comfyUrl = comfyUrlRef.current
    const authToken = authTokenRef.current

    function handleComfyUrlChange(e: Event) {
      const target = e.target as HTMLInputElement
      setSettings((prev) => ({ ...prev, comfyUrl: target.value }))
    }

    function handleAuthTokenChange(e: Event) {
      const target = e.target as HTMLInputElement
      setSettings((prev) => ({ ...prev, authToken: target.value }))
    }

    comfyUrl?.addEventListener('input', handleComfyUrlChange)
    authToken?.addEventListener('input', handleAuthTokenChange)

    return () => {
      comfyUrl?.removeEventListener('input', handleComfyUrlChange)
      authToken?.removeEventListener('input', handleAuthTokenChange)
    }
  }, [])

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
          <sp-textfield
            ref={comfyUrlRef}
            placeholder="http://localhost:8188"
            style={{ width: '100%' }}
          >
            <sp-label slot="label">ComfyUI Server</sp-label>
          </sp-textfield>
        </sp-body>

        <sp-body size="S" className="form-field">
          <sp-textfield
            ref={authTokenRef}
            type="password"
            placeholder="Enter token if required"
            style={{ width: '100%' }}
          >
            <sp-label slot="label">Auth Token (optional)</sp-label>
          </sp-textfield>
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
        <sp-button variant="secondary" onClick={handleCancel}>
          Cancel
        </sp-button>
        <sp-button variant="cta" onClick={handleSave} disabled={testing || undefined}>
          {testing ? 'Testing...' : 'Save'}
        </sp-button>
      </div>
    </dialog>
  )
}
