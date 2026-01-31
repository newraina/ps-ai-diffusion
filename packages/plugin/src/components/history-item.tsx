// @ts-ignore - ActionButton reserved for future use
import { ActionButton } from '@swc-react/action-button'

interface HistoryItemProps {
  thumbnail: string
  selected: boolean
  applied: boolean
  onSelect: () => void
  onApply: () => void
  onContextMenu: (e: React.MouseEvent) => void
}

export function HistoryItem({
  thumbnail,
  selected,
  applied,
  onSelect,
  onApply,
  onContextMenu,
}: HistoryItemProps) {
  const handleDoubleClick = () => {
    onApply()
  }

  return (
    <div
      className={`history-item ${selected ? 'selected' : ''}`}
      onClick={onSelect}
      onDoubleClick={handleDoubleClick}
      onContextMenu={onContextMenu}
    >
      <img src={thumbnail} alt="Generated" />

      {applied && (
        <div className="star-badge">★</div>
      )}

      {selected && (
        <div className="history-item-overlay">
          <button className="apply-button" onClick={(e) => { e.stopPropagation(); onApply(); }}>
            ✓ Apply
          </button>
          <button className="menu-button" onClick={(e) => { e.stopPropagation(); onContextMenu(e); }}>
            •••
          </button>
        </div>
      )}
    </div>
  )
}
