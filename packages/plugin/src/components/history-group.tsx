import { HistoryItem } from './history-item'
import { useHistory } from '../contexts/history-context'
import type { HistoryGroup as HistoryGroupType } from '../types'

interface HistoryGroupProps {
  group: HistoryGroupType
  onContextMenu: (jobId: string, index: number, e: React.MouseEvent) => void
}

export function HistoryGroup({ group, onContextMenu }: HistoryGroupProps) {
  const { selectedId, selectImage, applyImage } = useHistory()

  // Truncate prompt for header
  const headerPrompt = group.prompt.length > 40
    ? group.prompt.slice(0, 40) + '...'
    : group.prompt

  return (
    <div className="history-group">
      <div className="history-group-header">
        <span className="history-timestamp">{group.timestamp}</span>
        <span className="history-prompt-preview"> - {headerPrompt}</span>
      </div>
      <div className="history-grid">
        {group.images.map((image, index) => (
          <HistoryItem
            key={`${group.job_id}-${index}`}
            thumbnail={image.thumbnail}
            selected={selectedId === `${group.job_id}-${index}`}
            applied={image.applied}
            onSelect={() => selectImage(group.job_id, index)}
            onApply={() => applyImage(group.job_id, index)}
            onContextMenu={(e) => onContextMenu(group.job_id, index, e)}
          />
        ))}
      </div>
    </div>
  )
}
