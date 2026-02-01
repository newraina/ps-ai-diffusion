import { getIcon, type IconName, type Theme } from './icons'

export interface IconProps {
  name: IconName
  size?: number | string
  theme?: Theme
  className?: string
  style?: React.CSSProperties
}

/**
 * Icon component that renders SVG icons from shared/icons.
 * Uses dangerouslySetInnerHTML to render raw SVG strings.
 */
export function Icon({ name, size = 16, theme = 'dark', className = '', style = {} }: IconProps) {
  const svg = getIcon(name, theme)

  if (!svg) {
    return null
  }

  const sizeValue = typeof size === 'number' ? `${size}px` : size

  return (
    <span
      className={`icon ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: sizeValue,
        height: sizeValue,
        flexShrink: 0,
        verticalAlign: 'middle',
        ...style,
      }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

export { type IconName, type Theme } from './icons'
