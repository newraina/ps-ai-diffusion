import { useRef, useCallback } from 'react'

interface ResizeHandleProps {
  onResize: (deltaY: number) => void
}

export function ResizeHandle({ onResize }: ResizeHandleProps) {
  const isDragging = useRef(false)
  const lastY = useRef(0)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true
    lastY.current = e.clientY
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current) return
    const deltaY = e.clientY - lastY.current
    lastY.current = e.clientY
    onResize(deltaY)
  }, [onResize])

  const handleMouseUp = useCallback(() => {
    isDragging.current = false
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  }, [handleMouseMove])

  return (
    <div className="resize-handle" onMouseDown={handleMouseDown}>
      <span className="resize-dots">•••</span>
    </div>
  )
}
