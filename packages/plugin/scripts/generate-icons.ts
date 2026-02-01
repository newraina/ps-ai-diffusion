/**
 * Script to generate TypeScript icon module from shared SVG icons.
 * Cleans up Inkscape metadata and generates optimized SVG strings.
 *
 * Usage: npx tsx scripts/generate-icons.ts
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SHARED_ICONS_DIR = path.resolve(__dirname, '../../shared/icons')
const OUTPUT_FILE = path.resolve(__dirname, '../src/icons/icons.ts')

// Icons to include (only dark theme, we'll handle theme switching separately)
const ICONS_TO_INCLUDE = [
  // Generate/Refine
  'generate',
  'refine',
  'cancel',
  // Workspace
  'workspace-generation',
  'workspace-upscaling',
  'workspace-live',
  'workspace-animation',
  'workspace-custom',
  // Queue
  'queue-active',
  'queue-inactive',
  'queue-waiting',
  // Other
  'settings',
]

function normalizeViewBox(svgContent: string): string {
  // Extract viewBox values
  const viewBoxMatch = svgContent.match(/viewBox="([^"]*)"/)
  if (!viewBoxMatch) return svgContent

  const [minX, minY, width, height] = viewBoxMatch[1].split(/\s+/).map(Number)
  if (Number.isNaN(width) || Number.isNaN(height)) return svgContent

  // If already square (within tolerance), no change needed
  if (Math.abs(width - height) < 0.1) return svgContent

  // Make viewBox square by using the larger dimension and centering
  const maxDim = Math.max(width, height)
  const newMinX = minX - (maxDim - width) / 2
  const newMinY = minY - (maxDim - height) / 2
  const newViewBox = `${newMinX} ${newMinY} ${maxDim} ${maxDim}`

  return svgContent.replace(/viewBox="[^"]*"/, `viewBox="${newViewBox}"`)
}

function cleanSvg(svgContent: string): string {
  // Remove XML declaration
  let cleaned = svgContent.replace(/<\?xml[^?]*\?>\s*/g, '')

  // Remove sodipodi:namedview element
  cleaned = cleaned.replace(/<sodipodi:namedview[\s\S]*?\/>/g, '')

  // Remove metadata element
  cleaned = cleaned.replace(/<metadata[\s\S]*?<\/metadata>/g, '')

  // Remove empty defs
  cleaned = cleaned.replace(/<defs[^>]*>\s*<\/defs>/g, '')
  cleaned = cleaned.replace(/<defs[^>]*\/>/g, '')

  // Remove inkscape/sodipodi namespaces from svg tag
  cleaned = cleaned.replace(/\s*xmlns:(inkscape|sodipodi|dc|cc|rdf)="[^"]*"/g, '')

  // Remove inkscape/sodipodi attributes
  cleaned = cleaned.replace(/\s*(inkscape|sodipodi):[a-zA-Z-]+="[^"]*"/g, '')

  // Remove version and id attributes from svg
  cleaned = cleaned.replace(/\s*version="[^"]*"/g, '')
  cleaned = cleaned.replace(/\s*id="svg\d*"/g, '')

  // Remove id attributes from elements (optional, keeps SVG cleaner)
  cleaned = cleaned.replace(/\s*id="[^"]*"/g, '')

  // Remove enable-background attribute
  cleaned = cleaned.replace(/\s*enable-background="[^"]*"/g, '')

  // Normalize viewBox to be square
  cleaned = normalizeViewBox(cleaned)

  // Normalize whitespace
  cleaned = cleaned.replace(/\s+/g, ' ')
  cleaned = cleaned.replace(/>\s+</g, '><')
  cleaned = cleaned.trim()

  // Make SVG responsive by using 100% width/height and preserving viewBox
  cleaned = cleaned.replace(/width="[\d.]+(?:px)?"/g, 'width="100%"')
  cleaned = cleaned.replace(/height="[\d.]+(?:px)?"/g, 'height="100%"')

  return cleaned
}

function camelCase(str: string): string {
  return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
}

function generateIconModule(): void {
  const icons: Record<string, { dark: string; light: string }> = {}

  for (const iconName of ICONS_TO_INCLUDE) {
    const darkPath = path.join(SHARED_ICONS_DIR, `${iconName}-dark.svg`)
    const lightPath = path.join(SHARED_ICONS_DIR, `${iconName}-light.svg`)

    if (!fs.existsSync(darkPath)) {
      console.warn(`Warning: ${iconName}-dark.svg not found, skipping`)
      continue
    }

    const darkSvg = cleanSvg(fs.readFileSync(darkPath, 'utf-8'))
    const lightSvg = fs.existsSync(lightPath)
      ? cleanSvg(fs.readFileSync(lightPath, 'utf-8'))
      : darkSvg

    icons[iconName] = { dark: darkSvg, light: lightSvg }
  }

  // Generate TypeScript module
  const iconEntries = Object.entries(icons)
    .map(([name, { dark, light }]) => {
      const varName = camelCase(name)
      return `  '${name}': {
    dark: \`${dark}\`,
    light: \`${light}\`,
  }`
    })
    .join(',\n')

  const output = `/**
 * Auto-generated icon module from shared/icons
 * DO NOT EDIT - Run 'pnpm run generate-icons' to regenerate
 */

export type IconName =
${ICONS_TO_INCLUDE.map(n => `  | '${n}'`).join('\n')}

export type Theme = 'dark' | 'light'

export const icons: Record<IconName, { dark: string; light: string }> = {
${iconEntries}
}

export function getIcon(name: IconName, theme: Theme = 'dark'): string {
  return icons[name]?.[theme] ?? icons[name]?.dark ?? ''
}
`

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true })
  fs.writeFileSync(OUTPUT_FILE, output, 'utf-8')
  console.log(`Generated ${OUTPUT_FILE} with ${Object.keys(icons).length} icons`)
}

generateIconModule()
