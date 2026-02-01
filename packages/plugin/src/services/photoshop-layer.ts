/**
 * Photoshop layer operations for UXP plugin.
 *
 * Uses the Photoshop UXP API to create layers and place generated images.
 */

// UXP types
declare const require: (module: string) => unknown

interface PhotoshopAction {
  batchPlay: (
    commands: unknown[],
    options?: { synchronousExecution?: boolean },
  ) => Promise<unknown[]>
}

interface PhotoshopApp {
  activeDocument: PhotoshopDocument | null
  documents: PhotoshopDocument[]
  open: (entry: File) => Promise<PhotoshopDocument>
}

interface PhotoshopDocument {
  id: number
  name: string
  width: number
  height: number
  layers: PhotoshopLayer[]
  activeLayers: PhotoshopLayer[]
  createLayer: (options?: { name?: string }) => PhotoshopLayer
}

interface PhotoshopLayer {
  id: number
  name: string
  kind: string
  visible: boolean
}

interface UXPStorage {
  localFileSystem: {
    getTemporaryFolder: () => Promise<Folder>
    createSessionToken: (entry: File) => string
  }
  formats: {
    binary: unknown
  }
}

interface Folder {
  createFile: (
    name: string,
    options?: { overwrite?: boolean },
  ) => Promise<File>
}

interface File {
  nativePath: string
  write: (data: ArrayBuffer, options?: { format?: unknown }) => Promise<void>
  read: (options?: { format?: unknown }) => Promise<ArrayBuffer | string>
}

interface PhotoshopCore {
  executeAsModal: <T>(
    fn: (context: ExecutionContext) => Promise<T>,
    options?: { commandName?: string },
  ) => Promise<T>
}

interface ExecutionContext {
  hostControl: {
    suspendHistory: (options: {
      documentID: number
      name: string
    }) => Promise<void>
    resumeHistory: (state: unknown) => void
  }
}

// Get modules
const photoshop = require('photoshop') as {
  app: PhotoshopApp
  action: PhotoshopAction
  core: PhotoshopCore
}
const uxp = require('uxp') as { storage: UXPStorage }

const { app, action, core } = photoshop
const { storage } = uxp

/**
 * Convert base64 PNG to ArrayBuffer.
 * Handles both raw base64 and data URL format (data:image/png;base64,...).
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  // Strip data URL prefix if present
  const base64Data = base64.includes(',') ? base64.split(',')[1] : base64
  const binaryString = atob(base64Data)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes.buffer
}

/**
 * Place a base64 PNG image as a new layer in the active document.
 */
export async function placeImageAsLayer(
  imageBase64: string,
  layerName = 'AI Generated',
): Promise<boolean> {
  const doc = app.activeDocument

  if (!doc) {
    console.error('No active document')
    return false
  }

  try {
    // Get temporary folder
    const tempFolder = await storage.localFileSystem.getTemporaryFolder()

    // Create temporary file with unique name
    const fileName = `ai_gen_${Date.now()}.png`
    const tempFile = await tempFolder.createFile(fileName, { overwrite: true })

    // Write image data to file
    const imageData = base64ToArrayBuffer(imageBase64)
    await tempFile.write(imageData, { format: storage.formats.binary })

    // Create a session token for the file - this is required for UXP file operations
    const fileToken = storage.localFileSystem.createSessionToken(tempFile)

    // Place the image using executeAsModal for proper Photoshop state management
    await core.executeAsModal(
      async () => {
        // Place the image as a new layer using batchPlay
        await action.batchPlay(
          [
            {
              _obj: 'placeEvent',
              null: {
                _path: fileToken,
                _kind: 'local',
              },
              freeTransformCenterState: {
                _enum: 'quadCenterState',
                _value: 'QCSAverage',
              },
              offset: {
                _obj: 'offset',
                horizontal: {
                  _unit: 'pixelsUnit',
                  _value: 0,
                },
                vertical: {
                  _unit: 'pixelsUnit',
                  _value: 0,
                },
              },
              _options: {
                dialogOptions: 'dontDisplay',
              },
            },
          ],
          { synchronousExecution: false },
        )

        // Rename the placed layer
        const activeLayer = doc.activeLayers[0]
        if (activeLayer) {
          await action.batchPlay(
            [
              {
                _obj: 'set',
                _target: [
                  {
                    _ref: 'layer',
                    _id: activeLayer.id,
                  },
                ],
                to: {
                  _obj: 'layer',
                  name: layerName,
                },
                _options: {
                  dialogOptions: 'dontDisplay',
                },
              },
            ],
            { synchronousExecution: false },
          )
        }
      },
      { commandName: 'Place AI Generated Image' },
    )

    console.log(`Image placed as layer: ${layerName}`)
    return true
  } catch (error) {
    console.error('Failed to place image as layer:', error)
    return false
  }
}

/**
 * Check if there's an active document to place images into.
 */
export function hasActiveDocument(): boolean {
  return app.activeDocument !== null
}

/**
 * Maximum input image size for upscaling (longest edge in pixels).
 */
const MAX_UPSCALE_INPUT_SIZE = 2048

/**
 * Get the active document's flattened image as base64 PNG.
 * This captures all visible layers merged together.
 */
export async function getDocumentImageBase64(): Promise<string> {
  const doc = app.activeDocument
  if (!doc) {
    throw new Error('No active document')
  }

  // Check image size
  const longestSide = Math.max(doc.width, doc.height)
  if (longestSide > MAX_UPSCALE_INPUT_SIZE) {
    throw new Error(
      `Image too large (${longestSide}px). Maximum is ${MAX_UPSCALE_INPUT_SIZE}px on longest side.`,
    )
  }

  return new Promise((resolve, reject) => {
    core.executeAsModal(
      async () => {
        try {
          // Duplicate document to avoid modifying original
          await action.batchPlay(
            [
              {
                _obj: 'duplicate',
                _target: [{ _ref: 'document', _enum: 'ordinal', _value: 'targetEnum' }],
                name: 'temp_export',
                _options: { dialogOptions: 'dontDisplay' },
              },
            ],
            { synchronousExecution: false },
          )

          // Flatten the duplicate
          await action.batchPlay(
            [
              {
                _obj: 'flattenImage',
                _options: { dialogOptions: 'dontDisplay' },
              },
            ],
            { synchronousExecution: false },
          )

          // Get temporary folder and create file
          const tempFolder = await storage.localFileSystem.getTemporaryFolder()
          const fileName = `export_${Date.now()}.png`
          const tempFile = await tempFolder.createFile(fileName, { overwrite: true })
          const fileToken = storage.localFileSystem.createSessionToken(tempFile)

          // Export as PNG
          await action.batchPlay(
            [
              {
                _obj: 'save',
                as: {
                  _obj: 'PNGFormat',
                  method: { _enum: 'PNGMethod', _value: 'moderate' },
                },
                in: { _path: fileToken, _kind: 'local' },
                copy: true,
                _options: { dialogOptions: 'dontDisplay' },
              },
            ],
            { synchronousExecution: false },
          )

          // Close duplicate without saving
          await action.batchPlay(
            [
              {
                _obj: 'close',
                saving: { _enum: 'yesNo', _value: 'no' },
                _options: { dialogOptions: 'dontDisplay' },
              },
            ],
            { synchronousExecution: false },
          )

          // Read file as ArrayBuffer and convert to base64
          const arrayBuffer = await tempFile.read({ format: storage.formats.binary })
          const bytes = new Uint8Array(arrayBuffer as ArrayBuffer)
          let binary = ''
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i])
          }
          const base64 = btoa(binary)

          resolve(base64)
        } catch (error) {
          reject(error)
        }
      },
      { commandName: 'Export Document' },
    )
  })
}

/**
 * Get a specific layer's image as base64 PNG.
 */
export async function getLayerImageBase64(layerId: number): Promise<string> {
  const doc = app.activeDocument
  if (!doc) {
    throw new Error('No active document')
  }

  // Find the layer
  // Note: This simple search only finds top-level layers. 
  // If we need nested layers, we need a recursive search or use batchPlay to select by ID.
  const layer = doc.layers.find(l => l.id === layerId)
  if (!layer) {
    throw new Error(`Layer ${layerId} not found`)
  }

  return new Promise((resolve, reject) => {
    core.executeAsModal(
      async () => {
        try {
          // 1. Select the layer
          await action.batchPlay(
            [
              {
                _obj: 'select',
                _target: [{ _ref: 'layer', _id: layerId }],
                makeVisible: false,
                layerID: [layerId],
                _options: { dialogOptions: 'dontDisplay' },
              },
            ],
            { synchronousExecution: false },
          )

          // 2. Duplicate to new document to isolate it
          // "Duplicate Layer..." to a new document
          await action.batchPlay(
            [
              {
                _obj: 'duplicate',
                _target: [{ _ref: 'layer', _enum: 'ordinal', _value: 'targetEnum' }],
                version: 5,
                name: 'temp_layer_export',
                document: {
                    _obj: 'document',
                    mode: { _enum: 'colorSpace', _value: 'RGBColor' },
                    fill: { _enum: 'fillMode', _value: 'transparent' },
                    name: 'temp_layer_doc'
                },
                _options: { dialogOptions: 'dontDisplay' },
              },
            ],
            { synchronousExecution: false },
          )

          // Now the new document is active.
          
          // 3. Trim transparency (optional, but good for controlnet)
          await action.batchPlay(
            [
              {
                _obj: 'trim',
                basedOn: { _enum: 'trimBasedOn', _value: 'transparency' },
                top: true,
                bottom: true,
                left: true,
                right: true,
                _options: { dialogOptions: 'dontDisplay' },
              },
            ],
            { synchronousExecution: false },
          )

          // 4. Save as PNG (same as getDocumentImageBase64)
          const tempFolder = await storage.localFileSystem.getTemporaryFolder()
          const fileName = `layer_export_${Date.now()}.png`
          const tempFile = await tempFolder.createFile(fileName, { overwrite: true })
          const fileToken = storage.localFileSystem.createSessionToken(tempFile)

          await action.batchPlay(
            [
              {
                _obj: 'save',
                as: {
                  _obj: 'PNGFormat',
                  method: { _enum: 'PNGMethod', _value: 'moderate' },
                },
                in: { _path: fileToken, _kind: 'local' },
                copy: true,
                _options: { dialogOptions: 'dontDisplay' },
              },
            ],
            { synchronousExecution: false },
          )

          // 5. Close temp document
          await action.batchPlay(
            [
              {
                _obj: 'close',
                saving: { _enum: 'yesNo', _value: 'no' },
                _options: { dialogOptions: 'dontDisplay' },
              },
            ],
            { synchronousExecution: false },
          )

          // 6. Read file
          const arrayBuffer = await tempFile.read({ format: storage.formats.binary })
          const bytes = new Uint8Array(arrayBuffer as ArrayBuffer)
          let binary = ''
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i])
          }
          const base64 = btoa(binary)

          resolve(base64)
        } catch (error) {
          reject(error)
        }
      },
      { commandName: 'Export Layer' },
    )
  })
}

/**
 * Get active document info.
 */
export function getActiveDocumentInfo(): {
  name: string
  width: number
  height: number
} | null {
  const doc = app.activeDocument
  if (!doc) return null

  return {
    name: doc.name,
    width: doc.width,
    height: doc.height,
  }
}

export interface LayerInfo {
  id: number
  name: string
  kind: string
  visible: boolean
}

/**
 * Get all layers in the active document.
 */
export function getLayers(): LayerInfo[] {
  const doc = app.activeDocument
  if (!doc) return []
  
  // Note: This only gets top-level layers. 
  // For nested layers, we'd need recursive traversal, but UXP API structure 
  // for that depends on the specific Photoshop version/API level.
  // For now, returning top-level layers is a good start.
  return doc.layers.map(l => ({
    id: l.id,
    name: l.name,
    kind: l.kind,
    visible: l.visible,
  }))
}

/**
 * Find a layer by name prefix in the active document.
 * Returns the layer ID if found, null otherwise.
 */
export function findLayerByNamePrefix(prefix: string): number | null {
  const doc = app.activeDocument
  if (!doc) return null

  for (const layer of doc.layers) {
    if (layer.name.startsWith(prefix)) {
      return layer.id
    }
  }
  return null
}

/**
 * Delete a layer by ID.
 */
export async function deleteLayer(layerId: number): Promise<boolean> {
  const doc = app.activeDocument
  if (!doc) return false

  try {
    await core.executeAsModal(
      async () => {
        await action.batchPlay(
          [
            {
              _obj: 'delete',
              _target: [
                {
                  _ref: 'layer',
                  _id: layerId,
                },
              ],
              _options: {
                dialogOptions: 'dontDisplay',
              },
            },
          ],
          { synchronousExecution: false },
        )
      },
      { commandName: 'Delete Layer' },
    )
    return true
  } catch (error) {
    console.error('Failed to delete layer:', error)
    return false
  }
}

/**
 * Truncate prompt to specified length for layer naming.
 */
function truncatePrompt(prompt: string, maxLength: number): string {
  const trimmed = prompt.trim()
  if (trimmed.length <= maxLength) return trimmed
  return trimmed.slice(0, maxLength).trim()
}

const PREVIEW_LAYER_PREFIX = '[Preview] '

/**
 * Update the preview layer with a new image.
 * Creates the layer if it doesn't exist, or replaces its content if it does.
 */
export async function updatePreviewLayer(
  imageBase64: string,
  prompt: string,
): Promise<boolean> {
  const doc = app.activeDocument
  if (!doc) {
    console.error('No active document')
    return false
  }

  // Find and delete existing preview layer
  const existingLayerId = findLayerByNamePrefix(PREVIEW_LAYER_PREFIX)
  if (existingLayerId !== null) {
    await deleteLayer(existingLayerId)
  }

  // Create new preview layer with the image
  const layerName = `${PREVIEW_LAYER_PREFIX}${truncatePrompt(prompt, 10)}`
  return placeImageAsLayer(imageBase64, layerName)
}

/**
 * Apply an image as a permanent layer (not preview).
 */
export async function applyAsLayer(
  imageBase64: string,
  prompt: string,
  seed: number,
): Promise<boolean> {
  const layerName = `[Generated] ${truncatePrompt(prompt, 10)} (${seed})`
  return placeImageAsLayer(imageBase64, layerName)
}

/**
 * Delete the preview layer if it exists.
 */
export async function deletePreviewLayer(): Promise<boolean> {
  const existingLayerId = findLayerByNamePrefix(PREVIEW_LAYER_PREFIX)
  if (existingLayerId !== null) {
    return deleteLayer(existingLayerId)
  }
  return true
}
