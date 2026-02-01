import { useCallback, useMemo, useRef, useState } from 'react'
import { Button } from '@swc-react/button'
import { StyleSelector } from '../components/style-selector'
import { ProgressBar } from '../components/progress-bar'
import { useGeneration } from '../contexts/generation-context'
import { useHistory } from '../contexts/history-context'
import { runCustomWorkflow, getJobStatus, getJobImages, cancelJob } from '../services/bridge-client'
import { placeImageAsLayer, hasActiveDocument } from '../services/photoshop-layer'
import type { HistoryGroup, HistoryImage } from '../types'

interface CustomPanelProps {
  isConnected: boolean
  onOpenSettings?: () => void
  connectionStatus?: string
}

type StoredWorkflow = {
  id: string
  name: string
  workflow: Record<string, unknown>
}

const STORAGE_KEY = 'ps-ai-diffusion-custom-workflows'
const POLL_INTERVAL = 500

function loadWorkflows(): StoredWorkflow[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(Boolean)
  } catch {
    return []
  }
}

function saveWorkflows(items: StoredWorkflow[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

export function CustomPanel({ isConnected, onOpenSettings, connectionStatus }: CustomPanelProps) {
  const { isGenerating, setIsGenerating, setProgress } = useGeneration()
  const { addGenerationResult } = useHistory()

  const [workflows, setWorkflows] = useState<StoredWorkflow[]>(() => loadWorkflows())
  const [selectedId, setSelectedId] = useState<string>(() => workflows[0]?.id ?? '')
  const selected = useMemo(
    () => workflows.find(w => w.id === selectedId) ?? null,
    [workflows, selectedId],
  )

  const [name, setName] = useState<string>(() => selected?.name ?? 'My Workflow')
  const [text, setText] = useState<string>(() => JSON.stringify(selected?.workflow ?? {}, null, 2))
  const [applyAsLayer, setApplyAsLayer] = useState(true)
  const currentJobRef = useRef<string | null>(null)
  const cancelledRef = useRef(false)

  const handleSelect = (id: string) => {
    setSelectedId(id)
    const wf = workflows.find(w => w.id === id)
    setName(wf?.name ?? 'My Workflow')
    setText(JSON.stringify(wf?.workflow ?? {}, null, 2))
  }

  const handleNew = () => {
    setSelectedId('')
    setName('My Workflow')
    setText('{\n  \n}')
  }

  const handleSave = () => {
    try {
      const parsed = JSON.parse(text || '{}')
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        alert('Workflow JSON must be an object')
        return
      }

      const id = selectedId || crypto.randomUUID()
      const updated: StoredWorkflow = {
        id,
        name: (name || 'My Workflow').trim(),
        workflow: parsed,
      }

      const next = selectedId
        ? workflows.map(w => (w.id === id ? updated : w))
        : [updated, ...workflows]

      setWorkflows(next)
      saveWorkflows(next)
      setSelectedId(id)
      alert('Saved')
    } catch (e) {
      alert(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const handleDelete = () => {
    if (!selectedId) return
    if (!confirm('Delete this workflow?')) return
    const next = workflows.filter(w => w.id !== selectedId)
    setWorkflows(next)
    saveWorkflows(next)
    handleNew()
  }

  const handleRun = useCallback(async () => {
    // Cancel current run
    if (isGenerating && currentJobRef.current) {
      cancelledRef.current = true
      try {
        await cancelJob(currentJobRef.current)
      } catch {
        // ignore
      }
      setIsGenerating(false)
      setProgress(0)
      currentJobRef.current = null
      return
    }

    if (!hasActiveDocument()) {
      alert('Please open a document first')
      return
    }
    if (!isConnected) {
      alert('Please connect to the bridge first')
      return
    }

    let workflow: Record<string, unknown>
    try {
      const parsed = JSON.parse(text || '{}')
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        alert('Workflow JSON must be an object')
        return
      }
      workflow = parsed
    } catch (e) {
      alert(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`)
      return
    }

    setIsGenerating(true)
    setProgress(0, 'Submitting custom workflow...')
    cancelledRef.current = false

    try {
      const resp = await runCustomWorkflow(workflow)
      currentJobRef.current = resp.job_id

      let finished = false
      while (!finished && !cancelledRef.current) {
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL))
        if (cancelledRef.current) break

        const status = await getJobStatus(resp.job_id)
        switch (status.status) {
          case 'queued':
            setProgress(0, 'Queued...')
            break
          case 'executing':
            setProgress(status.progress, `Running... ${Math.round(status.progress * 100)}%`)
            break
          case 'finished':
            finished = true
            setProgress(1, 'Fetching images...')
            break
          case 'error':
            throw new Error(status.error || 'Custom workflow failed')
          case 'interrupted':
            finished = true
            break
        }
      }

      if (cancelledRef.current) return

      const imagesResponse = await getJobImages(resp.job_id)
      if (imagesResponse.images.length === 0) {
        throw new Error('No images returned')
      }

      const historyImages: HistoryImage[] = imagesResponse.images.map((img, i) => ({
        index: i,
        thumbnail: `data:image/png;base64,${img}`,
        applied: false,
        seed: imagesResponse.seeds[i] ?? 0,
      }))

      const group: HistoryGroup = {
        job_id: resp.job_id,
        timestamp: new Date().toISOString(),
        prompt: `[Custom] ${name || 'Workflow'}`,
        negative_prompt: '',
        strength: 100,
        style_id: '',
        images: historyImages,
      }
      addGenerationResult(group)

      if (applyAsLayer) {
        await placeImageAsLayer(imagesResponse.images[0], `[Custom] ${name || 'Workflow'}`)
      }

      setProgress(1, 'Done!')
    } catch (e) {
      console.error('Custom workflow failed:', e)
      alert(`Custom workflow failed: ${e instanceof Error ? e.message : String(e)}`)
      setProgress(0)
    } finally {
      currentJobRef.current = null
      setTimeout(() => {
        setIsGenerating(false)
        setProgress(0)
      }, 600)
    }
  }, [
    isGenerating,
    isConnected,
    text,
    name,
    applyAsLayer,
    setIsGenerating,
    setProgress,
    addGenerationResult,
  ])

  return (
    <div className="custom-panel">
      <StyleSelector
        onOpenSettings={onOpenSettings}
        connectionStatus={connectionStatus}
      />

      <div style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
          <sp-label style={{ width: 70 }}>Workflow</sp-label>
          <select
            className="text-input"
            value={selectedId}
            onChange={e => handleSelect(e.target.value)}
            style={{ flex: 1 }}
            disabled={isGenerating}
          >
            <option value="">(unsaved)</option>
            {workflows.map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
          <Button size="s" variant="secondary" onClick={handleNew} disabled={isGenerating}>
            New
          </Button>
          <Button size="s" variant="secondary" onClick={handleSave} disabled={isGenerating}>
            Save
          </Button>
          <Button size="s" variant="secondary" onClick={handleDelete} disabled={isGenerating || !selectedId}>
            Delete
          </Button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
          <sp-label style={{ width: 70 }}>Name</sp-label>
          <input
            type="text"
            className="text-input"
            value={name}
            onChange={e => setName(e.target.value)}
            disabled={isGenerating}
            style={{ flex: 1 }}
          />
        </div>

        <div style={{ marginBottom: 8 }}>
          <sp-label>Workflow JSON</sp-label>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            disabled={isGenerating}
            style={{
              width: '100%',
              minHeight: 220,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              fontSize: 11,
              background: '#1f1f1f',
              color: '#ddd',
              border: '1px solid #444',
              borderRadius: 4,
              padding: 8,
            }}
          />
        </div>

        <label className="inline-toggle" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={applyAsLayer}
            onChange={e => setApplyAsLayer(e.target.checked)}
            disabled={isGenerating}
          />
          <span>Apply first image as layer</span>
        </label>

        <Button
          size="m"
          variant={isGenerating ? 'secondary' : 'accent'}
          onClick={handleRun}
          disabled={!isConnected}
        >
          {isGenerating ? 'Cancel' : 'Run'}
        </Button>
      </div>

      <ProgressBar />
    </div>
  )
}
