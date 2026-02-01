import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { getStyles } from '../services/bridge-client'
import type { Style } from '../types'

interface StylesContextValue {
  styles: Style[]
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
}

const StylesContext = createContext<StylesContextValue | null>(null)

export function StylesProvider({ children }: { children: ReactNode }) {
  const [styles, setStyles] = useState<Style[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStyles = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await getStyles()
      setStyles(response.styles)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load styles')
      // Keep existing styles on error
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchStyles()
  }, [])

  return (
    <StylesContext.Provider
      value={{
        styles,
        isLoading,
        error,
        refetch: fetchStyles,
      }}
    >
      {children}
    </StylesContext.Provider>
  )
}

export function useStyles() {
  const context = useContext(StylesContext)
  if (!context) {
    throw new Error('useStyles must be used within StylesProvider')
  }
  return context
}
