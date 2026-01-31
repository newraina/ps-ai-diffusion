import { ActionButton } from '@swc-react/action-button'
// TODO: Add Picker and MenuItem imports when @swc-react/picker and @swc-react/menu are installed
import { useGeneration } from '../contexts/generation-context'
import { mockStyles, workspaceLabels } from '../services/mock-data'
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

  const handleStyleChange = (e: Event) => {
    const target = e.target as HTMLSelectElement
    const selected = mockStyles.find(s => s.id === target.value)
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
      >
        {mockStyles.map(s => (
          <option key={s.id} value={s.id}>
            {s.arch === 'sdxl' ? 'XL' : s.arch === 'flux' ? 'F' : 'SD'} {s.name}
          </option>
        ))}
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
