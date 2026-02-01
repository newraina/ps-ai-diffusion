import { useEffect } from 'react'
import { ActionButton } from '@swc-react/action-button'
import { useGeneration } from '../contexts/generation-context'
import { useStyles } from '../contexts/styles-context'
import { workspaceLabels } from '../services/mock-data'
import { getArchPrefix } from '../types'
import type { Workspace } from '../types'

const workspaceIcons: Record<Workspace, string> = {
  generation: '✦',
  upscaling: '⤢',
  live: '◉',
  animation: '▶',
  custom: '⚙',
}

interface StyleSelectorProps {
  onOpenSettings?: () => void
  connectionStatus?: string
}

export function StyleSelector({ onOpenSettings, connectionStatus }: StyleSelectorProps) {
  const { workspace, setWorkspace, style, setStyle } = useGeneration()
  const { styles, isLoading } = useStyles()

  // Auto-select first style when styles load
  useEffect(() => {
    if (!style && styles.length > 0) {
      setStyle(styles[0])
    }
  }, [styles, style, setStyle])

  const handleStyleChange = (e: Event) => {
    const target = e.target as HTMLSelectElement
    const selected = styles.find(s => s.id === target.value)
    if (selected) {
      setStyle(selected)
    }
  }

  const handleWorkspaceChange = (ws: Workspace) => {
    setWorkspace(ws)
  }

  return (
    <div className="style-selector">
      <div className="workspace-dropdown">
        <ActionButton size="s" quiet className="workspace-button">
          <span className="workspace-icon">{workspaceIcons[workspace]}</span>
          <span className="dropdown-arrow">▾</span>
        </ActionButton>
        <div className="workspace-menu">
          {(Object.keys(workspaceLabels) as Workspace[]).map(ws => (
            <div
              key={ws}
              className={`workspace-menu-item ${ws === workspace ? 'selected' : ''}`}
              onClick={() => handleWorkspaceChange(ws)}
            >
              <span className="workspace-icon">{workspaceIcons[ws]}</span>
              <span>{workspaceLabels[ws]}</span>
            </div>
          ))}
        </div>
      </div>

      <select
        className="style-dropdown"
        value={style?.id || ''}
        onChange={handleStyleChange as any}
        disabled={isLoading}
      >
        {isLoading ? (
          <option>Loading...</option>
        ) : (
          styles.map(s => {
            const prefix = getArchPrefix(s.architecture)
            return (
              <option key={s.id} value={s.id}>
                {prefix ? `${prefix} ` : ''}{s.name}
              </option>
            )
          })
        )}
      </select>

      <ActionButton
        size="s"
        quiet
        className="settings-button"
        title="Settings"
        onClick={onOpenSettings}
      >
        ⚙
      </ActionButton>
      <span className={`status-dot ${connectionStatus ?? 'unknown'}`} />
    </div>
  )
}
