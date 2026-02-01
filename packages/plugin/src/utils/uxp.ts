// UXP-specific utilities

interface UXPShell {
  openExternal(url: string, description?: string): Promise<void>
}

interface UXPModule {
  shell: UXPShell
}

declare const require: (module: string) => UXPModule

function getShell(): UXPShell | null {
  try {
    const uxp = require('uxp')
    if (uxp && uxp.shell) {
      return uxp.shell
    }
    console.warn('UXP shell not available')
    return null
  } catch (e) {
    console.warn('Failed to load UXP module:', e)
    return null
  }
}

export async function openBrowser(url: string): Promise<boolean> {
  const shell = getShell()
  if (shell) {
    try {
      console.log('Opening URL:', url)
      // Second parameter is required for user consent dialog
      await shell.openExternal(url, 'Open link in browser to complete sign-in')
      console.log('URL opened successfully')
      return true
    } catch (e) {
      console.error('Failed to open browser:', e)
      // Fallback: show the URL to user so they can copy it
      alert(`Please open this URL in your browser:\n${url}`)
      return false
    }
  } else {
    console.log('Shell not available, URL:', url)
    // Fallback: show the URL to user
    alert(`Please open this URL in your browser:\n${url}`)
    return false
  }
}
