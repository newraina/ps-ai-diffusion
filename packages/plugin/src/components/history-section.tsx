import { useState, useCallback } from 'react'
import { HistoryGroup } from './history-group'
import { useHistory } from '../contexts/history-context'
import { useGeneration } from '../contexts/generation-context'
import { useStyles } from '../contexts/styles-context'
import { getSettings } from '../services/settings'

interface ContextMenuState {
  visible: boolean
  x: number
  y: number
  jobId: string
  index: number
}

export function HistorySection() {
  const { groups, discardImage, clearHistory } = useHistory()
  const { setPrompt, setSeed, setFixedSeed, setStyle } = useGeneration()
  const { styles } = useStyles()
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    jobId: '',
    index: 0,
  })

  const handleContextMenu = useCallback((jobId: string, index: number, e: React.MouseEvent) => {
    e.preventDefault()
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      jobId,
      index,
    })
  }, [])

  const closeContextMenu = useCallback(() => {
    setContextMenu(prev => ({ ...prev, visible: false }))
  }, [])

  const handleUsePrompt = useCallback(() => {
    const group = groups.find(g => g.job_id === contextMenu.jobId)
    if (group) {
      setPrompt(group.prompt)
    }
    closeContextMenu()
  }, [groups, contextMenu.jobId, setPrompt, closeContextMenu])

  const handleUseSeed = useCallback(() => {
    const group = groups.find(g => g.job_id === contextMenu.jobId)
    if (group) {
      const image = group.images[contextMenu.index]
      setSeed(image.seed)
      setFixedSeed(true)
    }
    closeContextMenu()
  }, [groups, contextMenu, setSeed, setFixedSeed, closeContextMenu])

  const handleUseStyle = useCallback(() => {
    const group = groups.find(g => g.job_id === contextMenu.jobId)
    if (group && group.style_id) {
      const style = styles.find(s => s.id === group.style_id)
      if (style) {
        setStyle(style)
      }
    }
    closeContextMenu()
  }, [groups, contextMenu.jobId, styles, setStyle, closeContextMenu])

  const handleCopyPrompt = useCallback(() => {
    const group = groups.find(g => g.job_id === contextMenu.jobId)
    if (group) {
      navigator.clipboard?.writeText(group.prompt)
    }
    closeContextMenu()
  }, [groups, contextMenu.jobId, closeContextMenu])

  const handleCopySeed = useCallback(() => {
    const group = groups.find(g => g.job_id === contextMenu.jobId)
    if (group) {
      const image = group.images[contextMenu.index]
      navigator.clipboard?.writeText(String(image.seed))
    }
    closeContextMenu()
  }, [groups, contextMenu, closeContextMenu])

  const handleDiscard = useCallback(() => {
    const settings = getSettings()
    if (settings.confirmDiscardImage) {
      if (!confirm('Discard this image?')) {
        closeContextMenu()
        return
      }
    }
    discardImage(contextMenu.jobId, contextMenu.index)
    closeContextMenu()
  }, [discardImage, contextMenu, closeContextMenu])

  const handleClearAll = useCallback(() => {
    if (confirm('Are you sure you want to clear all history?')) {
      clearHistory()
    }
    closeContextMenu()
  }, [clearHistory, closeContextMenu])

  if (groups.length === 0) {
    return null
  }

  return (
    <div className="history-section" onClick={closeContextMenu}>
      {groups.map(group => (
        <HistoryGroup
          key={group.job_id}
          group={group}
          onContextMenu={handleContextMenu}
        />
      ))}

      {contextMenu.visible && (
        <div
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          <div className="context-menu-item" onClick={handleUsePrompt}>
            Use Prompt
          </div>
          <div className="context-menu-item" onClick={handleUseSeed}>
            Use Seed
          </div>
          <div className="context-menu-item" onClick={handleUseStyle}>
            Use Style
          </div>
          <div className="context-menu-divider" />
          <div className="context-menu-item" onClick={handleCopyPrompt}>
            Copy Prompt
          </div>
          <div className="context-menu-item" onClick={handleCopySeed}>
            Copy Seed
          </div>
          <div className="context-menu-divider" />
          <div className="context-menu-item" onClick={handleDiscard}>
            Discard Image
          </div>
          <div className="context-menu-divider" />
          <div className="context-menu-item danger" onClick={handleClearAll}>
            Clear History
          </div>
        </div>
      )}
    </div>
  )
}
