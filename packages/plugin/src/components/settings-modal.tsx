import { useEffect, useRef, useState } from 'react'
import { Button } from '@swc-react/button'
import {
  type BackendType,
  type ConnectionMode,
  type Settings,
  getSettings,
  saveSettings,
} from '../services/settings'
import {
  type CloudUser,
  type DiagnosticsResponse,
  getConnection,
  getDiagnostics,
  setBridgeMode,
  testConnection,
  signIn,
  authConfirm,
  authValidate,
  connect,
} from '../services/bridge-client'
import { openBrowser } from '../utils/uxp'

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

type CloudAuthStatus = 'idle' | 'signing_in' | 'waiting' | 'connected' | 'error'

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const dialogRef = useRef<UXPDialog>(null)
  const [settings, setSettings] = useState<Settings>(getSettings)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    success: boolean
    message: string
  } | null>(null)
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResponse | null>(null)
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false)
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null)

  // Cloud auth state
  const [cloudAuthStatus, setCloudAuthStatus] = useState<CloudAuthStatus>('idle')
  const [cloudUser, setCloudUser] = useState<CloudUser | null>(null)
  const [cloudError, setCloudError] = useState<string | null>(null)
  const [cloudMeta, setCloudMeta] = useState<{
    webUrl?: string
    accountUrl?: string
    buyTokensUrl?: string
    newsText?: string
    featuresText?: string
  } | null>(null)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (isOpen) {
      // Load settings and check cloud auth status
      const currentSettings = getSettings()
      setSettings(currentSettings)

      if (currentSettings.backendType === 'cloud' && currentSettings.cloudAccessToken) {
        validateCloudToken(currentSettings.cloudAccessToken)
      }

      dialog.uxpShowModal({
        title: 'Settings',
        resize: 'none',
        size: { width: 600, height: 500 },
      }).then(() => {
        onClose()
      })
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
    }
  }, [isOpen, onClose])

  async function validateCloudToken(token: string) {
    try {
      // Apply bridge mode first
      setBridgeMode(
        settings.connectionMode === 'comfyui-extension' ? 'comfyui' : 'standalone',
        settings.comfyUrl,
      )

      const result = await authValidate(token)
      if (result.valid && result.user) {
        setCloudUser(result.user)
        setCloudAuthStatus('connected')
        await refreshCloudMeta()
      } else {
        setCloudAuthStatus('idle')
        setCloudError(result.error || 'Token invalid')
        setCloudMeta(null)
      }
    } catch (e) {
      setCloudAuthStatus('idle')
      setCloudError(String(e))
      setCloudMeta(null)
    }
  }

  async function refreshCloudMeta() {
    try {
      const conn = await getConnection()
      const features = conn.features
      setCloudMeta({
        webUrl: conn.web_url,
        accountUrl: conn.account_url,
        buyTokensUrl: conn.buy_tokens_url,
        newsText: conn.news?.text,
        featuresText: features
          ? `IP-Adapter: ${features.ip_adapter ? 'on' : 'off'}, Translation: ${features.translation ? 'on' : 'off'}`
          : undefined,
      })
      if (conn.user) {
        setCloudUser(conn.user)
      }
    } catch {
      // Meta is optional; ignore fetch errors.
    }
  }

  async function handleCloudSignIn() {
    setCloudAuthStatus('signing_in')
    setCloudError(null)

    // Apply bridge mode first
    setBridgeMode(
      settings.connectionMode === 'comfyui-extension' ? 'comfyui' : 'standalone',
      settings.comfyUrl,
    )

    try {
      const result = await signIn()
      // Open browser for user to complete sign-in
      openBrowser(result.sign_in_url)
      setCloudAuthStatus('waiting')

      // Start polling for confirmation
      pollIntervalRef.current = setInterval(async () => {
        try {
          const confirmResult = await authConfirm()
          if (confirmResult.status === 'authorized' && confirmResult.token && confirmResult.user) {
            // Success!
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current)
              pollIntervalRef.current = null
            }
            setCloudUser(confirmResult.user)
            setCloudAuthStatus('connected')
            setSettings(prev => ({
              ...prev,
              cloudAccessToken: confirmResult.token!,
            }))
            await refreshCloudMeta()
          } else if (confirmResult.status === 'timeout' || confirmResult.status === 'error') {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current)
              pollIntervalRef.current = null
            }
            setCloudAuthStatus('error')
            setCloudError(confirmResult.error || 'Sign-in failed')
          }
          // status === 'pending' means keep polling
        } catch (e) {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
          }
          setCloudAuthStatus('error')
          setCloudError(String(e))
        }
      }, 2000)
    } catch (e) {
      setCloudAuthStatus('error')
      setCloudError(String(e))
    }
  }

  function handleCloudSignOut() {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
    setCloudUser(null)
    setCloudAuthStatus('idle')
    setCloudError(null)
    setCloudMeta(null)
    setSettings(prev => ({
      ...prev,
      cloudAccessToken: '',
    }))
  }

  async function handleSave() {
    setTesting(true)
    setTestResult(null)

    // Apply the connection mode before testing
    setBridgeMode(
      settings.connectionMode === 'comfyui-extension' ? 'comfyui' : 'standalone',
      settings.comfyUrl,
    )

    try {
      if (settings.backendType === 'cloud') {
        // For cloud, check if we have a valid token
        if (!settings.cloudAccessToken || cloudAuthStatus !== 'connected') {
          setTestResult({
            success: false,
            message: 'Please sign in to cloud service first',
          })
          setTesting(false)
          return
        }
        // Connect to cloud backend
        await connect('cloud', undefined, settings.cloudAccessToken)
        await refreshCloudMeta()
        setTestResult({ success: true, message: 'Connected to cloud service' })
        saveSettings(settings)
        dialogRef.current?.close('saved')
      } else {
        // Local connection test
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
      }
    } catch (e) {
      setTestResult({ success: false, message: String(e) })
    } finally {
      setTesting(false)
    }
  }

  function handleCancel() {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
    setSettings(getSettings())
    setTestResult(null)
    setCloudError(null)
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
    setDiagnostics(null)
    setDiagnosticsError(null)
  }

  function handleBackendChange(backend: BackendType) {
    setSettings(prev => ({ ...prev, backendType: backend }))
    setTestResult(null)
    setDiagnostics(null)
    setDiagnosticsError(null)
  }

  const isCloudMode = settings.backendType === 'cloud'

  async function handleDiagnostics() {
    setDiagnosticsLoading(true)
    setDiagnosticsError(null)

    setBridgeMode(
      settings.connectionMode === 'comfyui-extension' ? 'comfyui' : 'standalone',
      settings.comfyUrl,
    )

    try {
      const result = await getDiagnostics()
      setDiagnostics(result)
    } catch (e) {
      setDiagnosticsError(String(e))
    } finally {
      setDiagnosticsLoading(false)
    }
  }

  function renderDiagnosticsList(items: string[], emptyLabel: string) {
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
  }

  return (
    <dialog ref={dialogRef} className="settings-dialog">
      <div className="dialog-scroll-container">
        {/* General Settings */}
        <div className="form-field" style={{ marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 10px 0', fontSize: 14 }}>General</h3>
          
          <div className="checkbox-field" style={{ marginBottom: 8 }}>
            <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={settings.showNegativePrompt}
                onChange={e => setSettings(prev => ({ ...prev, showNegativePrompt: e.target.checked }))}
              />
              <span>Show Negative Prompt</span>
            </label>
          </div>

          <div className="checkbox-field">
            <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={settings.confirmDiscardImage}
                onChange={e => setSettings(prev => ({ ...prev, confirmDiscardImage: e.target.checked }))}
              />
              <span>Confirm Discard Image</span>
            </label>
          </div>
        </div>

        <div className="form-field" style={{ marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 10px 0', fontSize: 14 }}>Connection</h3>
          <label>Backend</label>
          <div className="backend-tabs">
            <button
              className={`backend-tab ${!isCloudMode ? 'active' : ''}`}
              onClick={() => handleBackendChange('local')}
            >
              <span className="tab-label">Local</span>
              <span className={`tab-status ${!isCloudMode && testResult?.success ? 'connected' : ''}`}>
                {!isCloudMode && testResult?.success ? 'Connected' : 'Not connected'}
              </span>
            </button>
            <button
              className={`backend-tab ${isCloudMode ? 'active' : ''}`}
              onClick={() => handleBackendChange('cloud')}
            >
              <span className="tab-label">Cloud Service</span>
              <span className={`tab-status ${cloudAuthStatus === 'connected' ? 'connected' : ''}`}>
                {cloudAuthStatus === 'connected' ? 'Connected' : 'Not connected'}
              </span>
            </button>
          </div>
        </div>

        {/* Cloud Service Panel */}
        {isCloudMode && (
          <div className="cloud-panel">
            {cloudAuthStatus === 'connected' && cloudUser ? (
              <div className="cloud-user-info">
                <div className="user-field">
                  <span className="field-label">Account:</span>
                  <span className="field-value">{cloudUser.name}</span>
                </div>
                <div className="user-field">
                  <span className="field-label">Total generated:</span>
                  <span className="field-value">{cloudUser.images_generated.toLocaleString()}</span>
                </div>
                <div className="user-field">
                  <span className="field-label">Tokens remaining:</span>
                  <span className="field-value credits">{cloudUser.credits.toLocaleString()}</span>
                </div>
                <div className="cloud-actions">
                  <Button
                    size="s"
                    variant="secondary"
                  onClick={() => openBrowser(cloudMeta?.accountUrl || 'https://www.interstice.cloud/user')}
                  >
                    View Account
                  </Button>
                  <Button
                    size="s"
                    variant="secondary"
                  onClick={() =>
                    openBrowser(cloudMeta?.buyTokensUrl || 'https://www.interstice.cloud/checkout/tokens5000')
                  }
                  >
                    Buy Tokens
                  </Button>
                  <Button size="s" variant="secondary" onClick={handleCloudSignOut}>
                    Sign Out
                  </Button>
                </div>
              {cloudMeta?.featuresText && (
                <div className="user-field">
                  <span className="field-label">Features:</span>
                  <span className="field-value">{cloudMeta.featuresText}</span>
                </div>
              )}
              {cloudMeta?.newsText && (
                <div className="user-field">
                  <span className="field-label">News:</span>
                  <span className="field-value">{cloudMeta.newsText}</span>
                </div>
              )}
              </div>
            ) : (
              <div className="cloud-sign-in">
                <p className="cloud-description">
                  Generate images via interstice.cloud.
                  No local installation or powerful hardware needed.
                </p>
                {cloudError && (
                  <sp-body size="S" className="test-result error">
                    {cloudError}
                  </sp-body>
                )}
                {cloudAuthStatus === 'waiting' ? (
                  <div className="waiting-message">
                    <sp-body size="S">Waiting for sign-in to complete...</sp-body>
                    <sp-body size="XS">Complete the sign-in in your browser, then return here.</sp-body>
                  </div>
                ) : (
                  <Button
                    size="s"
                    variant="cta"
                    onClick={handleCloudSignIn}
                    disabled={cloudAuthStatus === 'signing_in'}
                  >
                    {cloudAuthStatus === 'signing_in' ? 'Starting...' : 'Sign In'}
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Local Settings Panel */}
        {!isCloudMode && (
          <>
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

            <div className="form-field diagnostics-field">
              <label>Diagnostics</label>
              <div className="diagnostics-actions">
                <Button
                  size="s"
                  variant="secondary"
                  onClick={handleDiagnostics}
                  disabled={diagnosticsLoading}
                >
                  {diagnosticsLoading ? 'Running...' : 'Run Diagnostics'}
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
          </>
        )}

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
